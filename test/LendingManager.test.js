const { expect } = require('chai')
const { ethers, upgrades, config } = require('hardhat')
const { time } = require('@nomicfoundation/hardhat-network-helpers')
const { getRole, truncateWithPrecision } = require('./utils')
const {
  ACL_ADDRESS,
  DAO_ROOT_ADDRESS,
  EPOCH_DURATION,
  INFINITE,
  LEND_MAX_EPOCHS,
  ONE_DAY,
  PNETWORK_CHAIN_IDS,
  PNT_ADDRESS,
  PNT_HOLDER_1_ADDRESS,
  PNT_HOLDER_2_ADDRESS,
  PNT_MAX_TOTAL_SUPPLY,
  TOKEN_MANAGER_ADDRESS
} = require('./constants')

let daoRoot, acl, stakingManager, epochsManager, pnt, owner, pntHolder1, pntHolder2, user1, user2, LendingManager, fakeForwarder, dandelionVoting
let BORROW_ROLE, UPGRADE_ROLE

describe('LendingManager', () => {
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

    LendingManager = await ethers.getContractFactory('LendingManager')
    const EpochsManager = await ethers.getContractFactory('EpochsManager')
    const StakingManager = await ethers.getContractFactory('StakingManagerPermissioned')
    const ERC20 = await ethers.getContractFactory('ERC20')
    const ACL = await ethers.getContractFactory('ACL')
    const MockDandelionVotingContract = await ethers.getContractFactory('MockDandelionVotingContract')

    const signers = await ethers.getSigners()
    owner = signers[0]
    user1 = signers[1]
    user2 = signers[2]
    fakeForwarder = signers[3]
    pntHolder1 = await ethers.getImpersonatedSigner(PNT_HOLDER_1_ADDRESS)
    pntHolder2 = await ethers.getImpersonatedSigner(PNT_HOLDER_2_ADDRESS)
    daoRoot = await ethers.getImpersonatedSigner(DAO_ROOT_ADDRESS)

    pnt = await ERC20.attach(PNT_ADDRESS)
    acl = await ACL.attach(ACL_ADDRESS)
    dandelionVoting = await MockDandelionVotingContract.deploy()
    await dandelionVoting.setTestStartDate(EPOCH_DURATION * 1000) // this is needed to don't break normal tests

    stakingManager = await upgrades.deployProxy(StakingManager, [PNT_ADDRESS, TOKEN_MANAGER_ADDRESS, fakeForwarder.address, PNT_MAX_TOTAL_SUPPLY], {
      initializer: 'initialize',
      kind: 'uups'
    })

    epochsManager = await upgrades.deployProxy(EpochsManager, [EPOCH_DURATION], {
      initializer: 'initialize',
      kind: 'uups'
    })

    lendingManager = await upgrades.deployProxy(
      LendingManager,
      [pnt.address, stakingManager.address, epochsManager.address, fakeForwarder.address, dandelionVoting.address, LEND_MAX_EPOCHS],
      {
        initializer: 'initialize',
        kind: 'uups'
      }
    )

    // roles
    BORROW_ROLE = getRole('BORROW_ROLE')
    RELEASE_ROLE = getRole('RELEASE_ROLE')
    STAKE_ROLE = getRole('STAKE_ROLE')
    INCREASE_DURATION_ROLE = getRole('INCREASE_DURATION_ROLE')
    UPGRADE_ROLE = getRole('UPGRADE_ROLE')

    // grant roles
    await lendingManager.grantRole(BORROW_ROLE, owner.address)
    await lendingManager.grantRole(BORROW_ROLE, user1.address)
    await lendingManager.grantRole(BORROW_ROLE, user2.address)
    await lendingManager.grantRole(RELEASE_ROLE, owner.address)
    await lendingManager.grantRole(UPGRADE_ROLE, owner.address)
    await stakingManager.grantRole(STAKE_ROLE, lendingManager.address)
    await stakingManager.grantRole(INCREASE_DURATION_ROLE, lendingManager.address)
    await acl.connect(daoRoot).grantPermission(stakingManager.address, TOKEN_MANAGER_ADDRESS, getRole('MINT_ROLE'))
    await acl.connect(daoRoot).grantPermission(stakingManager.address, TOKEN_MANAGER_ADDRESS, getRole('BURN_ROLE'))

    await owner.sendTransaction({
      to: pntHolder1.address,
      value: ethers.utils.parseEther('10')
    })
    await owner.sendTransaction({
      to: pntHolder2.address,
      value: ethers.utils.parseEther('10')
    })
  })

  it('should not be able to lend for more than lendMaxEpochs', async () => {
    const amount = ethers.utils.parseEther('1000')
    const lendMaxEpochs = await lendingManager.lendMaxEpochs()
    const duration = EPOCH_DURATION * (lendMaxEpochs + 3)
    await pnt.connect(pntHolder1).approve(lendingManager.address, amount)
    await expect(lendingManager.connect(pntHolder1).lend(pntHolder1.address, amount, duration)).to.be.revertedWithCustomError(
      lendingManager,
      'LendPeriodTooBig'
    )
  })

  it('should be able to lend at the epoch 0 for 2 epochs (epoch 1 & 2) even if the duration finishes at epoch 3', async () => {
    const amount = ethers.utils.parseEther('1000')
    const duration = EPOCH_DURATION * 2 + ONE_DAY
    const currentEpoch = parseInt(await epochsManager.currentEpoch())
    const epochDuration = parseInt(await epochsManager.epochDuration())
    const epochs = parseInt(duration / epochDuration)

    await pnt.connect(pntHolder1).approve(lendingManager.address, amount)

    await expect(lendingManager.connect(pntHolder1).lend(pntHolder1.address, amount, duration))
      .to.emit(lendingManager, 'Lended')
      .withArgs(pntHolder1.address, currentEpoch + 1, currentEpoch + epochs - 1, amount)
    for (let epoch = currentEpoch + 1; epoch < epochs; epoch++) {
      expect(await lendingManager.borrowableAmountByEpoch(epoch)).to.be.eq(truncateWithPrecision(amount))
    }

    // the lend above becomes available in the next epoch
    expect(await lendingManager.borrowableAmountByEpoch(currentEpoch)).to.be.eq(0)
    expect(await lendingManager.borrowableAmountByEpoch(currentEpoch + 1 + epochs)).to.be.eq(0)
  })

  it('should be able to lend in the middle of epoch 0 for 2 epochs (epoch 1 & 2) even if the duration finishes at epoch 3', async () => {
    const amount = ethers.utils.parseEther('1000')
    const duration = EPOCH_DURATION * 2 + ONE_DAY
    const currentEpoch = parseInt(await epochsManager.currentEpoch())
    const epochDuration = parseInt(await epochsManager.epochDuration())
    const epochs = parseInt(duration / epochDuration)

    await time.increase(parseInt(EPOCH_DURATION / 2))
    await pnt.connect(pntHolder1).approve(lendingManager.address, amount)

    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, amount, duration)
    for (let epoch = currentEpoch + 1; epoch < epochs; epoch++) {
      expect(await lendingManager.borrowableAmountByEpoch(epoch)).to.be.eq(truncateWithPrecision(amount))
    }

    // the lend above becomes available in the next epoch
    expect(await lendingManager.borrowableAmountByEpoch(currentEpoch)).to.be.eq(0)
    expect(await lendingManager.borrowableAmountByEpoch(currentEpoch + 1 + epochs)).to.be.eq(0)
  })

  it('should not be able to borrow for 2 epochs if the corresponding borrowed amount is available just for 1 epochs', async () => {
    //   |-----xxxxx|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3
    const amount = ethers.utils.parseEther('1000')
    const duration = EPOCH_DURATION * 2
    await pnt.connect(pntHolder1).approve(lendingManager.address, amount)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, amount, duration)
    await expect(lendingManager.borrow(amount, 2, owner.address)).to.be.revertedWithCustomError(lendingManager, 'AmountNotAvailableInEpoch')
  })

  it('should be be able to borrow for 1 epoch (at epoch 0 for epoch 1) if the lend happens in the middle of epoch 0 and the duration is equal to the epoch duration', async () => {
    //  |-----xxxxx|vvvvvvvvvv|xxxxx-----|
    //  0          1          2          3

    const amount = ethers.utils.parseEther('1000')
    const duration = EPOCH_DURATION * 2
    await pnt.connect(pntHolder1).approve(lendingManager.address, amount)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, amount, duration)

    expect(await lendingManager.borrowableAmountByEpoch(0)).to.be.eq(0)
    expect(await lendingManager.borrowableAmountByEpoch(1)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.borrowableAmountByEpoch(2)).to.be.eq(0)

    await expect(lendingManager.borrow(amount, 1, owner.address)).to.emit(lendingManager, 'Borrowed').withArgs(owner.address, 1, amount)
    expect(await lendingManager.borrowedAmountByEpochOf(owner.address, 1)).to.be.eq(truncateWithPrecision(amount))
  })

  it('should be able to borrow for 3 epochs (at epoch 2 for epoch 3,4,5) if the lend happens in the middle of epoch 2', async () => {
    //   |----------|----------|----xxxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|
    //   0          1          2          3          4          5         6           7          8

    const amount = ethers.utils.parseEther('1000')
    const duration = EPOCH_DURATION * 4

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    await pnt.connect(pntHolder1).approve(lendingManager.address, amount)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, amount, duration)

    expect(await lendingManager.borrowableAmountByEpoch(2)).to.be.eq(0)
    expect(await lendingManager.borrowableAmountByEpoch(3)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.borrowableAmountByEpoch(4)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.borrowableAmountByEpoch(5)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.borrowableAmountByEpoch(6)).to.be.eq(0)

    for (let epoch = 3; epoch <= 5; epoch++) {
      await expect(lendingManager.borrow(amount, epoch, owner.address)).to.emit(lendingManager, 'Borrowed').withArgs(owner.address, epoch, amount)
    }

    expect(await lendingManager.borrowedAmountByEpochOf(owner.address, 3)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.borrowedAmountByEpochOf(owner.address, 4)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.borrowedAmountByEpochOf(owner.address, 5)).to.be.eq(truncateWithPrecision(amount))
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
    const duration = EPOCH_DURATION * 4

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    await pnt.connect(pntHolder1).approve(lendingManager.address, depositAmount)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, depositAmount, duration)

    expect(await lendingManager.borrowableAmountByEpoch(2)).to.be.eq(0)
    expect(await lendingManager.borrowableAmountByEpoch(3)).to.be.eq(truncateWithPrecision(depositAmount))
    expect(await lendingManager.borrowableAmountByEpoch(4)).to.be.eq(truncateWithPrecision(depositAmount))
    expect(await lendingManager.borrowableAmountByEpoch(5)).to.be.eq(truncateWithPrecision(depositAmount))
    expect(await lendingManager.borrowableAmountByEpoch(6)).to.be.eq(0)

    for (let epoch = 3; epoch <= 5; epoch++) {
      await expect(lendingManager.borrow(borrowAmount, epoch, user2.address))
        .to.emit(lendingManager, 'Borrowed')
        .withArgs(user2.address, epoch, borrowAmount)

      await expect(lendingManager.connect(user1).borrow(borrowAmount, epoch, user1.address))
        .to.emit(lendingManager, 'Borrowed')
        .withArgs(user1.address, epoch, borrowAmount)
    }
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
    const lockTimePntHolder1 = EPOCH_DURATION * 3
    const lockTimePntHolder2 = EPOCH_DURATION * 5

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    await pnt.connect(pntHolder1).approve(lendingManager.address, depositAmountPntHolder1)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, depositAmountPntHolder1, lockTimePntHolder1)

    await pnt.connect(pntHolder2).approve(lendingManager.address, depositAmountPntHolder2)
    await lendingManager.connect(pntHolder2).lend(pntHolder2.address, depositAmountPntHolder2, lockTimePntHolder2)

    const currentEpoch = await epochsManager.currentEpoch()
    expect(currentEpoch).to.be.equal(2)
    expect(await lendingManager.borrowableAmountByEpoch(2)).to.be.eq(0)
    expect(await lendingManager.borrowableAmountByEpoch(3)).to.be.eq(truncateWithPrecision(depositAmountPntHolder12))
    expect(await lendingManager.borrowableAmountByEpoch(4)).to.be.eq(truncateWithPrecision(depositAmountPntHolder12))
    expect(await lendingManager.borrowableAmountByEpoch(5)).to.be.eq(truncateWithPrecision(depositAmountPntHolder2))
    expect(await lendingManager.borrowableAmountByEpoch(6)).to.be.eq(truncateWithPrecision(depositAmountPntHolder2))
    expect(await lendingManager.borrowableAmountByEpoch(7)).to.be.eq(0)

    for (let epoch = 3; epoch <= 4; epoch++) {
      await expect(lendingManager.connect(user2).borrow(borrowAmountUser2, epoch, user2.address))
        .to.emit(lendingManager, 'Borrowed')
        .withArgs(user2.address, epoch, borrowAmountUser2)
    }

    for (let epoch = 3; epoch <= 6; epoch++) {
      await expect(lendingManager.connect(user1).borrow(borrowAmountUser1, epoch, user1.address))
        .to.emit(lendingManager, 'Borrowed')
        .withArgs(user1.address, epoch, borrowAmountUser1)
    }

    expect(await lendingManager.borrowableAmountByEpoch(2)).to.be.eq(0)
    expect(await lendingManager.borrowableAmountByEpoch(3)).to.be.eq(0)
    expect(await lendingManager.borrowableAmountByEpoch(4)).to.be.eq(0)
    expect(await lendingManager.borrowableAmountByEpoch(5)).to.be.eq(0)
    expect(await lendingManager.borrowableAmountByEpoch(6)).to.be.eq(0)
    expect(await lendingManager.borrowableAmountByEpoch(7)).to.be.eq(0)

    await expect(lendingManager.connect(user1).borrow(borrowAmountUser1, 4, user1.address)).to.be.revertedWithCustomError(
      lendingManager,
      'AmountNotAvailableInEpoch'
    )
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
    const lockTimePntHolder1 = EPOCH_DURATION * 3
    const lockTimePntHolder2 = EPOCH_DURATION * 5

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    await pnt.connect(pntHolder1).approve(lendingManager.address, depositAmountPntHolder1)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, depositAmountPntHolder1, lockTimePntHolder1)
    await pnt.connect(pntHolder2).approve(lendingManager.address, depositAmountPntHolder2)
    await lendingManager.connect(pntHolder2).lend(pntHolder2.address, depositAmountPntHolder2, lockTimePntHolder2)

    await time.increase(EPOCH_DURATION * 2)
    const currentEpoch = await epochsManager.currentEpoch()
    expect(currentEpoch).to.be.equal(4)

    for (let epoch = 5; epoch <= 6; epoch++) {
      await expect(lendingManager.connect(user1).borrow(borrowAmountUser1, epoch, user1.address))
        .to.emit(lendingManager, 'Borrowed')
        .withArgs(user1.address, epoch, borrowAmountUser1)
    }

    expect(await lendingManager.borrowableAmountByEpoch(2)).to.be.eq(0)
    expect(await lendingManager.borrowableAmountByEpoch(3)).to.be.eq(truncateWithPrecision(depositAmountPntHolder12))
    expect(await lendingManager.borrowableAmountByEpoch(4)).to.be.eq(truncateWithPrecision(depositAmountPntHolder12))
    expect(await lendingManager.borrowableAmountByEpoch(5)).to.be.eq(truncateWithPrecision(expectedLeftAmountEpoch56))
    expect(await lendingManager.borrowableAmountByEpoch(6)).to.be.eq(truncateWithPrecision(expectedLeftAmountEpoch56))
    expect(await lendingManager.borrowableAmountByEpoch(7)).to.be.eq(0)
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

    await pnt.connect(pntHolder1).approve(lendingManager.address, depositAmountPntHolder1)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, depositAmountPntHolder1, lockTimePntHolder1)
    await pnt.connect(pntHolder2).approve(lendingManager.address, depositAmountPntHolder2)
    await lendingManager.connect(pntHolder2).lend(pntHolder2.address, depositAmountPntHolder2, lockTimePntHolder2)

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(4)

    await expect(lendingManager.connect(user1).borrow(borrowAmountUser1, 7, user1.address)).to.be.revertedWithCustomError(
      lendingManager,
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

    await pnt.connect(pntHolder1).approve(lendingManager.address, depositAmountPntHolder1)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, depositAmountPntHolder1, lockTimePntHolder1)

    await pnt.connect(pntHolder2).approve(lendingManager.address, depositAmountPntHolder2)
    await lendingManager.connect(pntHolder2).lend(pntHolder2.address, depositAmountPntHolder2, lockTimePntHolder2)

    await expect(lendingManager.connect(user1).borrow(borrowAmountUser1, 3, user1.address)).to.be.revertedWithCustomError(
      lendingManager,
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

    await pnt.connect(pntHolder1).approve(lendingManager.address, depositAmountPntHolder1)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, depositAmountPntHolder1, lockTimePntHolder1)

    await time.increase(lockTimePntHolder1 - ONE_DAY)
    expect(await epochsManager.currentEpoch()).to.be.equal(5)
    expect(await lendingManager.borrowableAmountByEpoch(4)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1))
    expect(await lendingManager.borrowableAmountByEpoch(5)).to.be.eq(0)

    // prettier-ignore
    await expect(stakingManager.connect(pntHolder1)['unstake(uint256,bytes4)'](depositAmountPntHolder1, PNETWORK_CHAIN_IDS.polygonMainnet)).to.be.revertedWithCustomError(stakingManager, 'UnfinishedStakingPeriod')

    await time.increase(ONE_DAY + 1)
    const pntHolder1BalancePre = await pnt.balanceOf(pntHolder1.address)
    await stakingManager.connect(pntHolder1)['unstake(uint256,bytes4)'](depositAmountPntHolder1, PNETWORK_CHAIN_IDS.polygonMainnet)
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
    await pnt.connect(pntHolder1).approve(lendingManager.address, depositAmountPntHolder1)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, depositAmountPntHolder1, lockTimePntHolder1)

    const borrowAmount1 = ethers.utils.parseEther('1000')
    for (let epoch = 1; epoch <= 3; epoch++) {
      await expect(lendingManager.connect(user1).borrow(borrowAmount1, epoch, user1.address))
        .to.emit(lendingManager, 'Borrowed')
        .withArgs(user1.address, epoch, borrowAmount1)
    }

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(1)
    //expect(await lendingManager.getBorrowingEndEpochOf(user1.address)).to.be.eq(3)

    const borrowAmount2 = ethers.utils.parseEther('2000')
    for (let epoch = 2; epoch <= 4; epoch++) {
      await expect(lendingManager.connect(user1).borrow(borrowAmount2, epoch, user1.address))
        .to.emit(lendingManager, 'Borrowed')
        .withArgs(user1.address, epoch, borrowAmount2)
    }

    expect(await lendingManager.borrowableAmountByEpoch(0)).to.be.eq(0)
    expect(await lendingManager.borrowableAmountByEpoch(1)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount1)))
    expect(await lendingManager.borrowableAmountByEpoch(2)).to.be.eq(
      truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount1.add(borrowAmount2)))
    )
    expect(await lendingManager.borrowableAmountByEpoch(3)).to.be.eq(
      truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount1.add(borrowAmount2)))
    )
    expect(await lendingManager.borrowableAmountByEpoch(4)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount2)))
    expect(await lendingManager.borrowableAmountByEpoch(5)).to.be.eq(0)
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
    await pnt.connect(pntHolder1).approve(lendingManager.address, depositAmountPntHolder1)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, depositAmountPntHolder1, lockTimePntHolder1)

    const borrowAmount1 = ethers.utils.parseEther('1000')
    for (let epoch = 1; epoch <= 3; epoch++) {
      await expect(lendingManager.connect(user1).borrow(borrowAmount1, epoch, user1.address))
        .to.emit(lendingManager, 'Borrowed')
        .withArgs(user1.address, epoch, borrowAmount1)
    }

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(1)

    const borrowAmount2 = ethers.utils.parseEther('2000')
    await expect(lendingManager.connect(user1).borrow(borrowAmount2, 2, user1.address))
      .to.emit(lendingManager, 'Borrowed')
      .withArgs(user1.address, 2, borrowAmount2)

    expect(await lendingManager.borrowableAmountByEpoch(0)).to.be.eq(0)
    expect(await lendingManager.borrowableAmountByEpoch(1)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount1)))
    expect(await lendingManager.borrowableAmountByEpoch(2)).to.be.eq(
      truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount1.add(borrowAmount2)))
    )
    expect(await lendingManager.borrowableAmountByEpoch(3)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount1)))
    expect(await lendingManager.borrowableAmountByEpoch(4)).to.be.eq(0)
  })

  it('should not be able to release without having the corresponding role', async () => {
    const expectedError = `AccessControl: account ${user1.address.toLowerCase()} is missing role ${RELEASE_ROLE}`
    await expect(lendingManager.connect(user1).release(user1.address, 0, 1)).to.be.revertedWith(expectedError)
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
    await pnt.connect(pntHolder1).approve(lendingManager.address, depositAmountPntHolder1)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, depositAmountPntHolder1, lockTimePntHolder1)

    const borrowAmount = ethers.utils.parseEther('1000')
    for (let epoch = 1; epoch <= 3; epoch++) {
      await expect(lendingManager.connect(user1).borrow(borrowAmount, epoch, user1.address))
        .to.emit(lendingManager, 'Borrowed')
        .withArgs(user1.address, epoch, borrowAmount)
    }

    expect(await lendingManager.borrowableAmountByEpoch(1)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount)))
    expect(await lendingManager.borrowableAmountByEpoch(2)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount)))
    expect(await lendingManager.borrowableAmountByEpoch(3)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount)))
    expect(await lendingManager.borrowedAmountByEpochOf(user1.address, 1)).to.be.eq(truncateWithPrecision(borrowAmount))
    expect(await lendingManager.borrowedAmountByEpochOf(user1.address, 2)).to.be.eq(truncateWithPrecision(borrowAmount))
    expect(await lendingManager.borrowedAmountByEpochOf(user1.address, 3)).to.be.eq(truncateWithPrecision(borrowAmount))

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)
    await expect(lendingManager.release(user1.address, 2, borrowAmount))
      .to.emit(lendingManager, 'Released')
      .withArgs(user1.address, 2, borrowAmount)

    await expect(lendingManager.release(user1.address, 3, borrowAmount))
      .to.emit(lendingManager, 'Released')
      .withArgs(user1.address, 3, borrowAmount)

    expect(await lendingManager.borrowableAmountByEpoch(1)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount)))
    expect(await lendingManager.borrowableAmountByEpoch(2)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1))
    expect(await lendingManager.borrowableAmountByEpoch(3)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1))
    expect(await lendingManager.borrowedAmountByEpochOf(user1.address, 1)).to.be.eq(truncateWithPrecision(borrowAmount))
    expect(await lendingManager.borrowedAmountByEpochOf(user1.address, 2)).to.be.eq(0)
    expect(await lendingManager.borrowedAmountByEpochOf(user1.address, 3)).to.be.eq(0)
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
    await pnt.connect(pntHolder1).approve(lendingManager.address, depositAmountPntHolder1)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, depositAmountPntHolder1, lockTimePntHolder1)

    const borrowAmount1 = ethers.utils.parseEther('1000')
    for (let epoch = 1; epoch <= 3; epoch++) {
      await expect(lendingManager.connect(user1).borrow(borrowAmount1, epoch, user1.address))
        .to.emit(lendingManager, 'Borrowed')
        .withArgs(user1.address, epoch, borrowAmount1)
    }

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(1)

    await upgrades.upgradeProxy(lendingManager.address, LendingManager, {
      kind: 'uups'
    })

    const borrowAmount2 = ethers.utils.parseEther('2000')
    await expect(lendingManager.connect(user1).borrow(borrowAmount2, 2, user1.address))
      .to.emit(lendingManager, 'Borrowed')
      .withArgs(user1.address, 2, borrowAmount2)

    expect(await lendingManager.borrowableAmountByEpoch(0)).to.be.eq(0)
    expect(await lendingManager.borrowableAmountByEpoch(1)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount1)))
    // prettier-ignore
    expect(await lendingManager.borrowableAmountByEpoch(2)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount1.add(borrowAmount2))))
    expect(await lendingManager.borrowableAmountByEpoch(3)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount1)))
    expect(await lendingManager.borrowableAmountByEpoch(4)).to.be.eq(0)
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
    await pnt.connect(pntHolder1).approve(lendingManager.address, depositAmountPntHolder1)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, depositAmountPntHolder1, lockTimePntHolder1)

    const borrowAmount1 = ethers.utils.parseEther('1000')
    for (let epoch = 1; epoch <= 3; epoch++) {
      await expect(lendingManager.connect(user1).borrow(borrowAmount1, epoch, user1.address))
        .to.emit(lendingManager, 'Borrowed')
        .withArgs(user1.address, epoch, borrowAmount1)
    }

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(1)

    const borrowAmount2 = ethers.utils.parseEther('2000')
    await expect(lendingManager.connect(user1).borrow(borrowAmount2, 2, user1.address))
      .to.emit(lendingManager, 'Borrowed')
      .withArgs(user1.address, 2, borrowAmount2)

    expect(await lendingManager.borrowableAmountByEpoch(0)).to.be.eq(0)
    expect(await lendingManager.borrowableAmountByEpoch(1)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount1)))
    // prettier-ignore
    expect(await lendingManager.borrowableAmountByEpoch(2)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount1.add(borrowAmount2))))
    expect(await lendingManager.borrowableAmountByEpoch(3)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount1)))
    expect(await lendingManager.borrowableAmountByEpoch(4)).to.be.eq(0)
  })

  it('should user1 be able to borrow more than once in differents epochs by changing the start epoch (1)', async () => {
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
    await pnt.connect(pntHolder1).approve(lendingManager.address, depositAmountPntHolder1)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, depositAmountPntHolder1, lockTimePntHolder1)

    const borrowAmount1 = ethers.utils.parseEther('1000')
    for (let epoch = 1; epoch <= 3; epoch++) {
      await expect(lendingManager.connect(user1).borrow(borrowAmount1, epoch, user1.address))
        .to.emit(lendingManager, 'Borrowed')
        .withArgs(user1.address, epoch, borrowAmount1)
    }

    await time.increase(EPOCH_DURATION * 4)
    expect(await epochsManager.currentEpoch()).to.be.equal(4)

    const borrowAmount2 = ethers.utils.parseEther('2000')
    for (let epoch = 5; epoch <= 6; epoch++) {
      await expect(lendingManager.connect(user1).borrow(borrowAmount2, epoch, user1.address))
        .to.emit(lendingManager, 'Borrowed')
        .withArgs(user1.address, epoch, borrowAmount2)
    }

    expect(await lendingManager.borrowableAmountByEpoch(0)).to.be.eq(0)
    expect(await lendingManager.borrowableAmountByEpoch(1)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount1)))
    expect(await lendingManager.borrowableAmountByEpoch(2)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount1)))
    expect(await lendingManager.borrowableAmountByEpoch(3)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount1)))
    expect(await lendingManager.borrowableAmountByEpoch(4)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1))
    expect(await lendingManager.borrowableAmountByEpoch(5)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount2)))
    expect(await lendingManager.borrowableAmountByEpoch(6)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount2)))
  })

  it('should user1 be able to borrow more than once in differents epochs by changing the start epoch (2)', async () => {
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
    await pnt.connect(pntHolder1).approve(lendingManager.address, depositAmountPntHolder1)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, depositAmountPntHolder1, lockTimePntHolder1)

    const borrowAmount1 = ethers.utils.parseEther('1000')
    for (let epoch = 1; epoch <= 3; epoch++) {
      await expect(lendingManager.connect(user1).borrow(borrowAmount1, epoch, user1.address))
        .to.emit(lendingManager, 'Borrowed')
        .withArgs(user1.address, epoch, borrowAmount1)
    }

    await time.increase(EPOCH_DURATION * 4)
    expect(await epochsManager.currentEpoch()).to.be.equal(4)

    const borrowAmount2 = ethers.utils.parseEther('2000')
    await expect(lendingManager.connect(user1).borrow(borrowAmount2, 5, user1.address))
      .to.emit(lendingManager, 'Borrowed')
      .withArgs(user1.address, 5, borrowAmount2)

    expect(await lendingManager.borrowableAmountByEpoch(0)).to.be.eq(0)
    expect(await lendingManager.borrowableAmountByEpoch(1)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount1)))
    expect(await lendingManager.borrowableAmountByEpoch(2)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount1)))
    expect(await lendingManager.borrowableAmountByEpoch(3)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount1)))
    expect(await lendingManager.borrowableAmountByEpoch(4)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1))
    expect(await lendingManager.borrowableAmountByEpoch(5)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.sub(borrowAmount2)))
    expect(await lendingManager.borrowableAmountByEpoch(6)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1))
    expect(await lendingManager.borrowableAmountByEpoch(7)).to.be.eq(0)
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

    await pnt.connect(pntHolder1).approve(lendingManager.address, depositAmountPntHolder1)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, depositAmountPntHolder1, lockTimePntHolder1)
    expect(await lendingManager.borrowableAmountByEpoch(0)).to.be.eq(0)
    expect(await lendingManager.borrowableAmountByEpoch(1)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1))
    expect(await lendingManager.borrowableAmountByEpoch(2)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1))
    expect(await lendingManager.borrowableAmountByEpoch(3)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1))
    expect(await lendingManager.borrowableAmountByEpoch(4)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1))
    expect(await lendingManager.borrowableAmountByEpoch(5)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1))
    expect(await lendingManager.borrowableAmountByEpoch(6)).to.be.eq(0)

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    lockTimePntHolder1 = EPOCH_DURATION * 3
    await pnt.connect(pntHolder1).approve(lendingManager.address, depositAmountPntHolder1)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, depositAmountPntHolder1, lockTimePntHolder1)
    expect(await lendingManager.borrowableAmountByEpoch(0)).to.be.eq(0)
    expect(await lendingManager.borrowableAmountByEpoch(1)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1))
    expect(await lendingManager.borrowableAmountByEpoch(2)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1))
    expect(await lendingManager.borrowableAmountByEpoch(3)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.mul(2)))
    expect(await lendingManager.borrowableAmountByEpoch(4)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.mul(2)))
    expect(await lendingManager.borrowableAmountByEpoch(5)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1))
    expect(await lendingManager.borrowableAmountByEpoch(6)).to.be.eq(0)

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(4)

    await pnt.connect(pntHolder1).approve(lendingManager.address, depositAmountPntHolder1)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, depositAmountPntHolder1, lockTimePntHolder1)
    expect(await lendingManager.borrowableAmountByEpoch(1)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1))
    expect(await lendingManager.borrowableAmountByEpoch(2)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1))
    expect(await lendingManager.borrowableAmountByEpoch(3)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.mul(2)))
    expect(await lendingManager.borrowableAmountByEpoch(4)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.mul(2)))
    expect(await lendingManager.borrowableAmountByEpoch(5)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1.mul(2)))
    expect(await lendingManager.borrowableAmountByEpoch(6)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1))
    expect(await lendingManager.borrowableAmountByEpoch(7)).to.be.eq(0)

    await time.increase(EPOCH_DURATION * 3)
    expect(await epochsManager.currentEpoch()).to.be.equal(7)

    await pnt.connect(pntHolder1).approve(lendingManager.address, depositAmountPntHolder1)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, depositAmountPntHolder1, lockTimePntHolder1)
    expect(await lendingManager.borrowableAmountByEpoch(7)).to.be.eq(0)
    expect(await lendingManager.borrowableAmountByEpoch(8)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1))
    expect(await lendingManager.borrowableAmountByEpoch(9)).to.be.eq(truncateWithPrecision(depositAmountPntHolder1))
    expect(await lendingManager.borrowableAmountByEpoch(10)).to.be.eq(0)
  })

  it('should be able to claim correcly the reward earned (1)', async () => {
    //
    //   pntHolder1 - 1 lend -> [1, 5]
    //                  w=200k    w=150k     w=100k      w=50k
    //   |-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|----------|
    //   0          1          2          3          4          5          6          7          8
    //
    //
    //   pntHolder2 - 2 lend -> [2, 6]
    //                            w=20k      w=15k      w=10k      w=5k
    //   |----------|-----xxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx------|----------|
    //   0          1         2          3          4          5          6           7          8
    //
    //
    //    result:
    //
    //    poolSize
    //                   50k        55k       55k        55k         5k
    //   |----------|vvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|----------|
    //   0          1         2          3          4          5          6          7          8
    //
    //    rewards
    //                   10k        10k         0        0         10k
    //   |----------|vvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|----------|
    //   0          1         2          3          4          5          6          7          8

    const depositRewardAmount = ethers.utils.parseEther('10000')
    const depositAmountPntHolder1 = ethers.utils.parseEther('50000')
    const depositAmountPntHolder2 = ethers.utils.parseEther('5000')
    let duration = EPOCH_DURATION * 5

    await pnt.connect(pntHolder1).approve(lendingManager.address, INFINITE)
    await pnt.connect(pntHolder2).approve(lendingManager.address, INFINITE)
    await pnt.approve(lendingManager.address, INFINITE)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, depositAmountPntHolder1, duration)
    await pnt.connect(pntHolder1).transfer(owner.address, depositRewardAmount.mul(5))

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(1)
    await lendingManager.connect(pntHolder2).lend(pntHolder2.address, depositAmountPntHolder2, duration)

    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 1)).to.be.eq(200000)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 2)).to.be.eq(150000)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 3)).to.be.eq(100000)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 4)).to.be.eq(50000)
    expect(await lendingManager.weightByEpochOf(pntHolder2.address, 2)).to.be.eq(20000)
    expect(await lendingManager.weightByEpochOf(pntHolder2.address, 3)).to.be.eq(15000)
    expect(await lendingManager.weightByEpochOf(pntHolder2.address, 4)).to.be.eq(10000)
    expect(await lendingManager.weightByEpochOf(pntHolder2.address, 5)).to.be.eq(5000)
    expect(await lendingManager.totalWeightByEpoch(1)).to.be.eq(200000)
    expect(await lendingManager.totalWeightByEpoch(2)).to.be.eq(170000)
    expect(await lendingManager.totalWeightByEpoch(3)).to.be.eq(115000)
    expect(await lendingManager.totalWeightByEpoch(4)).to.be.eq(60000)
    expect(await lendingManager.totalWeightByEpoch(5)).to.be.eq(5000)

    await lendingManager.depositReward(pnt.address, 1, depositRewardAmount)
    await time.increase(EPOCH_DURATION)
    await expect(lendingManager.connect(pntHolder1).claimRewardByEpoch(pnt.address, 1))
      .to.emit(lendingManager, 'RewardClaimed')
      .withArgs(pntHolder1.address, pnt.address, 1, depositRewardAmount)

    await lendingManager.depositReward(pnt.address, 2, depositRewardAmount)
    await time.increase(EPOCH_DURATION)
    await expect(lendingManager.connect(pntHolder1).claimRewardByEpoch(pnt.address, 2))
      .to.emit(lendingManager, 'RewardClaimed')
      .withArgs(pntHolder1.address, pnt.address, 2, ethers.utils.parseEther('8823.529411764705882352'))
    await expect(lendingManager.connect(pntHolder2).claimRewardByEpoch(pnt.address, 2))
      .to.emit(lendingManager, 'RewardClaimed')
      .withArgs(pntHolder2.address, pnt.address, 2, ethers.utils.parseEther('1176.470588235294117647'))

    await time.increase(EPOCH_DURATION)
    await expect(lendingManager.connect(pntHolder1).claimRewardByEpoch(pnt.address, 3)).to.be.revertedWithCustomError(
      lendingManager,
      'NothingToClaim'
    )
    await expect(lendingManager.connect(pntHolder2).claimRewardByEpoch(pnt.address, 3)).to.be.revertedWithCustomError(
      lendingManager,
      'NothingToClaim'
    )

    await time.increase(EPOCH_DURATION)
    await expect(lendingManager.connect(pntHolder1).claimRewardByEpoch(pnt.address, 4)).to.be.revertedWithCustomError(
      lendingManager,
      'NothingToClaim'
    )
    await expect(lendingManager.connect(pntHolder2).claimRewardByEpoch(pnt.address, 4)).to.be.revertedWithCustomError(
      lendingManager,
      'NothingToClaim'
    )

    await lendingManager.depositReward(pnt.address, 5, depositRewardAmount)
    await time.increase(EPOCH_DURATION)
    // ((5k / 5k) + (1/1)) / 2 = 1   --->   10000 * 1 = 10000
    await expect(lendingManager.connect(pntHolder2).claimRewardByEpoch(pnt.address, 5))
      .to.emit(lendingManager, 'RewardClaimed')
      .withArgs(pntHolder2.address, pnt.address, 5, ethers.utils.parseEther('10000'))

    await expect(lendingManager.connect(pntHolder2).claimRewardByEpoch(pnt.address, 5)).to.be.revertedWithCustomError(
      lendingManager,
      'NothingToClaim'
    )
  })

  it('should be able to claim correcly the reward earned (2)', async () => {
    //
    //   pntHolder1 - 1 lend -> [1, 2]
    //                  w=50k
    //   |-----xxxxx|vvvvvvvvvv|xxxxx-----|----------|----------|----------|----------|----------|
    //   0          1          2          3          4          5          6          7          8
    //
    //
    //   pntHolder2 - 2 lend -> [2, 3]
    //                            w=5k
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
    //    rewards
    //                   10k       10k
    //   |----------|vvvvvvvvv|vvvvvvvvvv|----------|----------|----------|----------|----------|
    //   0          1         2          3          4          5          6          7          8

    const depositRewardAmount = ethers.utils.parseEther('10000')
    const depositAmountPntHolder1 = ethers.utils.parseEther('50000')
    const depositAmountPntHolder2 = ethers.utils.parseEther('5000')
    let duration = EPOCH_DURATION * 2

    await pnt.connect(pntHolder1).approve(lendingManager.address, INFINITE)
    await pnt.connect(pntHolder2).approve(lendingManager.address, INFINITE)
    await pnt.approve(lendingManager.address, INFINITE)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, depositAmountPntHolder1, duration)
    await pnt.connect(pntHolder1).transfer(owner.address, depositRewardAmount.mul(5))

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(1)
    await lendingManager.connect(pntHolder2).lend(pntHolder2.address, depositAmountPntHolder2, duration)

    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 1)).to.be.eq(50000)
    expect(await lendingManager.weightByEpochOf(pntHolder2.address, 2)).to.be.eq(5000)
    expect(await lendingManager.totalWeightByEpoch(1)).to.be.eq(50000)
    expect(await lendingManager.totalWeightByEpoch(2)).to.be.eq(5000)

    await lendingManager.depositReward(pnt.address, 1, depositRewardAmount)
    await time.increase(EPOCH_DURATION)
    await expect(lendingManager.connect(pntHolder1).claimRewardByEpoch(pnt.address, 1))
      .to.emit(lendingManager, 'RewardClaimed')
      .withArgs(pntHolder1.address, pnt.address, 1, depositRewardAmount)

    await lendingManager.depositReward(pnt.address, 2, depositRewardAmount)
    await time.increase(EPOCH_DURATION)

    await expect(lendingManager.connect(pntHolder2).claimRewardByEpoch(pnt.address, 2))
      .to.emit(lendingManager, 'RewardClaimed')
      .withArgs(pntHolder2.address, pnt.address, 2, depositRewardAmount)
  })

  it('should not be able to claim the reward if the epoch is not terminated yet', async () => {
    //
    //   pntHolder1 - 1 lend -> [1, 5]
    //                  w=200k    w=150k     w=100k      w=50k
    //   |-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|----------|
    //   0          1          2          3          4          5          6          7          8
    //
    //
    //   pntHolder2 - 2 lend -> [2, 6]
    //                            w=20k      w=15k      w=10k      w=5k
    //   |----------|-----xxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx------|----------|
    //   0          1         2          3          4          5          6           7          8
    //
    //
    //    result:
    //
    //    poolSize
    //                   50k        55k       55k        55k         5k
    //   |----------|vvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|----------|
    //   0          1         2          3          4          5          6          7          8
    //
    //    rewards
    //                10k+10k    10k+10k        0        0        10k+10k
    //   |----------|vvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|----------|
    //   0          1         2          3          4          5          6          7          8

    const depositRewardAmount = ethers.utils.parseEther('10000')
    const depositAmountPntHolder1 = ethers.utils.parseEther('50000')
    const depositAmountPntHolder2 = ethers.utils.parseEther('5000')
    let duration = EPOCH_DURATION * 5

    await pnt.connect(pntHolder1).approve(lendingManager.address, INFINITE)
    await pnt.connect(pntHolder2).approve(lendingManager.address, INFINITE)
    await pnt.approve(lendingManager.address, INFINITE)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, depositAmountPntHolder1, duration)
    await pnt.connect(pntHolder1).transfer(owner.address, depositRewardAmount.mul(10))

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(1)
    await lendingManager.connect(pntHolder2).lend(pntHolder2.address, depositAmountPntHolder2, duration)

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    await lendingManager.depositReward(pnt.address, 1, depositRewardAmount)
    await expect(lendingManager.connect(pntHolder1).claimRewardByEpoch(pnt.address, 1))
      .to.emit(lendingManager, 'RewardClaimed')
      .withArgs(pntHolder1.address, pnt.address, 1, depositRewardAmount)

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(3)

    await lendingManager.depositReward(pnt.address, 2, depositRewardAmount)
    // (50k * 3) / (50k*3 + 5k*4) = 0.8823529411764705882352  ---> 1000 * 0.8823529411764705882352 = 8823.529411764705882352
    await expect(lendingManager.connect(pntHolder1).claimRewardByEpoch(pnt.address, 2))
      .to.emit(lendingManager, 'RewardClaimed')
      .withArgs(pntHolder1.address, pnt.address, 2, ethers.utils.parseEther('8823.529411764705882352'))
    // (5k * 4) / (50k*3 + 5k*4) = 0.1176470588235294117647 ---> 1000 * 0.1176470588235294117647 = 11176.470588235294117647
    await expect(lendingManager.connect(pntHolder2).claimRewardByEpoch(pnt.address, 2))
      .to.emit(lendingManager, 'RewardClaimed')
      .withArgs(pntHolder2.address, pnt.address, 2, ethers.utils.parseEther('1176.470588235294117647'))

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(4)

    await expect(lendingManager.connect(pntHolder1).claimRewardByEpoch(pnt.address, 3)).to.be.revertedWithCustomError(
      lendingManager,
      'NothingToClaim'
    )

    await expect(lendingManager.connect(pntHolder1).claimRewardByEpoch(pnt.address, 4)).to.be.revertedWithCustomError(
      lendingManager,
      'InvalidEpoch'
    )

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(5)
    await expect(lendingManager.connect(pntHolder1).claimRewardByEpoch(pnt.address, 4)).to.be.revertedWithCustomError(
      lendingManager,
      'NothingToClaim'
    )

    await lendingManager.depositReward(pnt.address, 5, depositRewardAmount)

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(6)

    await expect(lendingManager.connect(pntHolder2).claimRewardByEpoch(pnt.address, 5))
      .to.emit(lendingManager, 'RewardClaimed')
      .withArgs(pntHolder2.address, pnt.address, 5, ethers.utils.parseEther('10000'))

    await expect(lendingManager.connect(pntHolder2).claimRewardByEpoch(pnt.address, 5)).to.be.revertedWithCustomError(
      lendingManager,
      'NothingToClaim'
    )
  })

  it('should update correctly the weights when a lend happens with all possible epochs duration combinations', async () => {
    //
    //   pntHolder1 - lend -> [1, 4]
    //                 w=40k       w=30k      w=20k      w=10k
    //   |-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|----------|
    //   0          1          2          3          4          5          6          7          8
    //
    //
    //   pntHolder1 - lend -> [2, 4]
    //                            w=20        w=10k
    //   |----------|-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|-----------|----------|
    //   0          1          2          3          4          5          6           7          8
    //
    //
    //
    //   pntHolder1 - Result-1 (All tokens can be unstaked at the end of epoch 5)
    //
    //                  w=40k      w=50       w=30k     w=10k
    //   |----------|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|-----------|----------|
    //   0          1          2          3          4          5          6           7          8
    //
    //
    //   pntHolder1 - lend -> [3, 5]
    //                                        w=20k     w=10k
    //   |----------|----------|-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|-----------|----------|
    //   0          1          2          3          4          5          6           7          8
    //
    //
    //   pntHolder1 - Result-2 (All tokens can be unstaked at the end of epoch 5)
    //
    //                  w=40k      w=50       w=50k     w=20
    //   |----------|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|-----------|----------|
    //   0          1          2          3          4          5          6           7          8
    //
    //   pntHolder1 - lend -> [4, 6]
    //                                                   w=30k      w=20k     w=10k
    //   |----------|----------|----------|-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4          5          6           7          8
    //
    //   pntHolder1 - Result-3 (All tokens can be unstaked at the end of epoch 6)
    //
    //                  w=40k      w=50       w=50k      w=50      w=20k     w=10k
    //   |----------|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|
    //   0          1          2          3          4          5          6           7          8
    //
    //
    //   pntHolder1 - lend -> [10, 13]
    //                                                                                                                     w=30k      w=20k     w=10k
    //   |----------|---------|----------|----------|----------|----------|-----------|----------|----------|-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1         2          3          4          5          6           7          8          9          10         11         12         13        14
    //
    //   pntHolder1 - Result-4 (All tokens can be unstaked at the end of epoch 12)
    //
    //                  w=40k      w=50       w=50k      w=50      w=20k     w=10k                                        w=30k      w=20k     w=10k
    //   |----------|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|----------|---------|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|---------|
    //   0          1          2          3          4          5          6          7          8          9         10         11         12         13        14

    const depositAmount = ethers.utils.parseEther('10000')
    const truncatedDepositAmount = truncateWithPrecision(depositAmount)

    await pnt.connect(pntHolder1).approve(lendingManager.address, INFINITE)
    await pnt.approve(lendingManager.address, INFINITE)

    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, depositAmount, EPOCH_DURATION * 5)
    expect(await lendingManager.totalLendedAmountByEpoch(1)).to.be.eq(truncatedDepositAmount)
    expect(await lendingManager.totalLendedAmountByEpoch(2)).to.be.eq(truncatedDepositAmount)
    expect(await lendingManager.totalLendedAmountByEpoch(3)).to.be.eq(truncatedDepositAmount)
    expect(await lendingManager.totalLendedAmountByEpoch(4)).to.be.eq(truncatedDepositAmount)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 1)).to.be.eq(40000)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 2)).to.be.eq(30000)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 3)).to.be.eq(20000)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 4)).to.be.eq(10000)
    expect(await lendingManager.totalWeightByEpoch(1)).to.be.eq(40000)
    expect(await lendingManager.totalWeightByEpoch(2)).to.be.eq(30000)
    expect(await lendingManager.totalWeightByEpoch(3)).to.be.eq(20000)
    expect(await lendingManager.totalWeightByEpoch(4)).to.be.eq(10000)

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(1)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, depositAmount, EPOCH_DURATION * 3)
    expect(await lendingManager.totalLendedAmountByEpoch(1)).to.be.eq(truncatedDepositAmount)
    expect(await lendingManager.totalLendedAmountByEpoch(2)).to.be.eq(truncatedDepositAmount.mul(2))
    expect(await lendingManager.totalLendedAmountByEpoch(3)).to.be.eq(truncatedDepositAmount.mul(2))
    expect(await lendingManager.totalLendedAmountByEpoch(4)).to.be.eq(truncatedDepositAmount)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 1)).to.be.eq(40000)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 2)).to.be.eq(50000)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 3)).to.be.eq(30000)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 4)).to.be.eq(10000)
    expect(await lendingManager.totalWeightByEpoch(1)).to.be.eq(40000)
    expect(await lendingManager.totalWeightByEpoch(2)).to.be.eq(50000)
    expect(await lendingManager.totalWeightByEpoch(3)).to.be.eq(30000)
    expect(await lendingManager.totalWeightByEpoch(4)).to.be.eq(10000)

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, depositAmount, EPOCH_DURATION * 3)
    expect(await lendingManager.totalLendedAmountByEpoch(1)).to.be.eq(truncatedDepositAmount)
    expect(await lendingManager.totalLendedAmountByEpoch(2)).to.be.eq(truncatedDepositAmount.mul(2))
    expect(await lendingManager.totalLendedAmountByEpoch(3)).to.be.eq(truncatedDepositAmount.mul(3))
    expect(await lendingManager.totalLendedAmountByEpoch(4)).to.be.eq(truncatedDepositAmount.mul(2))
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 1)).to.be.eq(40000)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 2)).to.be.eq(50000)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 3)).to.be.eq(50000)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 4)).to.be.eq(20000)
    expect(await lendingManager.totalWeightByEpoch(1)).to.be.eq(40000)
    expect(await lendingManager.totalWeightByEpoch(2)).to.be.eq(50000)
    expect(await lendingManager.totalWeightByEpoch(3)).to.be.eq(50000)
    expect(await lendingManager.totalWeightByEpoch(4)).to.be.eq(20000)

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(3)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, depositAmount, EPOCH_DURATION * 4)
    expect(await lendingManager.totalLendedAmountByEpoch(1)).to.be.eq(truncatedDepositAmount)
    expect(await lendingManager.totalLendedAmountByEpoch(2)).to.be.eq(truncatedDepositAmount.mul(2))
    expect(await lendingManager.totalLendedAmountByEpoch(3)).to.be.eq(truncatedDepositAmount.mul(3))
    expect(await lendingManager.totalLendedAmountByEpoch(4)).to.be.eq(truncatedDepositAmount.mul(3))
    expect(await lendingManager.totalLendedAmountByEpoch(5)).to.be.eq(truncatedDepositAmount)
    expect(await lendingManager.totalLendedAmountByEpoch(6)).to.be.eq(truncatedDepositAmount)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 1)).to.be.eq(40000)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 2)).to.be.eq(50000)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 3)).to.be.eq(50000)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 4)).to.be.eq(50000)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 5)).to.be.eq(20000)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 6)).to.be.eq(10000)
    expect(await lendingManager.totalWeightByEpoch(1)).to.be.eq(40000)
    expect(await lendingManager.totalWeightByEpoch(2)).to.be.eq(50000)
    expect(await lendingManager.totalWeightByEpoch(3)).to.be.eq(50000)
    expect(await lendingManager.totalWeightByEpoch(4)).to.be.eq(50000)
    expect(await lendingManager.totalWeightByEpoch(5)).to.be.eq(20000)
    expect(await lendingManager.totalWeightByEpoch(6)).to.be.eq(10000)

    await time.increase(EPOCH_DURATION * 6)
    expect(await epochsManager.currentEpoch()).to.be.equal(9)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, depositAmount, EPOCH_DURATION * 4)

    expect(await lendingManager.totalLendedAmountByEpoch(10)).to.be.eq(truncatedDepositAmount)
    expect(await lendingManager.totalLendedAmountByEpoch(11)).to.be.eq(truncatedDepositAmount)
    expect(await lendingManager.totalLendedAmountByEpoch(12)).to.be.eq(truncatedDepositAmount)
    expect(await lendingManager.totalLendedAmountByEpoch(13)).to.be.eq(0)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 1)).to.be.eq(40000)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 2)).to.be.eq(50000)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 3)).to.be.eq(50000)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 4)).to.be.eq(50000)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 5)).to.be.eq(20000)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 6)).to.be.eq(10000)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 7)).to.be.eq(0)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 8)).to.be.eq(0)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 9)).to.be.eq(0)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 10)).to.be.eq(30000)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 11)).to.be.eq(20000)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 12)).to.be.eq(10000)
    expect(await lendingManager.totalWeightByEpoch(1)).to.be.eq(40000)
    expect(await lendingManager.totalWeightByEpoch(2)).to.be.eq(50000)
    expect(await lendingManager.totalWeightByEpoch(3)).to.be.eq(50000)
    expect(await lendingManager.totalWeightByEpoch(4)).to.be.eq(50000)
    expect(await lendingManager.totalWeightByEpoch(5)).to.be.eq(20000)
    expect(await lendingManager.totalWeightByEpoch(6)).to.be.eq(10000)
    expect(await lendingManager.totalWeightByEpoch(7)).to.be.eq(0)
    expect(await lendingManager.totalWeightByEpoch(8)).to.be.eq(0)
    expect(await lendingManager.totalWeightByEpoch(9)).to.be.eq(0)
    expect(await lendingManager.totalWeightByEpoch(10)).to.be.eq(30000)
    expect(await lendingManager.totalWeightByEpoch(11)).to.be.eq(20000)
    expect(await lendingManager.totalWeightByEpoch(12)).to.be.eq(10000)
  })

  it('should not be able to claim twice with by claiming an asset in many epochs', async () => {
    const depositRewardAmount = ethers.utils.parseEther('10000')
    const depositAmountPntHolder1 = ethers.utils.parseEther('50000')
    let duration = EPOCH_DURATION * 3

    await pnt.connect(pntHolder1).approve(lendingManager.address, INFINITE)
    await pnt.approve(lendingManager.address, INFINITE)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, depositAmountPntHolder1, duration)
    await pnt.connect(pntHolder1).transfer(owner.address, depositRewardAmount.mul(5))

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(1)

    await lendingManager.depositReward(pnt.address, 1, depositRewardAmount)
    await time.increase(EPOCH_DURATION)
    await lendingManager.depositReward(pnt.address, 2, depositRewardAmount)
    await time.increase(EPOCH_DURATION)

    await expect(lendingManager.connect(pntHolder1).claimRewardByEpochsRange(pnt.address, 1, 2))
      .to.emit(lendingManager, 'RewardClaimed')
      .withArgs(pntHolder1.address, pnt.address, 1, depositRewardAmount)
      .and.to.emit(lendingManager, 'RewardClaimed')
      .withArgs(pntHolder1.address, pnt.address, 2, depositRewardAmount)

    await expect(lendingManager.connect(pntHolder1).claimRewardByEpochsRange(pnt.address, 1, 2)).to.revertedWithCustomError(
      lendingManager,
      'NothingToClaim'
    )
  })

  it('should not be able to claim many epochs using an end epoch grater than the current one', async () => {
    await time.increase(EPOCH_DURATION)
    await expect(lendingManager.connect(pntHolder1).claimRewardByEpochsRange(pnt.address, 1, 2)).to.be.revertedWithCustomError(
      lendingManager,
      'InvalidEpoch'
    )
  })

  it('should be able to increase the lend duration by 3 epochs and should not be able to unstake before the ending epoch', async () => {
    //   |----------|----------|----xxxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4          5          6          7          8
    //
    //
    //   increaseDuration at epoch 3 of 3 epochs -> 6 + 3 -> [6,9]
    //
    //   |----------|----------|----------|ooooIDoooo|oooooooooo|oooooooooo|oooooooooo|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|
    //   0          1          2          3          4          5          6          7          8          9          10         11
    //
    //
    //
    //   increaseLendDuration at epoch 3 of 3 epochs -> reset of epoch 4,5 and 6 and adds new ones [7,10]
    //
    //   |----------|----------|----------|----------|rrrrrrrrrr|rrrrrrrrrr|rrrrrrrrrr|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|
    //   0          1          2          3          4          5          6          7          8          9          10         11

    const amount = ethers.utils.parseEther('1000')
    let duration = EPOCH_DURATION * 5

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    await pnt.connect(pntHolder1).approve(lendingManager.address, amount)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, amount, duration)

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(3)
    duration = EPOCH_DURATION * 4
    await expect(lendingManager.connect(pntHolder1)['increaseDuration(uint64)'](duration))
      .to.emit(lendingManager, 'DurationIncreased')
      .withArgs(pntHolder1.address, 10)

    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 3)).to.be.eq(1000 * 4)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 4)).to.be.eq(1000 * 7)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 5)).to.be.eq(1000 * 6)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 6)).to.be.eq(1000 * 5)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 7)).to.be.eq(1000 * 4)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 8)).to.be.eq(1000 * 3)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 9)).to.be.eq(1000 * 2)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 10)).to.be.eq(1000 * 1)

    expect(await lendingManager.borrowableAmountByEpoch(2)).to.be.eq(0)
    expect(await lendingManager.borrowableAmountByEpoch(3)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.borrowableAmountByEpoch(4)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.borrowableAmountByEpoch(5)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.borrowableAmountByEpoch(6)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.borrowableAmountByEpoch(7)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.borrowableAmountByEpoch(8)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.borrowableAmountByEpoch(9)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.borrowableAmountByEpoch(10)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.borrowableAmountByEpoch(11)).to.be.eq(truncateWithPrecision(0))

    expect(await lendingManager.totalLendedAmountByEpoch(2)).to.be.eq(0)
    expect(await lendingManager.totalLendedAmountByEpoch(3)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.totalLendedAmountByEpoch(4)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.totalLendedAmountByEpoch(5)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.totalLendedAmountByEpoch(6)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.totalLendedAmountByEpoch(7)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.totalLendedAmountByEpoch(8)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.totalLendedAmountByEpoch(9)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.totalLendedAmountByEpoch(10)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.totalLendedAmountByEpoch(11)).to.be.eq(0)

    await time.increase(EPOCH_DURATION * 6)
    expect(await epochsManager.currentEpoch()).to.be.equal(9)
    await expect(
      stakingManager.connect(pntHolder1)['unstake(uint256,bytes4)'](amount, PNETWORK_CHAIN_IDS.polygonMainnet)
    ).to.be.revertedWithCustomError(stakingManager, 'UnfinishedStakingPeriod')

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(10)
    await expect(
      stakingManager.connect(pntHolder1)['unstake(uint256,bytes4)'](amount, PNETWORK_CHAIN_IDS.polygonMainnet)
    ).to.be.revertedWithCustomError(stakingManager, 'UnfinishedStakingPeriod')

    await time.increase(EPOCH_DURATION - ONE_DAY)
    expect(await epochsManager.currentEpoch()).to.be.equal(10)
    await expect(
      stakingManager.connect(pntHolder1)['unstake(uint256,bytes4)'](amount, PNETWORK_CHAIN_IDS.polygonMainnet)
    ).to.be.revertedWithCustomError(stakingManager, 'UnfinishedStakingPeriod')

    const stake = await stakingManager.stakeOf(pntHolder1.address)
    await time.increaseTo(stake.endDate)
    expect(await epochsManager.currentEpoch()).to.be.equal(11)
    await expect(stakingManager.connect(pntHolder1)['unstake(uint256,bytes4)'](amount, PNETWORK_CHAIN_IDS.polygonMainnet))
      .to.emit(stakingManager, 'Unstaked')
      .withArgs(pntHolder1.address, amount)
  })

  it('should be able to increase the lend duration by 3 epochs and should not be able to unstake before the ending epoch', async () => {
    //   |----------|----------|----xxxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|
    //   0          1          2          3          4          5          6          7          8
    //
    //
    //   increaseDuration at epoch 4 of 3 epochs -> 6 + 3 -> [6,9]
    //
    //   |----------|----------|----------|oooooooooo|ooooIDoooo|oooooooooo|ooooovvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4          5          6          7          8          9          10
    //
    //
    //
    //   increaseLendDuration at epoch 4 of epochs -> reset of epoch 5 and adds new ones [6,9]
    //
    //   |----------|----------|----------|----------|----------|rrrrrrrrrr|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4          5          6          7          8          9          10

    const amount = ethers.utils.parseEther('1000')
    let duration = EPOCH_DURATION * 4

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    await pnt.connect(pntHolder1).approve(lendingManager.address, amount)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, amount, duration)

    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 3)).to.be.eq(1000 * 3)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 4)).to.be.eq(1000 * 2)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 5)).to.be.eq(1000 * 1)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 6)).to.be.eq(0)

    expect(await lendingManager.borrowableAmountByEpoch(2)).to.be.eq(0)
    expect(await lendingManager.borrowableAmountByEpoch(3)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.borrowableAmountByEpoch(4)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.borrowableAmountByEpoch(5)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.borrowableAmountByEpoch(6)).to.be.eq(0)

    expect(await lendingManager.totalLendedAmountByEpoch(2)).to.be.eq(0)
    expect(await lendingManager.totalLendedAmountByEpoch(3)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.totalLendedAmountByEpoch(4)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.totalLendedAmountByEpoch(5)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.totalLendedAmountByEpoch(6)).to.be.eq(0)

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(4)
    duration = EPOCH_DURATION * 4
    await expect(lendingManager.connect(pntHolder1)['increaseDuration(uint64)'](duration))
      .to.emit(lendingManager, 'DurationIncreased')
      .withArgs(pntHolder1.address, 9)

    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 3)).to.be.eq(1000 * 3)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 4)).to.be.eq(1000 * 2)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 5)).to.be.eq(1000 * 5)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 6)).to.be.eq(1000 * 4)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 7)).to.be.eq(1000 * 3)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 8)).to.be.eq(1000 * 2)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 9)).to.be.eq(1000 * 1)

    expect(await lendingManager.borrowableAmountByEpoch(2)).to.be.eq(0)
    expect(await lendingManager.borrowableAmountByEpoch(3)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.borrowableAmountByEpoch(4)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.borrowableAmountByEpoch(5)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.borrowableAmountByEpoch(6)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.borrowableAmountByEpoch(7)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.borrowableAmountByEpoch(8)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.borrowableAmountByEpoch(9)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.borrowableAmountByEpoch(10)).to.be.eq(0)

    expect(await lendingManager.totalLendedAmountByEpoch(2)).to.be.eq(0)
    expect(await lendingManager.totalLendedAmountByEpoch(3)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.totalLendedAmountByEpoch(4)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.totalLendedAmountByEpoch(5)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.totalLendedAmountByEpoch(6)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.totalLendedAmountByEpoch(7)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.totalLendedAmountByEpoch(8)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.totalLendedAmountByEpoch(9)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.totalLendedAmountByEpoch(10)).to.be.eq(0)

    await time.increase(EPOCH_DURATION * 4)
    expect(await epochsManager.currentEpoch()).to.be.equal(8)
    await expect(
      stakingManager.connect(pntHolder1)['unstake(uint256,bytes4)'](amount, PNETWORK_CHAIN_IDS.polygonMainnet)
    ).to.be.revertedWithCustomError(stakingManager, 'UnfinishedStakingPeriod')

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(9)
    await expect(
      stakingManager.connect(pntHolder1)['unstake(uint256,bytes4)'](amount, PNETWORK_CHAIN_IDS.polygonMainnet)
    ).to.be.revertedWithCustomError(stakingManager, 'UnfinishedStakingPeriod')

    await time.increase(EPOCH_DURATION - ONE_DAY)
    expect(await epochsManager.currentEpoch()).to.be.equal(9)
    await expect(
      stakingManager.connect(pntHolder1)['unstake(uint256,bytes4)'](amount, PNETWORK_CHAIN_IDS.polygonMainnet)
    ).to.be.revertedWithCustomError(stakingManager, 'UnfinishedStakingPeriod')

    const stake = await stakingManager.stakeOf(pntHolder1.address)
    await time.increaseTo(stake.endDate)
    expect(await epochsManager.currentEpoch()).to.be.equal(10)
    await expect(stakingManager.connect(pntHolder1)['unstake(uint256,bytes4)'](amount, PNETWORK_CHAIN_IDS.polygonMainnet))
      .to.emit(stakingManager, 'Unstaked')
      .withArgs(pntHolder1.address, amount)
  })

  it('should be able to increase the lend duration by 3 epochs even if the tokens are unstakable and the lending period is finished', async () => {
    //   |----------|----------|----xxxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|
    //   0          1          2          3          4          5          6          7          8
    //
    //
    //   increaseDuration at epoch 7 of 3 epochs -> 7 + 3 -> [8,10]
    //
    //   |----------|----------|----------|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|----IDxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|-----------|
    //   0          1          2          3          4          5          6          7          8          9          10         11         12          13
    //
    //
    //
    //   increaseLendDuration at epoch 4 of epochs -> [8,10]
    //
    //   |----------|----------|----------|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|----------|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|
    //   0          1          2          3          4          5          6          7          8          9          10         11         12

    const amount = ethers.utils.parseEther('1000')
    const duration = EPOCH_DURATION * 4

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    await pnt.connect(pntHolder1).approve(lendingManager.address, amount)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, amount, duration)

    await time.increase(EPOCH_DURATION * 5)
    expect(await epochsManager.currentEpoch()).to.be.equal(7)
    await expect(lendingManager.connect(pntHolder1)['increaseDuration(uint64)'](duration))
      .to.emit(lendingManager, 'DurationIncreased')
      .withArgs(pntHolder1.address, 10)

    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 8)).to.be.eq(1000 * 3)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 9)).to.be.eq(1000 * 2)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 10)).to.be.eq(1000 * 1)
    expect(await lendingManager.weightByEpochOf(pntHolder1.address, 11)).to.be.eq(0)

    expect(await lendingManager.borrowableAmountByEpoch(8)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.borrowableAmountByEpoch(9)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.borrowableAmountByEpoch(10)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.borrowableAmountByEpoch(11)).to.be.eq(0)

    expect(await lendingManager.totalLendedAmountByEpoch(8)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.totalLendedAmountByEpoch(9)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.totalLendedAmountByEpoch(10)).to.be.eq(truncateWithPrecision(amount))
    expect(await lendingManager.totalLendedAmountByEpoch(11)).to.be.eq(0)

    await time.increase(EPOCH_DURATION * 3)
    expect(await epochsManager.currentEpoch()).to.be.equal(10)
    await expect(
      stakingManager.connect(pntHolder1)['unstake(uint256,bytes4)'](amount, PNETWORK_CHAIN_IDS.polygonMainnet)
    ).to.be.revertedWithCustomError(stakingManager, 'UnfinishedStakingPeriod')

    await time.increase(EPOCH_DURATION - ONE_DAY)
    expect(await epochsManager.currentEpoch()).to.be.equal(10)
    await expect(
      stakingManager.connect(pntHolder1)['unstake(uint256,bytes4)'](amount, PNETWORK_CHAIN_IDS.polygonMainnet)
    ).to.be.revertedWithCustomError(stakingManager, 'UnfinishedStakingPeriod')

    const stake = await stakingManager.stakeOf(pntHolder1.address)
    await time.increaseTo(stake.endDate)
    expect(await epochsManager.currentEpoch()).to.be.equal(11)
    await expect(stakingManager.connect(pntHolder1)['unstake(uint256,bytes4)'](amount, PNETWORK_CHAIN_IDS.polygonMainnet))
      .to.emit(stakingManager, 'Unstaked')
      .withArgs(pntHolder1.address, amount)
  })

  it('should not be able to claim the earned reward if it did not partecipte to the governance', async () => {
    //
    //   pntHolder1 - 1 lend -> [1, 5]
    //                  w=200k    w=150k     w=100k      w=50k
    //   |-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|----------|
    //   0          1          2          3          4          5          6          7          8
    //
    //
    //   pntHolder2 - 2 lend -> [2, 6]
    //                            w=20k      w=15k      w=10k      w=5k
    //   |----------|-----xxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx------|----------|
    //   0          1         2          3          4          5          6           7          8
    //
    //
    //    result:
    //
    //    poolSize
    //                   50k        55k       55k        55k         5k
    //   |----------|vvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|----------|
    //   0          1         2          3          4          5          6          7          8
    //
    //    rewards
    //                   10k        10k         0        0         10k
    //   |----------|vvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|----------|
    //   0          1         2          3          4          5          6          7          8

    const depositRewardAmount = ethers.utils.parseEther('10000')
    const depositAmountPntHolder1 = ethers.utils.parseEther('50000')
    const depositAmountPntHolder2 = ethers.utils.parseEther('5000')
    const startFirstEpochTimestamp = await epochsManager.startFirstEpochTimestamp()
    let duration = EPOCH_DURATION * 5

    await pnt.connect(pntHolder1).approve(lendingManager.address, INFINITE)
    await pnt.connect(pntHolder2).approve(lendingManager.address, INFINITE)
    await pnt.approve(lendingManager.address, INFINITE)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, depositAmountPntHolder1, duration)
    await pnt.connect(pntHolder1).transfer(owner.address, depositRewardAmount.mul(5))

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(1)
    await lendingManager.connect(pntHolder2).lend(pntHolder2.address, depositAmountPntHolder2, duration)

    // making the vote available at epoch 1
    await dandelionVoting.setTestStartDate(startFirstEpochTimestamp.toNumber() + EPOCH_DURATION + ONE_DAY)
    await dandelionVoting.setTestVoteState(0)

    await lendingManager.depositReward(pnt.address, 1, depositRewardAmount)
    await time.increase(EPOCH_DURATION)
    await expect(lendingManager.connect(pntHolder1).claimRewardByEpoch(pnt.address, 1)).to.be.revertedWithCustomError(
      lendingManager,
      'NotPartecipatedInGovernanceAtEpoch'
    )

    await lendingManager.depositReward(pnt.address, 2, depositRewardAmount)
    await time.increase(EPOCH_DURATION)

    // making the vote available at epoch 2
    await dandelionVoting.setTestStartDate(startFirstEpochTimestamp.toNumber() + EPOCH_DURATION * 2 + ONE_DAY)
    await dandelionVoting.setTestVoteState(1)

    await expect(lendingManager.connect(pntHolder1).claimRewardByEpoch(pnt.address, 2))
      .to.emit(lendingManager, 'RewardClaimed')
      .withArgs(pntHolder1.address, pnt.address, 2, ethers.utils.parseEther('8823.529411764705882352'))
    await expect(lendingManager.connect(pntHolder2).claimRewardByEpoch(pnt.address, 2))
      .to.emit(lendingManager, 'RewardClaimed')
      .withArgs(pntHolder2.address, pnt.address, 2, ethers.utils.parseEther('1176.470588235294117647'))

    await lendingManager.depositReward(pnt.address, 5, depositRewardAmount)
    await time.increase(EPOCH_DURATION * 3)
    // ((5k / 5k) + (1/1)) / 2 = 1   --->   10000 * 1 = 10000
    await expect(lendingManager.connect(pntHolder2).claimRewardByEpoch(pnt.address, 5))
      .to.emit(lendingManager, 'RewardClaimed')
      .withArgs(pntHolder2.address, pnt.address, 5, ethers.utils.parseEther('10000'))

    await expect(lendingManager.connect(pntHolder2).claimRewardByEpoch(pnt.address, 5)).to.be.revertedWithCustomError(
      lendingManager,
      'NothingToClaim'
    )
  })
})
