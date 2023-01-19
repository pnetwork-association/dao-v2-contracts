const { expect } = require('chai')
const { ethers, upgrades, config } = require('hardhat')
const { time } = require('@nomicfoundation/hardhat-network-helpers')
const { getRole, getSentinelIdentity } = require('./utils')

let stakingManager, epochsManager, registrationManager, feesManager, borrowingManager, pnt, owner, pntHolder1, sentinel1, sentinel2, FeesManager

let BORROW_ROLE, INCREASE_BORROWABLE_AMOUNT_FOR_EPOCH_ROLE, INCREASE_BORROWABLE_AMOUNT_BY_DURATION_ROLE, RELEASE_SENTINEL_ROLE

const STAKING_MANAGER_ADDRESS = '0xeb10e80D99655B51E3a981E888a73D0B21e21A6C'
const PNT_ADDRESS = '0x89Ab32156e46F46D02ade3FEcbe5Fc4243B9AAeD'
const PBTC_ADDRESS = '0x62199B909FB8B8cf870f97BEf2cE6783493c4908'
const PNT_HOLDER_1_ADDRESS = '0xaeaa8c6ebb17db8056fa30a08fd3097de555f571'
const PNT_HOLDER_2_ADDRESS = '0xae0baf66e8f5bb87a6fd54066e469cdfe93212ec'
const EPOCH_DURATION = 1314001 // 2 weeks
const LEND_MAX_EPOCHS = 100
const MINIMUM_BORROWING_FEE = 0.3 * 10 ** 6 // 30%

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
    const BorrowingManager = await ethers.getContractFactory('BorrowingManagerV2')
    const EpochsManager = await ethers.getContractFactory('EpochsManager')
    const StakingManager = await ethers.getContractFactory('StakingManager')
    const ERC20 = await ethers.getContractFactory('ERC20')

    const signers = await ethers.getSigners()
    owner = signers[0]
    sentinel1 = signers[1]
    sentinel2 = signers[2]
    sentinelBorrowerRegistrator1 = signers[3]
    pntHolder1 = await ethers.getImpersonatedSigner(PNT_HOLDER_1_ADDRESS)
    pntHolder2 = await ethers.getImpersonatedSigner(PNT_HOLDER_2_ADDRESS)

    stakingManager = await StakingManager.attach(STAKING_MANAGER_ADDRESS)
    pnt = await ERC20.attach(PNT_ADDRESS)
    pbtc = await ERC20.attach(PBTC_ADDRESS)

    epochsManager = await upgrades.deployProxy(EpochsManager, [EPOCH_DURATION], {
      initializer: 'initialize',
      kind: 'uups'
    })

    borrowingManager = await upgrades.deployProxy(BorrowingManager, [stakingManager.address, pnt.address, epochsManager.address, LEND_MAX_EPOCHS], {
      initializer: 'initialize',
      kind: 'uups'
    })

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
      [stakingManager.address, epochsManager.address, borrowingManager.address, registrationManager.address, MINIMUM_BORROWING_FEE],
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
    RELEASE_SENTINEL_ROLE = getRole('RELEASE_SENTINEL_ROLE')
    DEPOSIT_INTEREST_ROLE = getRole('DEPOSIT_INTEREST_ROLE')

    // grant roles
    await borrowingManager.grantRole(INCREASE_BORROWABLE_AMOUNT_FOR_EPOCH_ROLE, owner.address)
    await borrowingManager.grantRole(INCREASE_BORROWABLE_AMOUNT_BY_DURATION_ROLE, owner.address)
    await borrowingManager.grantRole(BORROW_ROLE, registrationManager.address)
    await borrowingManager.grantRole(RELEASE_ROLE, registrationManager.address)
    await borrowingManager.grantRole(DEPOSIT_INTEREST_ROLE, feesManager.address)
    await registrationManager.grantRole(RELEASE_SENTINEL_ROLE, owner.address)
  })

  it('borrowers should not be able to earn anything when utilization ratio is 100%', async () => {
    //   pntHolder1 - lend
    //                   200k       200k        200k
    //   |-----xxxxx|vvvvvvvvvv-|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4           5
    //
    //
    //   pntHolder2 - updateSentinelRegistrationByStaking
    //                   200k       200k        200k
    //   |-----xxxxx|vvvvvvvvvv-|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4           5
    //
    //
    //
    //   sentinelBorrowerRegistrator1 - updateSentinelRegistrationByBorrowing
    //
    //                  200k      200k      200k
    //   |----------|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|
    //   0          1          2          3          4          5
    //
    //
    //   claim(1): utilizationRatio = 100%, totalStaked = 200k, totalBorrowed = 200k -> FeesManager keep 50% (200k / 400k) and lenders
    //   keeps other 200k (other 50%). In this case borrowers don't earn anything
    //

    const stakeAmount = ethers.utils.parseEther('200000')
    const lockTime = EPOCH_DURATION * 4

    const lendAmount = ethers.utils.parseEther('200000')
    const borrowAmount = ethers.utils.parseEther('200000')
    await pnt.connect(pntHolder1).approve(borrowingManager.address, lendAmount)
    await borrowingManager.connect(pntHolder1).lend(lendAmount, EPOCH_DURATION * 10, pntHolder1.address)

    const signature1 = await getSentinelIdentity(pntHolder2.address, { sentinel: sentinel1 })
    await pnt.connect(pntHolder2).approve(registrationManager.address, stakeAmount)
    await registrationManager.connect(pntHolder2).updateSentinelRegistrationByStaking(stakeAmount, lockTime, signature1)

    const signature2 = await getSentinelIdentity(sentinelBorrowerRegistrator1.address, { sentinel: sentinel2 })
    await registrationManager.connect(sentinelBorrowerRegistrator1).updateSentinelRegistrationByBorrowing(borrowAmount, 3, signature2)

    await time.increase(EPOCH_DURATION)

    const fee = ethers.utils.parseEther('100')
    await pnt.connect(pntHolder1).approve(feesManager.address, fee)
    await feesManager.connect(pntHolder1).depositFee(pnt.address, fee)

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    await expect(feesManager.connect(pntHolder2).claimFeeByEpoch(pnt.address, 1))
      .to.emit(feesManager, 'FeeClaimed')
      .withArgs(pntHolder2.address, sentinel1.address, 1, pnt.address, fee.div(2))
    await expect(feesManager.connect(sentinelBorrowerRegistrator1).claimFeeByEpoch(pnt.address, 1)).to.be.revertedWithCustomError(
      feesManager,
      'NothingToClaim'
    )
    await expect(borrowingManager.connect(pntHolder1).claimInterestByEpoch(pnt.address, 1))
      .to.emit(borrowingManager, 'InterestClaimed')
      .withArgs(pntHolder1.address, pnt.address, 1, fee.div(2))
  })
})
