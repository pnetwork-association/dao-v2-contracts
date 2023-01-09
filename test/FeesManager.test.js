/*const { expect } = require('chai')
const { ethers, upgrades, config } = require('hardhat')
const { time } = require('@nomicfoundation/hardhat-network-helpers')
const { getRole, getSentinelIdentity } = require('./utils')

let stakingManager,
  epochsManager,
  registrationManager,
  feesManager,
  borrowingManager,
  pnt,
  pbtc,
  owner,
  pntHolder1,
  pntHolder2,
  sentinel1,
  FeesManager

let BORROW_ROLE,
  INCREASE_BORROWABLE_AMOUNT_FOR_EPOCH_ROLE,
  INCREASE_BORROWABLE_AMOUNT_BY_DURATION_ROLE,
  RELEASE_SENTINEL,
  DEPOSIT_FEE

const STAKING_MANAGER_ADDRESS = '0xeb10e80D99655B51E3a981E888a73D0B21e21A6C'
const PNT_ADDRESS = '0x89Ab32156e46F46D02ade3FEcbe5Fc4243B9AAeD'
const PBTC_ADDRESS = '0x62199B909FB8B8cf870f97BEf2cE6783493c4908'
const PNT_HOLDER_1_ADDRESS = '0xaeaa8c6ebb17db8056fa30a08fd3097de555f571'
const PNT_HOLDER_2_ADDRESS = '0x98C3d3183C4b8A650614ad179A1a98be0a8d6B8E'
const EPOCH_DURATION = 1314001 // 2 weeks
const ONE_DAY = 86400
const REGISTRATION_STAKING = 1
const REGISTRATION_BORROWING = 2

describe('RegistrationManager', () => {
  beforeEach(async () => {
    await network.provider.request({
      method: 'hardhat_reset',
      params: [
        {
          forking: {
            jsonRpcUrl: config.networks.hardhat.forking.url
          }
        }
      ]
    })

    FeesManager = await ethers.getContractFactory('FeesManager')
    const RegistrationManager = await ethers.getContractFactory('RegistrationManager')
    const BorrowingManager = await ethers.getContractFactory('BorrowingManager')
    const EpochsManager = await ethers.getContractFactory('EpochsManager')
    const StakingManager = await ethers.getContractFactory('StakingManager')
    const ERC20 = await ethers.getContractFactory('ERC20')

    const signers = await ethers.getSigners()
    owner = signers[0]
    sentinel1 = signers[1]
    user1 = signers[2]
    pntHolder1 = await ethers.getImpersonatedSigner(PNT_HOLDER_1_ADDRESS)
    pntHolder2 = await ethers.getImpersonatedSigner(PNT_HOLDER_2_ADDRESS)

    stakingManager = await StakingManager.attach(STAKING_MANAGER_ADDRESS)
    pnt = await ERC20.attach(PNT_ADDRESS)
    pbtc = await ERC20.attach(PBTC_ADDRESS)

    epochsManager = await upgrades.deployProxy(EpochsManager, [EPOCH_DURATION], {
      initializer: 'initialize',
      kind: 'uups'
    })

    borrowingManager = await upgrades.deployProxy(
      BorrowingManager,
      [stakingManager.address, pnt.address, epochsManager.address],
      {
        initializer: 'initialize',
        kind: 'uups'
      }
    )

    registrationManager = await upgrades.deployProxy(
      RegistrationManager,
      [stakingManager.address, pnt.address, epochsManager.address, borrowingManager.address],
      {
        initializer: 'initialize',
        kind: 'uups'
      }
    )

    feesManager = await upgrades.deployProxy(
      FeesManager,
      [epochsManager.address, borrowingManager.address, registrationManager.address],
      {
        initializer: 'initialize',
        kind: 'uups'
      }
    )

    // roles
    BORROW_ROLE = getRole('BORROW_ROLE')
    RELEASE_ROLE = getRole('RELEASE_ROLE')
    INCREASE_BORROWABLE_AMOUNT_FOR_EPOCH_ROLE = getRole('INCREASE_BORROWABLE_AMOUNT_FOR_EPOCH_ROLE')
    INCREASE_BORROWABLE_AMOUNT_BY_DURATION_ROLE = getRole('INCREASE_BORROWABLE_AMOUNT_BY_DURATION_ROLE')
    RELEASE_SENTINEL = getRole('RELEASE_SENTINEL')

    // grant roles
    await borrowingManager.grantRole(INCREASE_BORROWABLE_AMOUNT_FOR_EPOCH_ROLE, owner.address)
    await borrowingManager.grantRole(INCREASE_BORROWABLE_AMOUNT_BY_DURATION_ROLE, owner.address)
    await borrowingManager.grantRole(BORROW_ROLE, registrationManager.address)
    await borrowingManager.grantRole(RELEASE_ROLE, registrationManager.address)
    await registrationManager.grantRole(RELEASE_SENTINEL, owner.address)
  })

  it('', async () => {    
    //   pntHolder1 - stake - 1
    //
    //                  200k  
    //   |-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxxx-----|
    //   0          1          2          3          4           5
    //
    //   pntHolder1 - updateSentinelRegistration - 1
    //
    //   |----------|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|
    //   0          1          2          3          4           5
    //
    //
    //   pntHolder1 - stake - 2
    //
    //                                          200k       200k       200k
    //   |----------|----------|-----xxxxx|vvvvvvvvvv|vvvvvvvvvvv|vvvvvvvvv|xxxxx
    //   0          1          2          3          4           5         6
    //
    //   pntHolder1 - updateSentinelRegistration - 2
    //
    //   |----------|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|
    //   0          1          2          3          4           5
    //
    const stakeAmountPntHolder1 = ethers.utils.parseEther('200000')
    const lockTime = EPOCH_DURATION * 2
    await pnt.connect(pntHolder1).approve(stakingManager.address, stakeAmountPntHolder1)
    await stakingManager.connect(pntHolder1).stake(stakeAmountPntHolder1, lockTime, pntHolder1.address)
    await pnt.connect(pntHolder1).approve(stakingManager.address, stakeAmountPntHolder1)
    await stakingManager.connect(pntHolder1).stake(stakeAmountPntHolder1, lockTime, pntHolder1.address)

    const signature = await getSentinelIdentity(pntHolder1.address, { sentinel: sentinel1 })
    await expect(registrationManager.connect(pntHolder1).updateSentinelRegistration(1, signature))
    .to.emit(registrationManager, 'SentinelRegistrationUpdated')
    .withArgs(pntHolder1.address, 1, 1, sentinel1.address, REGISTRATION_STAKING)

    await stakingManager.connect(pntHolder1).increaseLockDuration(0, lockTime)

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)
    await expect( registrationManager.connect(pntHolder1).updateSentinelRegistration(1, signature))
    .to.emit(registrationManager, 'SentinelRegistrationUpdated')
    .withArgs(pntHolder1.address, 3, 3, sentinel1.address, REGISTRATION_STAKING)

    await feesManager.connect(pntHolder1).claimFee(pnt.address, 1)
    await feesManager.connect(pntHolder1).claimFee(pnt.address, 2)
    await feesManager.connect(pntHolder1).claimFee(pnt.address, 3)
  })
})*/
