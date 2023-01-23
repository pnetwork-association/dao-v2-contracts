const { expect } = require('chai')
const { ethers, upgrades, config } = require('hardhat')
const { time } = require('@nomicfoundation/hardhat-network-helpers')
const { getRole, truncateWithPrecision } = require('./utils')

let stakingManager, epochsManager, pnt, owner, pntHolder1, pntHolder2, user1, user2, BorrowingManager
let BORROW_ROLE, INCREASE_BORROWABLE_AMOUNT_FOR_EPOCH_ROLE, INCREASE_BORROWABLE_AMOUNT_BY_DURATION_ROLE, DEPOSIT_INTEREST_ROLE

const STAKING_MANAGER_ADDRESS = '0xeb10e80D99655B51E3a981E888a73D0B21e21A6C'
const PNT_ADDRESS = '0x89Ab32156e46F46D02ade3FEcbe5Fc4243B9AAeD'
const PNT_HOLDER_1_ADDRESS = '0xaeaa8c6ebb17db8056fa30a08fd3097de555f571'
const PNT_HOLDER_2_ADDRESS = '0xae0baf66e8f5bb87a6fd54066e469cdfe93212ec'
const EPOCH_DURATION = 1314001 // 2 weeks
const ONE_DAY = 86400
const MIN_AMOUNT = '0'
const MAX_AMOUNT = '10000000000000000000000000'
const INFINITE = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
const LEND_MAX_EPOCHS = 100

