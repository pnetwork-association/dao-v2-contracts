const { expect } = require('chai')
const { ethers, upgrades, config } = require('hardhat')
const { time } = require('@nomicfoundation/hardhat-network-helpers')
const { getRole, parseWithPrecision } = require('./utils')

let stakingManager, epochsManager, pnt, owner, pntHolder1, pntHolder2, user1, user2, BorrowingManager
let BORROW_ROLE, INCREASE_BORROWABLE_AMOUNT_FOR_EPOCH_ROLE, INCREASE_BORROWABLE_AMOUNT_BY_DURATION_ROLE, DEPOSIT_INTEREST

const STAKING_MANAGER_ADDRESS = '0xeb10e80D99655B51E3a981E888a73D0B21e21A6C'
const PNT_ADDRESS = '0x89Ab32156e46F46D02ade3FEcbe5Fc4243B9AAeD'
const PNT_HOLDER_1_ADDRESS = '0xaeaa8c6ebb17db8056fa30a08fd3097de555f571'
const PNT_HOLDER_2_ADDRESS = '0x98C3d3183C4b8A650614ad179A1a98be0a8d6B8E'
const EPOCH_DURATION = 1314001 // 2 weeks
const ONE_DAY = 86400
const MIN_AMOUNT = '0'
const MAX_AMOUNT = '10000000000000000000000000'
const INFINITE = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
const LEND_MAX_EPOCHS = 100

describe('BorrowingManagerV2', () => {
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

    BorrowingManager = await ethers.getContractFactory('BorrowingManagerV2')
    const EpochsManager = await ethers.getContractFactory('EpochsManager')
    const StakingManager = await ethers.getContractFactory('StakingManager')
    const ERC20 = await ethers.getContractFactory('ERC20')

    const signers = await ethers.getSigners()
    owner = signers[0]
    user1 = signers[1]
    user2 = signers[2]
    pntHolder1 = await ethers.getImpersonatedSigner(PNT_HOLDER_1_ADDRESS)
    pntHolder2 = await ethers.getImpersonatedSigner(PNT_HOLDER_2_ADDRESS)

    stakingManager = await StakingManager.attach(STAKING_MANAGER_ADDRESS)
    pnt = await ERC20.attach(PNT_ADDRESS)

    epochsManager = await upgrades.deployProxy(EpochsManager, [EPOCH_DURATION], {
      initializer: 'initialize',
      kind: 'uups'
    })

    borrowingManager = await upgrades.deployProxy(BorrowingManager, [stakingManager.address, pnt.address, epochsManager.address, LEND_MAX_EPOCHS], {
      initializer: 'initialize',
      kind: 'uups'
    })

    // roles
    BORROW_ROLE = getRole('BORROW_ROLE')
    RELEASE_ROLE = getRole('RELEASE_ROLE')
    INCREASE_BORROWABLE_AMOUNT_FOR_EPOCH_ROLE = getRole('INCREASE_BORROWABLE_AMOUNT_FOR_EPOCH_ROLE')
    INCREASE_BORROWABLE_AMOUNT_BY_DURATION_ROLE = getRole('INCREASE_BORROWABLE_AMOUNT_BY_DURATION_ROLE')
    DEPOSIT_INTEREST = getRole('DEPOSIT_INTEREST')

    // grant roles
    await borrowingManager.grantRole(INCREASE_BORROWABLE_AMOUNT_FOR_EPOCH_ROLE, owner.address)
    await borrowingManager.grantRole(INCREASE_BORROWABLE_AMOUNT_BY_DURATION_ROLE, owner.address)
    await borrowingManager.grantRole(BORROW_ROLE, owner.address)
    await borrowingManager.grantRole(BORROW_ROLE, user1.address)
    await borrowingManager.grantRole(BORROW_ROLE, user2.address)
    await borrowingManager.grantRole(RELEASE_ROLE, owner.address)
    await borrowingManager.grantRole(DEPOSIT_INTEREST, owner.address)

    await owner.sendTransaction({
      to: pntHolder1.address,
      value: ethers.utils.parseEther('10')
    })
    await owner.sendTransaction({
      to: pntHolder2.address,
      value: ethers.utils.parseEther('10')
    })
  })

  it('should update correctly the number of epochs left when a lend happens with all possible epochs duration combinations', async () => {
    const depositAmount = ethers.utils.parseEther('100')
    await pnt.connect(pntHolder1).approve(borrowingManager.address, INFINITE)
    await pnt.connect(pntHolder2).approve(borrowingManager.address, INFINITE)
    await pnt.approve(borrowingManager.address, INFINITE)

    await borrowingManager.connect(pntHolder1).lend(depositAmount, EPOCH_DURATION * 2, pntHolder1.address)
    await borrowingManager.connect(pntHolder1).lend(depositAmount, EPOCH_DURATION * 2, pntHolder1.address)

    console.log((await borrowingManager.totalWeightByEpoch(0)).toString())
    console.log((await borrowingManager.totalWeightByEpoch(1)).toString())

    // await borrowingManager.connect(pntHolder1).lend(depositAmount, EPOCH_DURATION * 4, pntHolder1.address)
  })
})