describe('BorrowingManager', () => {
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

    BorrowingManager = await ethers.getContractFactory('BorrowingManager')
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
    DEPOSIT_INTEREST_ROLE = getRole('DEPOSIT_INTEREST_ROLE')

    // grant roles
    await borrowingManager.grantRole(INCREASE_BORROWABLE_AMOUNT_FOR_EPOCH_ROLE, owner.address)
    await borrowingManager.grantRole(INCREASE_BORROWABLE_AMOUNT_BY_DURATION_ROLE, owner.address)
    await borrowingManager.grantRole(BORROW_ROLE, owner.address)
    await borrowingManager.grantRole(BORROW_ROLE, user1.address)
    await borrowingManager.grantRole(BORROW_ROLE, user2.address)
    await borrowingManager.grantRole(RELEASE_ROLE, owner.address)
    await borrowingManager.grantRole(DEPOSIT_INTEREST_ROLE, owner.address)

    await owner.sendTransaction({
      to: pntHolder1.address,
      value: ethers.utils.parseEther('10')
    })
    await owner.sendTransaction({
      to: pntHolder2.address,
      value: ethers.utils.parseEther('10')
    })
  })

  /*it('should be able to lend at the epoch 0 for 2 epochs (epoch 1 & 2) even if the lockTime finishes at epoch 3', async () => {
    const amount = ethers.utils.parseEther('1000')
    const lockTime = EPOCH_DURATION * 2 + ONE_DAY
    const currentEpoch = parseInt(await epochsManager.currentEpoch())
    const epochDuration = parseInt(await epochsManager.epochDuration())
    const epochs = parseInt(lockTime / epochDuration)

    await pnt.connect(pntHolder1).approve(borrowingManager.address, amount)

    await expect(borrowingManager.connect(pntHolder1).lend(amount, lockTime, pntHolder1.address))
      .to.emit(borrowingManager, 'Lended')
      .withArgs(pntHolder1.address, currentEpoch + 1, currentEpoch + epochs - 1, amount)
    for (let epoch = currentEpoch + 1; epoch < epochs; epoch++) {
      expect(await borrowingManager.borrowableAmountByEpoch(epoch)).to.be.eq(truncateWithPrecision(amount))
    }

    // the lend above becomes available in the next epoch
    expect(await borrowingManager.borrowableAmountByEpoch(currentEpoch)).to.be.eq(0)
    expect(await borrowingManager.borrowableAmountByEpoch(currentEpoch + 1 + epochs)).to.be.eq(0)
  })

  it('should be able to lend in the middle of epoch 0 for 2 epochs (epoch 1 & 2) even if the lockTime finishes at epoch 3', async () => {
    const amount = ethers.utils.parseEther('1000')
    const lockTime = EPOCH_DURATION * 2 + ONE_DAY
    const currentEpoch = parseInt(await epochsManager.currentEpoch())
    const epochDuration = parseInt(await epochsManager.epochDuration())
    const epochs = parseInt(lockTime / epochDuration)

    await time.increase(parseInt(EPOCH_DURATION / 2))
    await pnt.connect(pntHolder1).approve(borrowingManager.address, amount)

    await borrowingManager.connect(pntHolder1).lend(amount, lockTime, pntHolder1.address)
    for (let epoch = currentEpoch + 1; epoch < epochs; epoch++) {
      expect(await borrowingManager.borrowableAmountByEpoch(epoch)).to.be.eq(truncateWithPrecision(amount))
    }

    // the lend above becomes available in the next epoch
    expect(await borrowingManager.borrowableAmountByEpoch(currentEpoch)).to.be.eq(0)
    expect(await borrowingManager.borrowableAmountByEpoch(currentEpoch + 1 + epochs)).to.be.eq(0)
  })

  it('should not be able to borrow for 2 epochs if the corresponding borrowed amount is available just for 1 epochs', async () => {
    //   |-----xxxxx|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3
    const amount = ethers.utils.parseEther('1000')
    const lockTime = EPOCH_DURATION * 2
    await pnt.connect(pntHolder1).approve(borrowingManager.address, amount)
    await borrowingManager.connect(pntHolder1).lend(amount, lockTime, pntHolder1.address)
    await expect(borrowingManager.borrow(amount, 2, owner.address, MIN_AMOUNT, MAX_AMOUNT)).to.be.revertedWithCustomError(
      borrowingManager,
      'AmountNotAvailableInEpoch'
    )
  })

  it('should not be able to borrow for 0 epochs', async () => {
    await expect(borrowingManager.borrow(1, 0, owner.address, MIN_AMOUNT, MAX_AMOUNT)).to.be.revertedWithCustomError(
      borrowingManager,
      'InvalidNumberOfEpochs'
    )
  })

  it('should be be able to borrow for 1 epoch (at epoch 0 for epoch 1) if the lend happens in the middle of epoch 0 and the lockTime is equal to the epoch duration', async () => {
    //  |-----xxxxx|vvvvvvvvvv|xxxxx-----|
    //  0          1          2          3

    const amount = ethers.utils.parseEther('1000')
    const expectedNumberOfEpochs = 1
    const currentEpoch = parseInt(await epochsManager.currentEpoch())
    const lockTime = EPOCH_DURATION * 2
    await pnt.connect(pntHolder1).approve(borrowingManager.address, amount)
    await borrowingManager.connect(pntHolder1).lend(amount, lockTime, pntHolder1.address)

    expect(await borrowingManager.borrowableAmountByEpoch(0)).to.be.eq(0)
    expect(await borrowingManager.borrowableAmountByEpoch(1)).to.be.eq(truncateWithPrecision(amount))
    expect(await borrowingManager.borrowableAmountByEpoch(2)).to.be.eq(0)

    await expect(borrowingManager.borrow(amount, expectedNumberOfEpochs, owner.address, MIN_AMOUNT, MAX_AMOUNT))
      .to.emit(borrowingManager, 'Borrowed')
      .withArgs(owner.address, currentEpoch + 1, currentEpoch + expectedNumberOfEpochs, amount)

    expect(await borrowingManager.borrowedAmountByEpochOf(owner.address, 0)).to.be.eq(0)
    expect(await borrowingManager.borrowedAmountByEpochOf(owner.address, 1)).to.be.eq(truncateWithPrecision(amount))
    expect(await borrowingManager.borrowedAmountByEpochOf(owner.address, 2)).to.be.eq(0)

    expect(await borrowingManager.loanStartEpochOf(pntHolder1.address)).to.be.eq(1)
    expect(await borrowingManager.loanEndEpochOf(pntHolder1.address)).to.be.eq(1)
  })

  it('should be able to borrow for 3 epochs (at epoch 2 for epoch 3,4,5) if the lend happens in the middle of epoch 2', async () => {
    //   |----------|----------|----xxxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|
    //   0          1          2          3          4          5         6           7          8

    const amount = ethers.utils.parseEther('1000')
    const expectedNumberOfEpochs = 3
    const lockTime = EPOCH_DURATION * 4

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)
    const currentEpoch = parseInt(await epochsManager.currentEpoch())

    await pnt.connect(pntHolder1).approve(borrowingManager.address, amount)
    await borrowingManager.connect(pntHolder1).lend(amount, lockTime, pntHolder1.address)

    expect(await borrowingManager.borrowableAmountByEpoch(2)).to.be.eq(0)
    expect(await borrowingManager.borrowableAmountByEpoch(3)).to.be.eq(truncateWithPrecision(amount))
    expect(await borrowingManager.borrowableAmountByEpoch(4)).to.be.eq(truncateWithPrecision(amount))
    expect(await borrowingManager.borrowableAmountByEpoch(5)).to.be.eq(truncateWithPrecision(amount))
    expect(await borrowingManager.borrowableAmountByEpoch(6)).to.be.eq(0)

    await expect(borrowingManager.borrow(amount, expectedNumberOfEpochs, owner.address, MIN_AMOUNT, MAX_AMOUNT))
      .to.emit(borrowingManager, 'Borrowed')
      .withArgs(owner.address, currentEpoch + 1, currentEpoch + expectedNumberOfEpochs, amount)

    expect(await borrowingManager.borrowedAmountByEpochOf(owner.address, 2)).to.be.eq(0)
    expect(await borrowingManager.borrowedAmountByEpochOf(owner.address, 3)).to.be.eq(truncateWithPrecision(amount))
    expect(await borrowingManager.borrowedAmountByEpochOf(owner.address, 4)).to.be.eq(truncateWithPrecision(amount))
    expect(await borrowingManager.borrowedAmountByEpochOf(owner.address, 5)).to.be.eq(truncateWithPrecision(amount))
    expect(await borrowingManager.borrowedAmountByEpochOf(owner.address, 6)).to.be.eq(0)

    expect(await borrowingManager.loanStartEpochOf(pntHolder1.address)).to.be.eq(3)
    expect(await borrowingManager.loanEndEpochOf(pntHolder1.address)).to.be.eq(5)
  })

  it('should be able to borrow for 3 epochs (at epoch 2 for epoch 3,4,5) if the lend happens in the middle of epoch 2 for 2 users', async () => {
    //   pntHolder1
    //                                          2k        2k         2k
    //   |----------|----------|----xxxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|
    //   0          1          2          3          4          5          6           7         8
    //
    //   result
    //                                          2k        2k          2k
    //   |----------|----------|----xxxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|
    //   0          1          2          3          4          5          6           7         8
    //
    //   user1
    //                                          1k        1k         1k
    //   |----------|----------|----------|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|----------|
    //   0          1          2          3          4          5          6          7          8
    //
    //   user2
    //                                          1k        1k         1k
    //   |----------|----------|----------|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|----------|
    //   0          1          2          3          4          5          6          7          8

    const depositAmount = ethers.utils.parseEther('2000')
    const borrowAmount = ethers.utils.parseEther('1000')
    const lockTime = EPOCH_DURATION * 4
    const expectedNumberOfEpochs = 3

    await time.increase(EPOCH_DURATION * 2)

    expect(await epochsManager.currentEpoch()).to.be.equal(2)
    const currentEpoch = parseInt(await epochsManager.currentEpoch())

    await pnt.connect(pntHolder1).approve(borrowingManager.address, depositAmount)
    await borrowingManager.connect(pntHolder1).lend(depositAmount, lockTime, pntHolder1.address)
    expect(await borrowingManager.loanStartEpochOf(pntHolder1.address)).to.be.eq(3)
    expect(await borrowingManager.loanEndEpochOf(pntHolder1.address)).to.be.eq(5)

    expect(await borrowingManager.borrowableAmountByEpoch(2)).to.be.eq(0)
    expect(await borrowingManager.borrowableAmountByEpoch(3)).to.be.eq(truncateWithPrecision(depositAmount))
    expect(await borrowingManager.borrowableAmountByEpoch(4)).to.be.eq(truncateWithPrecision(depositAmount))
    expect(await borrowingManager.borrowableAmountByEpoch(5)).to.be.eq(truncateWithPrecision(depositAmount))
    expect(await borrowingManager.borrowableAmountByEpoch(6)).to.be.eq(0)

    await expect(borrowingManager.borrow(borrowAmount, expectedNumberOfEpochs, user2.address, MIN_AMOUNT, MAX_AMOUNT))
      .to.emit(borrowingManager, 'Borrowed')
      .withArgs(user2.address, currentEpoch + 1, currentEpoch + expectedNumberOfEpochs, borrowAmount)

    expect(await borrowingManager.borrowedAmountByEpochOf(user2.address, 2)).to.be.eq(0)
    expect(await borrowingManager.borrowedAmountByEpochOf(user2.address, 3)).to.be.eq(truncateWithPrecision(borrowAmount))
    expect(await borrowingManager.borrowedAmountByEpochOf(user2.address, 4)).to.be.eq(truncateWithPrecision(borrowAmount))
    expect(await borrowingManager.borrowedAmountByEpochOf(user2.address, 5)).to.be.eq(truncateWithPrecision(borrowAmount))
    expect(await borrowingManager.borrowedAmountByEpochOf(user2.address, 6)).to.be.eq(0)

    await expect(borrowingManager.connect(user1).borrow(borrowAmount, expectedNumberOfEpochs, user1.address, MIN_AMOUNT, MAX_AMOUNT))
      .to.emit(borrowingManager, 'Borrowed')
      .withArgs(user1.address, currentEpoch + 1, currentEpoch + expectedNumberOfEpochs, borrowAmount)

    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 2)).to.be.eq(0)
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 3)).to.be.eq(truncateWithPrecision(borrowAmount))
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 4)).to.be.eq(truncateWithPrecision(borrowAmount))
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 5)).to.be.eq(truncateWithPrecision(borrowAmount))
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 6)).to.be.eq(0)
  })

  it('should pntHolder1 lend 1k pnt for 3 epochs and pntHolder2 2k pnt for 5 epochs at the epoch 2 and user1 borrowing 2k pnt for 4 epochs and user2 borrowing 1k pnt for 2 epochs', async () => {
    //   pntHolder1
    //                                          1k        1k
    //   |----------|----------|----xxxxxx|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|----------|
    //   0          1          2          3          4          5          6          7          8
    //
    //   pntHolder2
    //                                          2k        2k         2k         2k
    //   |----------|----------|----xxxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4          5          6          7          8
    //
    //   result
    //                                          3k        3k         2k         2k
    //   |----------|----------|----xxxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4          5          6          7          8
    //
    //   user1
    //                                          2k        2k         2k         2k
    //   |----------|----------|----------|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|
    //   0          1          2          3          4          5          6          7          8
    //
    //   user2
    //                                          1k        1k
    //   |----------|----------|----------|vvvvvvvvvv|vvvvvvvvvv|----------|----------|----------|
    //   0          1          2          3          4          5          6          7          8

    const depositAmountPntHolder1 = ethers.utils.parseEther('1000')
    const depositAmountPntHolder2 = ethers.utils.parseEther('2000')
    const depositAmountPntHolder12 = depositAmountPntHolder1.add(depositAmountPntHolder2)
    const borrowAmountUser1 = ethers.utils.parseEther('2000')
    const borrowAmountUser2 = ethers.utils.parseEther('1000')
    const expectedNumberOfEpochsUser1 = 4
    const expectedNumberOfEpochsUser2 = 2
    const lockTimePntHolder1 = EPOCH_DURATION * 3
    const lockTimePntHolder2 = EPOCH_DURATION * 5
    const expectedEpoch = 3

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    await pnt.connect(pntHolder1).approve(borrowingManager.address, depositAmountPntHolder1)
    await borrowingManager.connect(pntHolder1).lend(depositAmountPntHolder1, lockTimePntHolder1, pntHolder1.address)
    expect(await borrowingManager.loanStartEpochOf(pntHolder1.address)).to.be.eq(3)
    expect(await borrowingManager.loanEndEpochOf(pntHolder1.address)).to.be.eq(4)

    await pnt.connect(pntHolder2).approve(borrowingManager.address, depositAmountPntHolder2)
    await borrowingManager.connect(pntHolder2).lend(depositAmountPntHolder2, lockTimePntHolder2, pntHolder2.address)
    expect(await borrowingManager.loanStartEpochOf(pntHolder2.address)).to.be.eq(3)
    expect(await borrowingManager.loanEndEpochOf(pntHolder2.address)).to.be.eq(6)

    const currentEpoch = await epochsManager.currentEpoch()
    expect(currentEpoch).to.be.equal(2)
    expect(await borrowingManager.borrowableAmountByEpoch(2)).to.be.eq(0)
    expect(await borrowingManager.borrowableAmountByEpoch(3)).to.be.eq(truncateWithPrecision(depositAmountPntHolder12))
    expect(await borrowingManager.borrowableAmountByEpoch(4)).to.be.eq(truncateWithPrecision(depositAmountPntHolder12))
    expect(await borrowingManager.borrowableAmountByEpoch(5)).to.be.eq(truncateWithPrecision(depositAmountPntHolder2))
    expect(await borrowingManager.borrowableAmountByEpoch(6)).to.be.eq(truncateWithPrecision(depositAmountPntHolder2))
    expect(await borrowingManager.borrowableAmountByEpoch(7)).to.be.eq(0)

    await expect(borrowingManager.connect(user2).borrow(borrowAmountUser2, expectedNumberOfEpochsUser2, user2.address, MIN_AMOUNT, MAX_AMOUNT))
      .to.emit(borrowingManager, 'Borrowed')
      .withArgs(user2.address, expectedEpoch, currentEpoch + expectedNumberOfEpochsUser2, borrowAmountUser2)

    expect(await borrowingManager.borrowedAmountByEpochOf(user2.address, 2)).to.be.eq(0)
    expect(await borrowingManager.borrowedAmountByEpochOf(user2.address, 3)).to.be.eq(truncateWithPrecision(borrowAmountUser2))
    expect(await borrowingManager.borrowedAmountByEpochOf(user2.address, 4)).to.be.eq(truncateWithPrecision(borrowAmountUser2))
    expect(await borrowingManager.borrowedAmountByEpochOf(user2.address, 5)).to.be.eq(0)

    await expect(borrowingManager.connect(user1).borrow(borrowAmountUser1, expectedNumberOfEpochsUser1, user1.address, MIN_AMOUNT, MAX_AMOUNT))
      .to.emit(borrowingManager, 'Borrowed')
      .withArgs(user1.address, expectedEpoch, currentEpoch + expectedNumberOfEpochsUser1, borrowAmountUser1)

    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 2)).to.be.eq(0)
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 3)).to.be.eq(truncateWithPrecision(borrowAmountUser1))
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 4)).to.be.eq(truncateWithPrecision(borrowAmountUser1))
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 5)).to.be.eq(truncateWithPrecision(borrowAmountUser1))
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 6)).to.be.eq(truncateWithPrecision(borrowAmountUser1))
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 7)).to.be.eq(0)

    expect(await borrowingManager.borrowableAmountByEpoch(2)).to.be.eq(0)
    expect(await borrowingManager.borrowableAmountByEpoch(3)).to.be.eq(0)
    expect(await borrowingManager.borrowableAmountByEpoch(4)).to.be.eq(0)
    expect(await borrowingManager.borrowableAmountByEpoch(5)).to.be.eq(0)
    expect(await borrowingManager.borrowableAmountByEpoch(6)).to.be.eq(0)
    expect(await borrowingManager.borrowableAmountByEpoch(7)).to.be.eq(0)

    await expect(
      borrowingManager.connect(user1).borrow(borrowAmountUser1, expectedNumberOfEpochsUser1, user1.address, MIN_AMOUNT, MAX_AMOUNT)
    ).to.be.revertedWithCustomError(borrowingManager, 'AmountNotAvailableInEpoch')
  })

  it('should pntHolder1 lend 1k pnt for 3 epochs and pntHolder2 2k pnt for 5 epochs at the epoch 2 and user1 borrows 1k pnt at epoch 5 and 6', async () => {
    //   pntHolder1
    //                                          1k        1k
    //   |----------|----------|----xxxxxx|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|----------|
    //   0          1          2          3          4          5          6          7          8
    //
    //   pntHolder2
    //                                          2k        2k         2k         2k
    //   |----------|----------|----xxxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4          5          6          7          8
    //
    //   result
    //                                          3k        3k         2k         2k
    //   |----------|----------|----xxxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4          5          6          7          8
    //
    //   user1
    //                                          2k        2k         1k         1k
    //   |----------|----------|----------|----------|----------|vvvvvvvvvv|vvvvvvvvvv|----------|
    //   0          1          2          3          4          5          6          7          8

    const depositAmountPntHolder1 = ethers.utils.parseEther('1000')
    const depositAmountPntHolder2 = ethers.utils.parseEther('2000')
    const depositAmountPntHolder12 = depositAmountPntHolder1.add(depositAmountPntHolder2)
    const borrowAmountUser1 = ethers.utils.parseEther('1000')
    const expectedLeftAmountEpoch56 = ethers.utils.parseEther('1000')
    const expectedNumberOfEpochsUser1 = 2
    const lockTimePntHolder1 = EPOCH_DURATION * 3
    const lockTimePntHolder2 = EPOCH_DURATION * 5

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    await pnt.connect(pntHolder1).approve(borrowingManager.address, depositAmountPntHolder1)
    await borrowingManager.connect(pntHolder1).lend(depositAmountPntHolder1, lockTimePntHolder1, pntHolder1.address)
    await pnt.connect(pntHolder2).approve(borrowingManager.address, depositAmountPntHolder2)
    await borrowingManager.connect(pntHolder2).lend(depositAmountPntHolder2, lockTimePntHolder2, pntHolder2.address)

    let expectedCurrentEpoch = 4
    await time.increase(EPOCH_DURATION * 2)
    const currentEpoch = await epochsManager.currentEpoch()
    expect(currentEpoch).to.be.equal(expectedCurrentEpoch)

    await expect(borrowingManager.connect(user1).borrow(borrowAmountUser1, expectedNumberOfEpochsUser1, user1.address, MIN_AMOUNT, MAX_AMOUNT))
      .to.emit(borrowingManager, 'Borrowed')
      .withArgs(user1.address, expectedCurrentEpoch + 1, currentEpoch + expectedNumberOfEpochsUser1, borrowAmountUser1)

    expect(await borrowingManager.borrowableAmountByEpoch(2)).to.be.eq(0)
    expect(await borrowingManager.borrowableAmountByEpoch(3)).to.be.eq(truncateWithPrecision(depositAmountPntHolder12))
    expect(await borrowingManager.borrowableAmountByEpoch(4)).to.be.eq(truncateWithPrecision(depositAmountPntHolder12))
    expect(await borrowingManager.borrowableAmountByEpoch(5)).to.be.eq(truncateWithPrecision(expectedLeftAmountEpoch56))
    expect(await borrowingManager.borrowableAmountByEpoch(6)).to.be.eq(truncateWithPrecision(expectedLeftAmountEpoch56))
    expect(await borrowingManager.borrowableAmountByEpoch(7)).to.be.eq(0)

    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 4)).to.be.eq(0)
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 5)).to.be.eq(truncateWithPrecision(borrowAmountUser1))
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 6)).to.be.eq(truncateWithPrecision(borrowAmountUser1))
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 7)).to.be.eq(0)
  })

  it('should pntHolder1 lend 1k pnt for 3 epochs and pntHolder2 2k pnt for 5 epochs at the epoch 2 and user1 not able to borrow 1k pnt at epoch 5, 6 and 7', async () => {
    //   pntHolder1
    //                                          1k        1k
    //   |----------|----------|----xxxxxx|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|----------|
    //   0          1          2          3          4          5          6          7          8
    //
    //   pntHolder2
    //                                          2k        2k         2k         2k
    //   |----------|----------|----xxxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4          5          6          7          8
    //
    //   result
    //                                          3k        3k         2k         2k
    //   |----------|----------|----xxxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4          5          6          7          8
    //
    //   user1
    //                                          2k        2k         1k         1k
    //   |----------|----------|----------|----------|----------|vvvvvvvvvv|vvvvvvvvvv|xxxxxxxxxx|
    //   0          1          2          3          4          5          6          7          8

    const depositAmountPntHolder1 = ethers.utils.parseEther('1000')
    const depositAmountPntHolder2 = ethers.utils.parseEther('2000')
    const borrowAmountUser1 = ethers.utils.parseEther('1000')
    const lockTimePntHolder1 = EPOCH_DURATION * 3
    const lockTimePntHolder2 = EPOCH_DURATION * 5

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    await pnt.connect(pntHolder1).approve(borrowingManager.address, depositAmountPntHolder1)
    await borrowingManager.connect(pntHolder1).lend(depositAmountPntHolder1, lockTimePntHolder1, pntHolder1.address)
    await pnt.connect(pntHolder2).approve(borrowingManager.address, depositAmountPntHolder2)
    await borrowingManager.connect(pntHolder2).lend(depositAmountPntHolder2, lockTimePntHolder2, pntHolder2.address)

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(4)

    await expect(borrowingManager.connect(user1).borrow(borrowAmountUser1, 3, user1.address, MIN_AMOUNT, MAX_AMOUNT)).to.be.revertedWithCustomError(
      borrowingManager,
      'AmountNotAvailableInEpoch'
    )
  })

  it('should pntHolder1 lend 1k pnt for 3 epochs and pntHolder2 2k pnt for 5 epochs at the epoch 2 and user1 not be able to borrow 5k pnt at epoch 2 for 1 epoch', async () => {
    //   pntHolder1
    //                                          1k        1k
    //   |----------|----------|----xxxxxx|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|----------|
    //   0          1          2          3          4          5          6          7          8
    //
    //   pntHolder2
    //                                          2k        2k
    //   |----------|----------|----xxxxxx|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|----------|
    //   0          1          2          3          4          5          6          7          8
    //
    //   result
    //                                          3k        3k
    //   |----------|----------|----xxxxxx|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|----------|
    //   0          1          2          3          4          5          6          7          8
    //
    //   user1
    //                                          5k
    //   |----------|----------|----------|xxxxxxxxxx|----------|----------|----------|----------|
    //   0          1          2          3          4          5          6          7          8

    const depositAmountPntHolder1 = ethers.utils.parseEther('1000')
    const depositAmountPntHolder2 = ethers.utils.parseEther('2000')
    const borrowAmountUser1 = ethers.utils.parseEther('5000')
    const lockTimePntHolder1 = EPOCH_DURATION * 3
    const lockTimePntHolder2 = EPOCH_DURATION * 3

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    await pnt.connect(pntHolder1).approve(borrowingManager.address, depositAmountPntHolder1)
    await borrowingManager.connect(pntHolder1).lend(depositAmountPntHolder1, lockTimePntHolder1, pntHolder1.address)
    expect(await borrowingManager.loanStartEpochOf(pntHolder1.address)).to.be.eq(3)
    expect(await borrowingManager.loanEndEpochOf(pntHolder1.address)).to.be.eq(4)

    await pnt.connect(pntHolder2).approve(borrowingManager.address, depositAmountPntHolder2)
    await borrowingManager.connect(pntHolder2).lend(depositAmountPntHolder2, lockTimePntHolder2, pntHolder2.address)
    expect(await borrowingManager.loanStartEpochOf(pntHolder2.address)).to.be.eq(3)
    expect(await borrowingManager.loanEndEpochOf(pntHolder2.address)).to.be.eq(4)

    await expect(borrowingManager.connect(user1).borrow(borrowAmountUser1, 1, user1.address, MIN_AMOUNT, MAX_AMOUNT)).to.be.revertedWithCustomError(
      borrowingManager,
      'AmountNotAvailableInEpoch'
    )
  })

  it('should pntHolder1 lend 1k pnt for 3 epochs at the epoch 2 and user1 be able to unstake at least in the epoch 5', async () => {
    //   pntHolder1
    //                                          1k        1k
    //   |----------|----------|----xxxxxx|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|----------|
    //   0          1          2  2e+1d   3          4          5  5e+1d   6          7          8

    const depositAmountPntHolder1 = ethers.utils.parseEther('1000')
    const lockTimePntHolder1 = EPOCH_DURATION * 3

    await time.increase(EPOCH_DURATION * 2 + ONE_DAY)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    await pnt.connect(pntHolder1).approve(borrowingManager.address, depositAmountPntHolder1)
    await borrowingManager.connect(pntHolder1).lend(depositAmountPntHolder1, lockTimePntHolder1, pntHolder1.address)

    await time.increase(lockTimePntHolder1 - ONE_DAY)
    expect(await epochsManager.currentEpoch()).to.be.equal(5)
    expect(await borrowingManager.borrowableAmountByEpoch(4)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1))
    expect(await borrowingManager.borrowableAmountByEpoch(5)).to.be.eq(0)

    // prettier-ignore
    await expect(stakingManager.connect(pntHolder1).unstake(depositAmountPntHolder1)).to.be.revertedWith('STAKING_MANAGER_NOT_ENOUGH_UNWRAPPABLE_TOKENS')

    await time.increase(ONE_DAY + 1)
    const pntHolder1BalancePre = await pnt.balanceOf(pntHolder1.address)
    await stakingManager.connect(pntHolder1).unstake(depositAmountPntHolder1)
    const pntHolder1BalancePost = await pnt.balanceOf(pntHolder1.address)
    expect(pntHolder1BalancePost).to.be.equal(pntHolder1BalancePre.add(depositAmountPntHolder1))
  })

  it('should user1 be able to borrow more than once in differents epochs (1 - last epoch should change at the 2 borrow)', async () => {
    //   pntHolder1
    //
    //   |-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|
    //   0          1          2          3          4          5          6          7
    //
    //
    //   user1 - borrow phases
    //
    //                  1k          1k         1k
    //   |-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4           5
    //
    //                              2k         2k        2k
    //   |----------|-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4          5          6
    //
    //  result
    //                   1k         3k         3k        2k
    //   |----------|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|
    //   0          1          2          3          4          5          6

    const depositAmountPntHolder1 = ethers.utils.parseEther('5000')
    const lockTimePntHolder1 = EPOCH_DURATION * 5
    await pnt.connect(pntHolder1).approve(borrowingManager.address, depositAmountPntHolder1)
    await borrowingManager.connect(pntHolder1).lend(depositAmountPntHolder1, lockTimePntHolder1, pntHolder1.address)

    const borrowAmount1 = ethers.utils.parseEther('1000')
    await expect(borrowingManager.connect(user1).borrow(borrowAmount1, 3, user1.address, MIN_AMOUNT, MAX_AMOUNT))
      .to.emit(borrowingManager, 'Borrowed')
      .withArgs(user1.address, 1, 3, borrowAmount1)

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(1)
    //expect(await borrowingManager.getBorrowingEndEpochOf(user1.address)).to.be.eq(3)

    const borrowAmount2 = ethers.utils.parseEther('2000')
    await expect(borrowingManager.connect(user1).borrow(borrowAmount2, 3, user1.address, MIN_AMOUNT, MAX_AMOUNT))
      .to.emit(borrowingManager, 'Borrowed')
      .withArgs(user1.address, 2, 4, borrowAmount2)

    expect(await borrowingManager.borrowableAmountByEpoch(0)).to.be.eq(0)
    expect(await borrowingManager.borrowableAmountByEpoch(1)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount1)))
    expect(await borrowingManager.borrowableAmountByEpoch(2)).to.be.eq(
      truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount1.add(borrowAmount2)))
    )
    expect(await borrowingManager.borrowableAmountByEpoch(3)).to.be.eq(
      truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount1.add(borrowAmount2)))
    )
    expect(await borrowingManager.borrowableAmountByEpoch(4)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount2)))
    expect(await borrowingManager.borrowableAmountByEpoch(5)).to.be.eq(0)

    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 0)).to.be.eq(0)
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 1)).to.be.eq(truncateWithPrecision(borrowAmount1))
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 2)).to.be.eq(truncateWithPrecision(borrowAmount1.add(borrowAmount2)))
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 3)).to.be.eq(truncateWithPrecision(borrowAmount1.add(borrowAmount2)))
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 4)).to.be.eq(truncateWithPrecision(borrowAmount2))
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 5)).to.be.eq(0)
  })

  it("should user1 be able to borrow more than once in differents epochs (2 - last epoch shouldn't change at the 2 borrow)", async () => {
    //   pntHolder1
    //
    //   |-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4          5
    //
    //
    //   user1 - borrow phases
    //
    //                  1k          1k         1k
    //   |-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4           5
    //
    //                              2k
    //   |----------|-----xxxxx|vvvvvvvvvv|xxxxx-----|----------|
    //   0          1          2          3          4          5
    //
    //                   1k         3k         1k
    //   |----------|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|
    //   0          1          2          3          4          5

    const depositAmountPntHolder1 = ethers.utils.parseEther('5000')
    const lockTimePntHolder1 = EPOCH_DURATION * 4
    await pnt.connect(pntHolder1).approve(borrowingManager.address, depositAmountPntHolder1)
    await borrowingManager.connect(pntHolder1).lend(depositAmountPntHolder1, lockTimePntHolder1, pntHolder1.address)

    const borrowAmount1 = ethers.utils.parseEther('1000')
    await expect(borrowingManager.connect(user1).borrow(borrowAmount1, 3, user1.address, MIN_AMOUNT, MAX_AMOUNT))
      .to.emit(borrowingManager, 'Borrowed')
      .withArgs(user1.address, 1, 3, borrowAmount1)

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(1)
    // expect(await borrowingManager.getBorrowingEndEpochOf(user1.address)).to.be.eq(3)

    const borrowAmount2 = ethers.utils.parseEther('2000')
    await expect(borrowingManager.connect(user1).borrow(borrowAmount2, 1, user1.address, MIN_AMOUNT, MAX_AMOUNT))
      .to.emit(borrowingManager, 'Borrowed')
      .withArgs(user1.address, 2, 2, borrowAmount2)

    expect(await borrowingManager.borrowableAmountByEpoch(0)).to.be.eq(0)
    expect(await borrowingManager.borrowableAmountByEpoch(1)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount1)))
    expect(await borrowingManager.borrowableAmountByEpoch(2)).to.be.eq(
      truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount1.add(borrowAmount2)))
    )
    expect(await borrowingManager.borrowableAmountByEpoch(3)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount1)))
    expect(await borrowingManager.borrowableAmountByEpoch(4)).to.be.eq(0)

    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 0)).to.be.eq(0)
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 1)).to.be.eq(truncateWithPrecision(borrowAmount1))
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 2)).to.be.eq(truncateWithPrecision(borrowAmount1.add(borrowAmount2)))
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 3)).to.be.eq(truncateWithPrecision(borrowAmount1))
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 4)).to.be.eq(0)
  })

  it('should not be able to release without having the corresponding role', async () => {
    const expectedError = `AccessControl: account ${user1.address.toLowerCase()} is missing role ${RELEASE_ROLE}`
    await expect(borrowingManager.connect(user1).release(user1.address, 0)).to.be.revertedWith(expectedError)
  })

  it('should be able to release (1)', async () => {
    //   pntHolder1 - lend
    //
    //   |-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4          5
    //
    //
    //   user1 - borrow
    //
    //                  1k          1k         1k
    //   |-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4           5
    //
    //
    //   owner - release
    //                              2k
    //   |----------|---------|rrrrrrrrrr|rrrrrrrrrr|----------|
    //   0          1          2          3          4          5
    //

    const depositAmountPntHolder1 = ethers.utils.parseEther('5000')
    const lockTimePntHolder1 = EPOCH_DURATION * 4
    await pnt.connect(pntHolder1).approve(borrowingManager.address, depositAmountPntHolder1)
    await borrowingManager.connect(pntHolder1).lend(depositAmountPntHolder1, lockTimePntHolder1, pntHolder1.address)

    const borrowAmount = ethers.utils.parseEther('1000')
    await expect(borrowingManager.connect(user1).borrow(borrowAmount, 3, user1.address, MIN_AMOUNT, MAX_AMOUNT))
      .to.emit(borrowingManager, 'Borrowed')
      .withArgs(user1.address, 1, 3, borrowAmount)

    expect(await borrowingManager.borrowableAmountByEpoch(1)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount)))
    expect(await borrowingManager.borrowableAmountByEpoch(2)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount)))
    expect(await borrowingManager.borrowableAmountByEpoch(3)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount)))

    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 1)).to.be.eq(truncateWithPrecision(borrowAmount))
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 2)).to.be.eq(truncateWithPrecision(borrowAmount))
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 3)).to.be.eq(truncateWithPrecision(borrowAmount))

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)
    await expect(borrowingManager.release(user1.address, 2))
      .to.emit(borrowingManager, 'Released')
      .withArgs(user1.address, 2, truncateWithPrecision(borrowAmount))

    await expect(borrowingManager.release(user1.address, 3))
      .to.emit(borrowingManager, 'Released')
      .withArgs(user1.address, 3, truncateWithPrecision(borrowAmount))

    expect(await borrowingManager.borrowableAmountByEpoch(1)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount)))
    expect(await borrowingManager.borrowableAmountByEpoch(2)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1))
    expect(await borrowingManager.borrowableAmountByEpoch(3)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1))

    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 1)).to.be.eq(truncateWithPrecision(borrowAmount))
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 2)).to.be.eq(0)
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 3)).to.be.eq(0)
  })

  it("should user1 be able to borrow more than once in differents epochs (2 - last epoch shouldn't change at the 2 borrow) after a contract upgrade between the 2 borrow phases", async () => {
    //   pntHolder1
    //
    //   |-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4          5
    //
    //
    //   user1 - borrow phases
    //
    //                  1k          1k         1k
    //   |-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4           5
    //
    //                              2k
    //   |----------|-----xxxxx|vvvvvvvvvv|xxxxx-----|----------|
    //   0          1          2          3          4          5
    //
    //                   1k         3k         1k
    //   |----------|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|
    //   0          1          2          3          4          5

    const depositAmountPntHolder1 = ethers.utils.parseEther('5000')
    const lockTimePntHolder1 = EPOCH_DURATION * 4
    await pnt.connect(pntHolder1).approve(borrowingManager.address, depositAmountPntHolder1)
    await borrowingManager.connect(pntHolder1).lend(depositAmountPntHolder1, lockTimePntHolder1, pntHolder1.address)

    const borrowAmount1 = ethers.utils.parseEther('1000')
    await expect(borrowingManager.connect(user1).borrow(borrowAmount1, 3, user1.address, MIN_AMOUNT, MAX_AMOUNT))
      .to.emit(borrowingManager, 'Borrowed')
      .withArgs(user1.address, 1, 3, borrowAmount1)

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(1)

    await upgrades.upgradeProxy(borrowingManager.address, BorrowingManager, {
      kind: 'uups'
    })

    const borrowAmount2 = ethers.utils.parseEther('2000')
    await expect(borrowingManager.connect(user1).borrow(borrowAmount2, 1, user1.address, MIN_AMOUNT, MAX_AMOUNT))
      .to.emit(borrowingManager, 'Borrowed')
      .withArgs(user1.address, 2, 2, borrowAmount2)

    expect(await borrowingManager.borrowableAmountByEpoch(0)).to.be.eq(0)
    expect(await borrowingManager.borrowableAmountByEpoch(1)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount1)))
    // prettier-ignore
    expect(await borrowingManager.borrowableAmountByEpoch(2)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount1.add(borrowAmount2))))
    expect(await borrowingManager.borrowableAmountByEpoch(3)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount1)))
    expect(await borrowingManager.borrowableAmountByEpoch(4)).to.be.eq(0)

    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 0)).to.be.eq(0)
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 1)).to.be.eq(truncateWithPrecision(borrowAmount1))
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 2)).to.be.eq(truncateWithPrecision(borrowAmount1.add(borrowAmount2)))
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 3)).to.be.eq(truncateWithPrecision(borrowAmount1))
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 4)).to.be.eq(0)
  })

  it('should user1 be able to borrow more than once in differents epochs by keeping the same start epoch', async () => {
    //   pntHolder1
    //
    //   |-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4          5
    //
    //
    //   user1 - borrow phases
    //
    //                  1k          1k         1k
    //   |-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4           5
    //
    //                              2k
    //   |----------|-----xxxxx|vvvvvvvvvv|xxxxx-----|----------|
    //   0          1          2          3          4          5
    //
    //                   1k         3k         1k
    //   |----------|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|
    //   0          1          2          3          4          5

    const depositAmountPntHolder1 = ethers.utils.parseEther('5000')
    const lockTimePntHolder1 = EPOCH_DURATION * 4
    await pnt.connect(pntHolder1).approve(borrowingManager.address, depositAmountPntHolder1)
    await borrowingManager.connect(pntHolder1).lend(depositAmountPntHolder1, lockTimePntHolder1, pntHolder1.address)

    const borrowAmount1 = ethers.utils.parseEther('1000')
    await expect(borrowingManager.connect(user1).borrow(borrowAmount1, 3, user1.address, MIN_AMOUNT, MAX_AMOUNT))
      .to.emit(borrowingManager, 'Borrowed')
      .withArgs(user1.address, 1, 3, borrowAmount1)

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(1)

    const borrowAmount2 = ethers.utils.parseEther('2000')
    await expect(borrowingManager.connect(user1).borrow(borrowAmount2, 1, user1.address, MIN_AMOUNT, MAX_AMOUNT))
      .to.emit(borrowingManager, 'Borrowed')
      .withArgs(user1.address, 2, 2, borrowAmount2)

    expect(await borrowingManager.borrowableAmountByEpoch(0)).to.be.eq(0)
    expect(await borrowingManager.borrowableAmountByEpoch(1)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount1)))
    // prettier-ignore
    expect(await borrowingManager.borrowableAmountByEpoch(2)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount1.add(borrowAmount2))))
    expect(await borrowingManager.borrowableAmountByEpoch(3)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount1)))
    expect(await borrowingManager.borrowableAmountByEpoch(4)).to.be.eq(0)

    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 0)).to.be.eq(0)
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 1)).to.be.eq(truncateWithPrecision(borrowAmount1))
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 2)).to.be.eq(truncateWithPrecision(borrowAmount1.add(borrowAmount2)))
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 3)).to.be.eq(truncateWithPrecision(borrowAmount1))
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 4)).to.be.eq(0)
  })

  it('should user1 be able to borrow more than once in differents epochs by changing the start epoch', async () => {
    //   pntHolder1
    //
    //   |-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4          5          6          7          8
    //
    //
    //   user1 - borrow phases
    //
    //                  1k          1k         1k
    //   |-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4           5
    //
    //                                                                2k        2k
    //   |----------|----------|----------|----------|-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4          5          6          7          8
    //
    //                   1k         1k         1k                     2k       2k
    //   |----------|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|vvvvvvvvvv|vvvvvvvvvv|----------|
    //   0          1          2          3          4          5          6          7          8

    const depositAmountPntHolder1 = ethers.utils.parseEther('5000')
    const lockTimePntHolder1 = EPOCH_DURATION * 7
    await pnt.connect(pntHolder1).approve(borrowingManager.address, depositAmountPntHolder1)
    await borrowingManager.connect(pntHolder1).lend(depositAmountPntHolder1, lockTimePntHolder1, pntHolder1.address)

    const borrowAmount1 = ethers.utils.parseEther('1000')
    await expect(borrowingManager.connect(user1).borrow(borrowAmount1, 3, user1.address, MIN_AMOUNT, MAX_AMOUNT))
      .to.emit(borrowingManager, 'Borrowed')
      .withArgs(user1.address, 1, 3, borrowAmount1)

    await time.increase(EPOCH_DURATION * 4)
    expect(await epochsManager.currentEpoch()).to.be.equal(4)

    const borrowAmount2 = ethers.utils.parseEther('2000')
    await expect(borrowingManager.connect(user1).borrow(borrowAmount2, 2, user1.address, MIN_AMOUNT, MAX_AMOUNT))
      .to.emit(borrowingManager, 'Borrowed')
      .withArgs(user1.address, 5, 6, borrowAmount2)

    expect(await borrowingManager.borrowableAmountByEpoch(0)).to.be.eq(0)
    expect(await borrowingManager.borrowableAmountByEpoch(1)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount1)))
    expect(await borrowingManager.borrowableAmountByEpoch(2)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount1)))
    expect(await borrowingManager.borrowableAmountByEpoch(3)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount1)))
    expect(await borrowingManager.borrowableAmountByEpoch(4)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1))
    expect(await borrowingManager.borrowableAmountByEpoch(5)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount2)))
    expect(await borrowingManager.borrowableAmountByEpoch(6)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount2)))

    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 0)).to.be.eq(0)
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 1)).to.be.eq(truncateWithPrecision(borrowAmount1))
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 2)).to.be.eq(truncateWithPrecision(borrowAmount1))
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 3)).to.be.eq(truncateWithPrecision(borrowAmount1))
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 4)).to.be.eq(0)
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 5)).to.be.eq(truncateWithPrecision(borrowAmount2))
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 6)).to.be.eq(truncateWithPrecision(borrowAmount2))
  })

  it('should user1 be able to borrow more than once in differents epochs by changing the start epoch', async () => {
    //   pntHolder1
    //
    //   |-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx------|
    //   0          1          2          3          4          5          6          7           8
    //
    //
    //   user1 - borrow phases
    //
    //                  1k          1k         1k
    //   |-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4           5
    //
    //                                                              2k
    //   |----------|----------|----------|----------|-----xxxxx|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4          5          6
    //
    //  result
    //                   1k         1k         1k                     2k
    //   |----------|----------|----------|----------|----------|vvvvvvvvvv|
    //   0          1          2          3          4          5          6

    const depositAmountPntHolder1 = ethers.utils.parseEther('5000')
    const lockTimePntHolder1 = EPOCH_DURATION * 7
    await pnt.connect(pntHolder1).approve(borrowingManager.address, depositAmountPntHolder1)
    await borrowingManager.connect(pntHolder1).lend(depositAmountPntHolder1, lockTimePntHolder1, pntHolder1.address)

    const borrowAmount1 = ethers.utils.parseEther('1000')
    await expect(borrowingManager.connect(user1).borrow(borrowAmount1, 3, user1.address, MIN_AMOUNT, MAX_AMOUNT))
      .to.emit(borrowingManager, 'Borrowed')
      .withArgs(user1.address, 1, 3, borrowAmount1)

    await time.increase(EPOCH_DURATION * 4)
    expect(await epochsManager.currentEpoch()).to.be.equal(4)

    const borrowAmount2 = ethers.utils.parseEther('2000')
    await expect(borrowingManager.connect(user1).borrow(borrowAmount2, 1, user1.address, MIN_AMOUNT, MAX_AMOUNT))
      .to.emit(borrowingManager, 'Borrowed')
      .withArgs(user1.address, 5, 5, borrowAmount2)

    expect(await borrowingManager.borrowableAmountByEpoch(0)).to.be.eq(0)
    expect(await borrowingManager.borrowableAmountByEpoch(1)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount1)))
    expect(await borrowingManager.borrowableAmountByEpoch(2)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount1)))
    expect(await borrowingManager.borrowableAmountByEpoch(3)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount1)))
    expect(await borrowingManager.borrowableAmountByEpoch(4)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1))
    expect(await borrowingManager.borrowableAmountByEpoch(5)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount2)))
    expect(await borrowingManager.borrowableAmountByEpoch(6)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1))
    expect(await borrowingManager.borrowableAmountByEpoch(7)).to.be.eq(0)

    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 0)).to.be.eq(0)
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 1)).to.be.eq(truncateWithPrecision(borrowAmount1))
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 2)).to.be.eq(truncateWithPrecision(borrowAmount1))
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 3)).to.be.eq(truncateWithPrecision(borrowAmount1))
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 4)).to.be.eq(0)
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 5)).to.be.eq(truncateWithPrecision(borrowAmount2))
    expect(await borrowingManager.borrowedAmountByEpochOf(user1.address, 6)).to.be.eq(0)
  })

  it('should handle correctly the multiple deposits with differents time locks', async () => {
    //   pntHolder1 - 1 lend -> [1, 5]
    //
    //   |-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|
    //   0          1          2          3          4          5          6          7          8
    //
    //
    //  pntHolder1 - 2 lend -> [1, 5]
    //
    //   |----------|----------|-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|----------|
    //   0          1          2          3          4          5          6          7          8
    //
    //
    //  pntHolder1 - 3 lend -> [1, 7]
    //
    //   |----------|----------|----------|----------|-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4          5          6          7          8
    //
    //
    //  pntHolder1 - 4 lend -> [8, 9]
    //
    //   |----------|----------|----------|----------|----------|----------|----------|-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4          5          6          7          8          9          10         11
    //
    //
    //  result
    //
    //   |----------|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|---------|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4          5          6          7          8          9          10         11

    const depositAmountPntHolder1 = ethers.utils.parseEther('5000')
    let lockTimePntHolder1 = EPOCH_DURATION * 6

    await pnt.connect(pntHolder1).approve(borrowingManager.address, depositAmountPntHolder1)
    await borrowingManager.connect(pntHolder1).lend(depositAmountPntHolder1, lockTimePntHolder1, pntHolder1.address)
    expect(await borrowingManager.loanStartEpochOf(pntHolder1.address)).to.be.eq(1)
    expect(await borrowingManager.loanEndEpochOf(pntHolder1.address)).to.be.eq(5)
    expect(await borrowingManager.lendedAmountByEpochOf(pntHolder1.address, 0)).to.be.eq(0)
    expect(await borrowingManager.lendedAmountByEpochOf(pntHolder1.address, 1)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1))
    expect(await borrowingManager.lendedAmountByEpochOf(pntHolder1.address, 2)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1))
    expect(await borrowingManager.lendedAmountByEpochOf(pntHolder1.address, 3)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1))
    expect(await borrowingManager.lendedAmountByEpochOf(pntHolder1.address, 4)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1))
    expect(await borrowingManager.lendedAmountByEpochOf(pntHolder1.address, 5)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1))
    expect(await borrowingManager.lendedAmountByEpochOf(pntHolder1.address, 6)).to.be.eq(0)

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    lockTimePntHolder1 = EPOCH_DURATION * 3
    await pnt.connect(pntHolder1).approve(borrowingManager.address, depositAmountPntHolder1)
    await borrowingManager.connect(pntHolder1).lend(depositAmountPntHolder1, lockTimePntHolder1, pntHolder1.address)
    expect(await borrowingManager.loanStartEpochOf(pntHolder1.address)).to.be.eq(1)
    expect(await borrowingManager.loanEndEpochOf(pntHolder1.address)).to.be.eq(5)
    expect(await borrowingManager.lendedAmountByEpochOf(pntHolder1.address, 0)).to.be.eq(0)
    expect(await borrowingManager.lendedAmountByEpochOf(pntHolder1.address, 1)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1))
    expect(await borrowingManager.lendedAmountByEpochOf(pntHolder1.address, 2)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1))
    expect(await borrowingManager.lendedAmountByEpochOf(pntHolder1.address, 3)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.mul(2)))
    expect(await borrowingManager.lendedAmountByEpochOf(pntHolder1.address, 4)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.mul(2)))
    expect(await borrowingManager.lendedAmountByEpochOf(pntHolder1.address, 5)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1))
    expect(await borrowingManager.lendedAmountByEpochOf(pntHolder1.address, 6)).to.be.eq(0)

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(4)

    await pnt.connect(pntHolder1).approve(borrowingManager.address, depositAmountPntHolder1)
    await borrowingManager.connect(pntHolder1).lend(depositAmountPntHolder1, lockTimePntHolder1, pntHolder1.address)
    expect(await borrowingManager.loanStartEpochOf(pntHolder1.address)).to.be.eq(1)
    expect(await borrowingManager.loanEndEpochOf(pntHolder1.address)).to.be.eq(6)
    expect(await borrowingManager.lendedAmountByEpochOf(pntHolder1.address, 1)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1))
    expect(await borrowingManager.lendedAmountByEpochOf(pntHolder1.address, 2)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1))
    expect(await borrowingManager.lendedAmountByEpochOf(pntHolder1.address, 3)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.mul(2)))
    expect(await borrowingManager.lendedAmountByEpochOf(pntHolder1.address, 4)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.mul(2)))
    expect(await borrowingManager.lendedAmountByEpochOf(pntHolder1.address, 5)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.mul(2)))
    expect(await borrowingManager.lendedAmountByEpochOf(pntHolder1.address, 6)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1))
    expect(await borrowingManager.lendedAmountByEpochOf(pntHolder1.address, 7)).to.be.eq(0)

    expect(await borrowingManager.loanStartEpochOf(pntHolder1.address)).to.be.eq(1)
    expect(await borrowingManager.loanEndEpochOf(pntHolder1.address)).to.be.eq(6)

    await time.increase(EPOCH_DURATION * 3)
    expect(await epochsManager.currentEpoch()).to.be.equal(7)

    await pnt.connect(pntHolder1).approve(borrowingManager.address, depositAmountPntHolder1)
    await borrowingManager.connect(pntHolder1).lend(depositAmountPntHolder1, lockTimePntHolder1, pntHolder1.address)
    expect(await borrowingManager.loanStartEpochOf(pntHolder1.address)).to.be.eq(8)
    expect(await borrowingManager.loanEndEpochOf(pntHolder1.address)).to.be.eq(9)
    expect(await borrowingManager.lendedAmountByEpochOf(pntHolder1.address, 7)).to.be.eq(0)
    expect(await borrowingManager.lendedAmountByEpochOf(pntHolder1.address, 8)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1))
    expect(await borrowingManager.lendedAmountByEpochOf(pntHolder1.address, 9)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1))
    expect(await borrowingManager.lendedAmountByEpochOf(pntHolder1.address, 10)).to.be.eq(0)

    expect(await borrowingManager.loanStartEpochOf(pntHolder1.address)).to.be.eq(8)
    expect(await borrowingManager.loanEndEpochOf(pntHolder1.address)).to.be.eq(9)
  })

  it('should be able to claim correcly the interest earned (1)', async () => {
    //
    //   pntHolder1 - 1 lend -> [1, 5]
    //                  50k         50k        50k        50k
    //   |-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|----------|
    //   0          1          2          3          4          5          6          7          8
    //
    //
    //   pntHolder2 - 2 lend -> [2, 6]
    //                             5k         5k         5k         5k
    //   |----------|-----xxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx------|----------|
    //   0          1         2          3          4          5          6          7          8
    //
    //
    //    result:
    //
    //    poolSize
    //                   50k        55k       55k        55k         5k
    //   |----------|vvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|----------|
    //   0          1         2          3          4          5          6          7          8
    //
    //    interests
    //                   10k        10k         0        0         10k
    //   |----------|vvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|----------|
    //   0          1         2          3          4          5          6          7          8

    const depositInterestAmount = ethers.utils.parseEther('10000')
    const depositAmountPntHolder1 = ethers.utils.parseEther('50000')
    const depositAmountPntHolder2 = ethers.utils.parseEther('5000')
    let lockTime = EPOCH_DURATION * 5

    await pnt.connect(pntHolder1).approve(borrowingManager.address, INFINITE)
    await pnt.connect(pntHolder2).approve(borrowingManager.address, INFINITE)
    await pnt.approve(borrowingManager.address, INFINITE)
    await borrowingManager.connect(pntHolder1).lend(depositAmountPntHolder1, lockTime, pntHolder1.address)
    await pnt.connect(pntHolder1).transfer(owner.address, depositInterestAmount.mul(5))

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(1)
    await borrowingManager.connect(pntHolder2).lend(depositAmountPntHolder2, lockTime, pntHolder2.address)

    await borrowingManager.depositInterest(pnt.address, 1, depositInterestAmount)
    await time.increase(EPOCH_DURATION)
    // ((50k / 50k) + (4/4)) / 2 = 1 = 100%   --->   10000
    await expect(borrowingManager.connect(pntHolder1).claimInterestByEpoch(pnt.address, 1))
      .to.emit(borrowingManager, 'InterestClaimed')
      .withArgs(pntHolder1.address, pnt.address, 1, depositInterestAmount)

    await borrowingManager.depositInterest(pnt.address, 2, depositInterestAmount)
    await time.increase(EPOCH_DURATION)
    // ((50k / 55k) + (3/7)) / 2 = 0.66883116883116883   --->   10000 * 0.66883116883116883 = 6688.3116883116883
    await expect(borrowingManager.connect(pntHolder1).claimInterestByEpoch(pnt.address, 2))
      .to.emit(borrowingManager, 'InterestClaimed')
      .withArgs(pntHolder1.address, pnt.address, 2, ethers.utils.parseEther('6688.3116883116883'))
    // ((5k / 55k) + (4/7)) / 2 = 0.331168831168831168   --->   10000 * 0.331168831168831168 = 3311.68831168831168
    await expect(borrowingManager.connect(pntHolder2).claimInterestByEpoch(pnt.address, 2))
      .to.emit(borrowingManager, 'InterestClaimed')
      .withArgs(pntHolder2.address, pnt.address, 2, ethers.utils.parseEther('3311.68831168831168'))

    await time.increase(EPOCH_DURATION)
    await expect(borrowingManager.connect(pntHolder1).claimInterestByEpoch(pnt.address, 3)).to.be.revertedWithCustomError(
      borrowingManager,
      'NothingToClaim'
    )
    await expect(borrowingManager.connect(pntHolder2).claimInterestByEpoch(pnt.address, 3)).to.be.revertedWithCustomError(
      borrowingManager,
      'NothingToClaim'
    )

    await time.increase(EPOCH_DURATION)
    await expect(borrowingManager.connect(pntHolder1).claimInterestByEpoch(pnt.address, 4)).to.be.revertedWithCustomError(
      borrowingManager,
      'NothingToClaim'
    )
    await expect(borrowingManager.connect(pntHolder2).claimInterestByEpoch(pnt.address, 4)).to.be.revertedWithCustomError(
      borrowingManager,
      'NothingToClaim'
    )

    await borrowingManager.depositInterest(pnt.address, 5, depositInterestAmount)
    await time.increase(EPOCH_DURATION)
    // ((5k / 5k) + (1/1)) / 2 = 1   --->   10000 * 1 = 10000
    await expect(borrowingManager.connect(pntHolder2).claimInterestByEpoch(pnt.address, 5))
      .to.emit(borrowingManager, 'InterestClaimed')
      .withArgs(pntHolder2.address, pnt.address, 5, ethers.utils.parseEther('10000'))

    await expect(borrowingManager.connect(pntHolder2).claimInterestByEpoch(pnt.address, 5)).to.be.revertedWithCustomError(
      borrowingManager,
      'NothingToClaim'
    )
  })

  it('should be able to claim correcly the interest earned (2)', async () => {
    //
    //   pntHolder1 - 1 lend -> [1, 2]
    //                  50k
    //   |-----xxxxx|vvvvvvvvvv|xxxxx-----|----------|----------|----------|----------|----------|
    //   0          1          2          3          4          5          6          7          8
    //
    //
    //   pntHolder2 - 2 lend -> [2, 3]
    //                             5k
    //   |----------|-----xxxx|vvvvvvvvvv|xxxxx-----|----------|----------|----------|----------|
    //   0          1         2          3          4          5          6          7          8
    //
    //
    //    result:
    //
    //    poolSize
    //                   50k       5k
    //   |----------|vvvvvvvvv|vvvvvvvvvv|----------|----------|----------|----------|----------|
    //   0          1         2          3          4          5          6          7          8
    //
    //    interests
    //                   10k       10k
    //   |----------|vvvvvvvvv|vvvvvvvvvv|----------|----------|----------|----------|----------|
    //   0          1         2          3          4          5          6          7          8

    const depositInterestAmount = ethers.utils.parseEther('10000')
    const depositAmountPntHolder1 = ethers.utils.parseEther('50000')
    const depositAmountPntHolder2 = ethers.utils.parseEther('5000')
    let lockTime = EPOCH_DURATION * 2

    await pnt.connect(pntHolder1).approve(borrowingManager.address, INFINITE)
    await pnt.connect(pntHolder2).approve(borrowingManager.address, INFINITE)
    await pnt.approve(borrowingManager.address, INFINITE)
    await borrowingManager.connect(pntHolder1).lend(depositAmountPntHolder1, lockTime, pntHolder1.address)
    await pnt.connect(pntHolder1).transfer(owner.address, depositInterestAmount.mul(5))

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(1)
    await borrowingManager.connect(pntHolder2).lend(depositAmountPntHolder2, lockTime, pntHolder2.address)

    await borrowingManager.depositInterest(pnt.address, 1, depositInterestAmount)
    await time.increase(EPOCH_DURATION)
    // ((50k / 50k) + (1/1)) / 2 = 1 = 100%   --->   10000
    await expect(borrowingManager.connect(pntHolder1).claimInterestByEpoch(pnt.address, 1))
      .to.emit(borrowingManager, 'InterestClaimed')
      .withArgs(pntHolder1.address, pnt.address, 1, depositInterestAmount)

    await borrowingManager.depositInterest(pnt.address, 2, depositInterestAmount)
    await time.increase(EPOCH_DURATION)

    // ((5k / 5k) + (1/1)) / 2 = 1 = 100%   --->   10000
    await expect(borrowingManager.connect(pntHolder2).claimInterestByEpoch(pnt.address, 2))
      .to.emit(borrowingManager, 'InterestClaimed')
      .withArgs(pntHolder2.address, pnt.address, 2, depositInterestAmount)
  })

  it('should not be able to claim the interests if the lock time is less than 1 epoch', async () => {
    //
    //   pntHolder1 - 1 lend
    //
    //   |-----xxxxx|xxxxx-----|----------|----------|----------|----------|----------|----------|
    //   0          1          2          3          4          5          6          7          8
    //
    //

    const depositAmountPntHolder1 = ethers.utils.parseEther('50000')
    let lockTime = EPOCH_DURATION

    await pnt.connect(pntHolder1).approve(borrowingManager.address, INFINITE)
    await pnt.approve(borrowingManager.address, INFINITE)
    await expect(borrowingManager.connect(pntHolder1).lend(depositAmountPntHolder1, lockTime, pntHolder1.address)).to.be.revertedWithCustomError(
      borrowingManager,
      'InvalidLockTime'
    )
  })

  it('should be able to claim the interest even if the epoch is not terminated yet', async () => {
    //
    //   pntHolder1 - 1 lend -> [1, 4]
    //                  50k         50k        50k        50k
    //   |-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|----------|
    //   0          1          2          3          4          5          6          7          8
    //
    //
    //   pntHolder2 - 2 lend -> [2, 5]
    //                             5k         5k         5k         5k
    //   |----------|-----xxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx------|----------|
    //   0          1         2          3          4          5          6          7          8
    //
    //
    //    result:
    //
    //    poolSize
    //                   50k        55k       55k        55k         5k
    //   |----------|vvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|----------|
    //   0          1         2          3          4          5          6          7          8
    //
    //    interests
    //                10k+10k    10k+10k        0        0        10k+10k
    //   |----------|vvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|----------|
    //   0          1         2          3          4          5          6          7          8

    const depositInterestAmount = ethers.utils.parseEther('10000')
    const depositAmountPntHolder1 = ethers.utils.parseEther('50000')
    const depositAmountPntHolder2 = ethers.utils.parseEther('5000')
    let lockTime = EPOCH_DURATION * 5

    await pnt.connect(pntHolder1).approve(borrowingManager.address, INFINITE)
    await pnt.connect(pntHolder2).approve(borrowingManager.address, INFINITE)
    await pnt.approve(borrowingManager.address, INFINITE)
    await borrowingManager.connect(pntHolder1).lend(depositAmountPntHolder1, lockTime, pntHolder1.address)
    await pnt.connect(pntHolder1).transfer(owner.address, depositInterestAmount.mul(10))

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(1)
    await borrowingManager.connect(pntHolder2).lend(depositAmountPntHolder2, lockTime, pntHolder2.address)

    for (let i = 0; i < 2; i++) {
      await borrowingManager.depositInterest(pnt.address, 1, depositInterestAmount)
      // ((50k / 50k) + (4/4)) / 2 = 1 = 100%   --->   10000
      await expect(borrowingManager.connect(pntHolder1).claimInterestByEpoch(pnt.address, 1))
        .to.emit(borrowingManager, 'InterestClaimed')
        .withArgs(pntHolder1.address, pnt.address, 1, depositInterestAmount)
    }

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    for (let i = 0; i < 2; i++) {
      await borrowingManager.depositInterest(pnt.address, 2, depositInterestAmount)
      // ((50k / 55k) + (3/7)) / 2 = 0.66883116883116883   --->   10000 * 0.66883116883116883 = 6688.3116883116883
      await expect(borrowingManager.connect(pntHolder1).claimInterestByEpoch(pnt.address, 2))
        .to.emit(borrowingManager, 'InterestClaimed')
        .withArgs(pntHolder1.address, pnt.address, 2, ethers.utils.parseEther('6688.3116883116883'))
      // ((5k / 55k) + (4/7)) / 2 = 0.331168831168831168   --->   10000 * 0.331168831168831168 = 3311.68831168831168
      await expect(borrowingManager.connect(pntHolder2).claimInterestByEpoch(pnt.address, 2))
        .to.emit(borrowingManager, 'InterestClaimed')
        .withArgs(pntHolder2.address, pnt.address, 2, ethers.utils.parseEther('3311.68831168831168'))
    }

    await time.increase(EPOCH_DURATION)

    expect(await epochsManager.currentEpoch()).to.be.equal(3)
    await expect(borrowingManager.connect(pntHolder1).claimInterestByEpoch(pnt.address, 3)).to.be.revertedWithCustomError(
      borrowingManager,
      'NothingToClaim'
    )
    await time.increase(EPOCH_DURATION)
    await expect(borrowingManager.connect(pntHolder1).claimInterestByEpoch(pnt.address, 3)).to.be.revertedWithCustomError(
      borrowingManager,
      'NothingToClaim'
    )

    expect(await epochsManager.currentEpoch()).to.be.equal(4)
    await expect(borrowingManager.connect(pntHolder1).claimInterestByEpoch(pnt.address, 4)).to.be.revertedWithCustomError(
      borrowingManager,
      'NothingToClaim'
    )
    await time.increase(EPOCH_DURATION)
    await expect(borrowingManager.connect(pntHolder1).claimInterestByEpoch(pnt.address, 4)).to.be.revertedWithCustomError(
      borrowingManager,
      'NothingToClaim'
    )

    expect(await epochsManager.currentEpoch()).to.be.equal(5)
    for (let i = 0; i < 2; i++) {
      await borrowingManager.depositInterest(pnt.address, 5, depositInterestAmount)
      // ((5k / 5k) + (1/1)) / 2 = 1   --->   10000 * 1 = 10000
      await expect(borrowingManager.connect(pntHolder2).claimInterestByEpoch(pnt.address, 5))
        .to.emit(borrowingManager, 'InterestClaimed')
        .withArgs(pntHolder2.address, pnt.address, 5, ethers.utils.parseEther('10000'))
    }

    await expect(borrowingManager.connect(pntHolder2).claimInterestByEpoch(pnt.address, 5)).to.be.revertedWithCustomError(
      borrowingManager,
      'NothingToClaim'
    )
  })

  it('should be able to claim the interest half part within the same epoch and half in the next epoch', async () => {
    //
    //   pntHolder1 - 1 lend -> [1, 4]
    //                  50k         50k        50k        50k
    //   |-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|----------|
    //   0          1          2          3          4          5          6          7          8
    //
    //
    //   pntHolder2 - 2 lend -> [2, 5]
    //                             5k         5k         5k         5k
    //   |----------|-----xxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx------|----------|
    //   0          1         2          3          4          5          6          7          8
    //
    //
    //    result:
    //
    //    poolSize
    //                   50k        55k       55k        55k         5k
    //   |----------|vvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|----------|
    //   0          1         2          3          4          5          6          7          8
    //
    //    interests
    //                10k+10k    10k+10k        0        0       10k+10k
    //   |----------|vvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|----------|
    //   0          1         2          3          4          5          6          7          8

    const depositInterestAmount = ethers.utils.parseEther('10000')
    const depositAmountPntHolder1 = ethers.utils.parseEther('50000')
    const depositAmountPntHolder2 = ethers.utils.parseEther('5000')
    let lockTime = EPOCH_DURATION * 5

    await pnt.connect(pntHolder1).approve(borrowingManager.address, INFINITE)
    await pnt.connect(pntHolder2).approve(borrowingManager.address, INFINITE)
    await pnt.approve(borrowingManager.address, INFINITE)
    await borrowingManager.connect(pntHolder1).lend(depositAmountPntHolder1, lockTime, pntHolder1.address)
    await pnt.connect(pntHolder1).transfer(owner.address, depositInterestAmount.mul(10))

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(1)
    await borrowingManager.connect(pntHolder2).lend(depositAmountPntHolder2, lockTime, pntHolder2.address)

    for (let i = 0; i < 2; i++) {
      await borrowingManager.depositInterest(pnt.address, 1, depositInterestAmount)
      // ((50k / 50k) + (4/4)) / 2 = 1 = 100%   --->   10000
      await expect(borrowingManager.connect(pntHolder1).claimInterestByEpoch(pnt.address, 1))
        .to.emit(borrowingManager, 'InterestClaimed')
        .withArgs(pntHolder1.address, pnt.address, 1, depositInterestAmount)

      if (i === 0) {
        await time.increase(EPOCH_DURATION)
        expect(await epochsManager.currentEpoch()).to.be.equal(2)
      }
    }

    for (let i = 0; i < 2; i++) {
      await borrowingManager.depositInterest(pnt.address, 2, depositInterestAmount)
      // ((50k / 55k) + (3/7)) / 2 = 0.66883116883116883   --->   10000 * 0.66883116883116883 = 6688.3116883116883
      await expect(borrowingManager.connect(pntHolder1).claimInterestByEpoch(pnt.address, 2))
        .to.emit(borrowingManager, 'InterestClaimed')
        .withArgs(pntHolder1.address, pnt.address, 2, ethers.utils.parseEther('6688.3116883116883'))
      // ((5k / 55k) + (4/7)) / 2 = 0.331168831168831168   --->   10000 * 0.331168831168831168 = 3311.68831168831168
      await expect(borrowingManager.connect(pntHolder2).claimInterestByEpoch(pnt.address, 2))
        .to.emit(borrowingManager, 'InterestClaimed')
        .withArgs(pntHolder2.address, pnt.address, 2, ethers.utils.parseEther('3311.68831168831168'))

      if (i === 0) {
        await time.increase(EPOCH_DURATION)
        expect(await epochsManager.currentEpoch()).to.be.equal(3)
      }
    }

    await expect(borrowingManager.connect(pntHolder1).claimInterestByEpoch(pnt.address, 3)).to.be.revertedWithCustomError(
      borrowingManager,
      'NothingToClaim'
    )
    await time.increase(EPOCH_DURATION)
    await expect(borrowingManager.connect(pntHolder1).claimInterestByEpoch(pnt.address, 3)).to.be.revertedWithCustomError(
      borrowingManager,
      'NothingToClaim'
    )

    expect(await epochsManager.currentEpoch()).to.be.equal(4)
    await expect(borrowingManager.connect(pntHolder1).claimInterestByEpoch(pnt.address, 4)).to.be.revertedWithCustomError(
      borrowingManager,
      'NothingToClaim'
    )
    await time.increase(EPOCH_DURATION)
    await expect(borrowingManager.connect(pntHolder1).claimInterestByEpoch(pnt.address, 4)).to.be.revertedWithCustomError(
      borrowingManager,
      'NothingToClaim'
    )

    expect(await epochsManager.currentEpoch()).to.be.equal(5)

    for (let i = 0; i < 2; i++) {
      await borrowingManager.depositInterest(pnt.address, 5, depositInterestAmount)
      // ((5k / 5k) + (1/1)) / 2 = 1   --->   10000 * 1 = 10000
      await expect(borrowingManager.connect(pntHolder2).claimInterestByEpoch(pnt.address, 5))
        .to.emit(borrowingManager, 'InterestClaimed')
        .withArgs(pntHolder2.address, pnt.address, 5, ethers.utils.parseEther('10000'))

      if (i === 0) {
        await time.increase(EPOCH_DURATION)
        expect(await epochsManager.currentEpoch()).to.be.equal(6)
      }
    }
  })

  it('should update correctly the number of epochs left when 2 lend happen in 2 consecutive epochs', async () => {
    //
    //   pntHolder1 - 1 lend -> [1, 4]
    //                  50k         50k        50k        50k
    //   |-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|----------|
    //   0          1          2          3          4          5          6          7          8
    //
    //    epochs left
    //                    4         3          2         1
    //   |----------|vvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|----------|----------|
    //   0          1         2          3          4          5          6          7          8
    //
    //   pntHolder1 - 2 lend -> [2, 5]
    //                             5k         5k         5k         5k
    //   |----------|-----xxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx------|----------|
    //   0          1         2          3          4          5          6          7          8
    //
    //   epochs left
    //                    5         4          3         2           1
    //   |----------|vvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|----------|
    //   0          1         2          3          4          5          6          7          8
    //

    const depositInterestAmount = ethers.utils.parseEther('10000')
    const depositAmountPntHolder1 = ethers.utils.parseEther('50000')
    let lockTime = EPOCH_DURATION * 5

    await pnt.connect(pntHolder1).approve(borrowingManager.address, INFINITE)
    await pnt.approve(borrowingManager.address, INFINITE)

    await borrowingManager.connect(pntHolder1).lend(depositAmountPntHolder1, lockTime, pntHolder1.address)
    await pnt.connect(pntHolder1).transfer(owner.address, depositInterestAmount.mul(2))

    await borrowingManager.depositInterest(pnt.address, 1, depositInterestAmount)
    await borrowingManager.depositInterest(pnt.address, 2, depositInterestAmount)

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(1)
    await borrowingManager.connect(pntHolder1).lend(depositAmountPntHolder1, lockTime, pntHolder2.address)

    expect(await borrowingManager.loanStartEpochOf(pntHolder1.address)).to.be.eq(1)
    expect(await borrowingManager.loanEndEpochOf(pntHolder1.address)).to.be.eq(5)

    await expect(borrowingManager.connect(pntHolder1).claimInterestByEpoch(pnt.address, 1))
      .to.emit(borrowingManager, 'InterestClaimed')
      .withArgs(pntHolder1.address, pnt.address, 1, depositInterestAmount)
  })

  it('should update correctly the number of epochs left when a lend happens with all possible epochs duration combinations', async () => {
    //
    //   pntHolder1 - lend -> [1, 4]
    //
    //   |-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|----------|
    //   0          1          2          3          4          5          6          7          8
    //
    //
    //   pntHolder1 - lend -> [2, 4]
    //
    //   |----------|-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|-----------|----------|
    //   0          1          2          3          4          5          6           7          8
    //
    //
    //   pntHolder1 - lend -> [3, 5]
    //
    //   |----------|----------|-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|-----------|----------|
    //   0          1          2          3          4          5          6           7          8
    //
    //   pntHolder1 - lend -> [4, 6]
    //
    //   |----------|----------|----------|-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4          5          6           7          8
    //
    //
    //   pntHolder1 - lend -> [10, 13]
    //
    //   |----------|---------|----------|----------|----------|----------|-----------|----------|----------|-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1         2          3          4          5          6           7          8          9          10         11         12         13        14

    const depositAmount = ethers.utils.parseEther('50000')

    await pnt.connect(pntHolder1).approve(borrowingManager.address, INFINITE)
    await pnt.approve(borrowingManager.address, INFINITE)

    await borrowingManager.connect(pntHolder1).lend(depositAmount, EPOCH_DURATION * 5, pntHolder1.address)
    expect(await borrowingManager.loanStartEpochOf(pntHolder1.address)).to.be.eq(1)
    expect(await borrowingManager.loanEndEpochOf(pntHolder1.address)).to.be.eq(4)
    expect(await borrowingManager.totalEpochsLeftByEpoch(1)).to.be.eq(4)
    expect(await borrowingManager.totalLendedAmountByEpoch(1)).to.be.eq(truncateWithPrecision(depositAmount))
    expect(await borrowingManager.totalLendedAmountByEpoch(2)).to.be.eq(truncateWithPrecision(depositAmount))
    expect(await borrowingManager.totalLendedAmountByEpoch(3)).to.be.eq(truncateWithPrecision(depositAmount))
    expect(await borrowingManager.totalLendedAmountByEpoch(4)).to.be.eq(truncateWithPrecision(depositAmount))

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(1)
    await borrowingManager.connect(pntHolder1).lend(depositAmount, EPOCH_DURATION * 3, pntHolder2.address)
    expect(await borrowingManager.loanStartEpochOf(pntHolder1.address)).to.be.eq(1)
    expect(await borrowingManager.loanEndEpochOf(pntHolder1.address)).to.be.eq(4)
    expect(await borrowingManager.totalEpochsLeftByEpoch(1)).to.be.eq(4)
    expect(await borrowingManager.totalLendedAmountByEpoch(1)).to.be.eq(truncateWithPrecision(depositAmount))
    expect(await borrowingManager.totalLendedAmountByEpoch(2)).to.be.eq(truncateWithPrecision(depositAmount).mul(2))
    expect(await borrowingManager.totalLendedAmountByEpoch(3)).to.be.eq(truncateWithPrecision(depositAmount).mul(2))
    expect(await borrowingManager.totalLendedAmountByEpoch(4)).to.be.eq(truncateWithPrecision(depositAmount))

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)
    await borrowingManager.connect(pntHolder1).lend(depositAmount, EPOCH_DURATION * 3, pntHolder2.address)
    expect(await borrowingManager.loanStartEpochOf(pntHolder1.address)).to.be.eq(1)
    expect(await borrowingManager.loanEndEpochOf(pntHolder1.address)).to.be.eq(4)
    expect(await borrowingManager.totalEpochsLeftByEpoch(1)).to.be.eq(4)
    expect(await borrowingManager.totalLendedAmountByEpoch(1)).to.be.eq(truncateWithPrecision(depositAmount))
    expect(await borrowingManager.totalLendedAmountByEpoch(2)).to.be.eq(truncateWithPrecision(depositAmount).mul(2))
    expect(await borrowingManager.totalLendedAmountByEpoch(3)).to.be.eq(truncateWithPrecision(depositAmount).mul(3))
    expect(await borrowingManager.totalLendedAmountByEpoch(4)).to.be.eq(truncateWithPrecision(depositAmount).mul(2))

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(3)
    await borrowingManager.connect(pntHolder1).lend(depositAmount, EPOCH_DURATION * 4, pntHolder2.address)
    expect(await borrowingManager.loanStartEpochOf(pntHolder1.address)).to.be.eq(1)
    expect(await borrowingManager.loanEndEpochOf(pntHolder1.address)).to.be.eq(6)
    expect(await borrowingManager.totalEpochsLeftByEpoch(1)).to.be.eq(6)
    expect(await borrowingManager.totalLendedAmountByEpoch(1)).to.be.eq(truncateWithPrecision(depositAmount))
    expect(await borrowingManager.totalLendedAmountByEpoch(2)).to.be.eq(truncateWithPrecision(depositAmount).mul(2))
    expect(await borrowingManager.totalLendedAmountByEpoch(3)).to.be.eq(truncateWithPrecision(depositAmount).mul(3))
    expect(await borrowingManager.totalLendedAmountByEpoch(4)).to.be.eq(truncateWithPrecision(depositAmount).mul(3))
    expect(await borrowingManager.totalLendedAmountByEpoch(5)).to.be.eq(truncateWithPrecision(depositAmount))
    expect(await borrowingManager.totalLendedAmountByEpoch(6)).to.be.eq(truncateWithPrecision(depositAmount))

    await time.increase(EPOCH_DURATION * 6)
    expect(await epochsManager.currentEpoch()).to.be.equal(9)
    await borrowingManager.connect(pntHolder1).lend(depositAmount, EPOCH_DURATION * 5, pntHolder1.address)

    expect(await borrowingManager.loanStartEpochOf(pntHolder1.address)).to.be.eq(10)
    expect(await borrowingManager.loanEndEpochOf(pntHolder1.address)).to.be.eq(13)
    expect(await borrowingManager.totalLendedAmountByEpoch(10)).to.be.eq(truncateWithPrecision(depositAmount))
    expect(await borrowingManager.totalLendedAmountByEpoch(11)).to.be.eq(truncateWithPrecision(depositAmount))
    expect(await borrowingManager.totalLendedAmountByEpoch(12)).to.be.eq(truncateWithPrecision(depositAmount))
    expect(await borrowingManager.totalLendedAmountByEpoch(13)).to.be.eq(truncateWithPrecision(depositAmount))
  })*/
})
