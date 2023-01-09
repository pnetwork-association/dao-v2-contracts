/*const { expect } = require('chai')
const { ethers, upgrades, config } = require('hardhat')
const { time } = require('@nomicfoundation/hardhat-network-helpers')
const { getRole, getSentinelIdentity } = require('./utils')

let stakingManager,
  epochsManager,
  registrationManager,
  pnt,
  owner,
  pntHolder1,
  pntHolder2,
  sentinel1,
  RegistrationManager
let BORROW_ROLE,
  INCREASE_BORROWABLE_AMOUNT_FOR_EPOCH_ROLE,
  INCREASE_BORROWABLE_AMOUNT_BY_DURATION_ROLE,
  RELEASE_SENTINEL

const STAKING_MANAGER_ADDRESS = '0xeb10e80D99655B51E3a981E888a73D0B21e21A6C'
const PNT_ADDRESS = '0x89Ab32156e46F46D02ade3FEcbe5Fc4243B9AAeD'
const PNT_HOLDER_1_ADDRESS = '0xaeaa8c6ebb17db8056fa30a08fd3097de555f571'
const PNT_HOLDER_2_ADDRESS = '0x98C3d3183C4b8A650614ad179A1a98be0a8d6B8E'
const EPOCH_DURATION = 1314001 // 2 weeks
const ONE_DAY = 86400
const REGISTRATION_STAKING = 1
const REGISTRATION_BORROWING = 2
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

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

    RegistrationManager = await ethers.getContractFactory('RegistrationManager')
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

  it('should be able to updateSentinelRegistrationByStaking for 4 epochs starting from epoch 1', async () => {
    //   pntHolder1 - updateSentinelRegistrationByStaking
    //                   200k       200k        200k      200k
    //   |-----xxxxx|vvvvvvvvvv-|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|
    //   0          1          2          3          4          5           6          7
    //

    const stakeAmount = ethers.utils.parseEther('200000')
    const lockTime = EPOCH_DURATION * 5

    const signature = await getSentinelIdentity(pntHolder1.address, { sentinel: sentinel1 })
    await pnt.connect(pntHolder1).approve(registrationManager.address, stakeAmount)
    await expect(
      registrationManager.connect(pntHolder1).updateSentinelRegistrationByStaking(stakeAmount, lockTime, signature)
    )
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(pntHolder1.address, 1, 4, sentinel1.address, REGISTRATION_STAKING)

    const { owner, startEpoch, endEpoch, kind } = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(owner).to.be.eq(pntHolder1.address)
    expect(startEpoch).to.be.eq(1)
    expect(endEpoch).to.be.eq(4)
    expect(kind).to.be.eq(REGISTRATION_STAKING)
  })

  it('should pntHolder1 not be able to updateSentinelRegistrationByStaking and then updateSentinelRegistrationByBorrowing', async () => {
    //   pntHolder1 - stake
    //                   200k       200k        200k      200k       200k       200k        200k      200k
    //   |-----xxxxx|vvvvvvvvvv-|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4           5          6          7          8          9          10
    //
    //
    //
    //   pntHolder1 -  updateSentinelRegistrationByBorrowing
    //                                         200k       200k
    //   |----------|----------|----xxxxxx|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|----------|----------|
    //   0          1          2          3          4          5          6          7          8          9
    //

    const stakeAmount = ethers.utils.parseEther('200000')
    const lockTime = EPOCH_DURATION * 9

    const signature = await getSentinelIdentity(pntHolder1.address, { sentinel: sentinel1 })
    await pnt.connect(pntHolder1).approve(registrationManager.address, stakeAmount)
    await expect(
      registrationManager.connect(pntHolder1).updateSentinelRegistrationByStaking(stakeAmount, lockTime, signature)
    )
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(pntHolder1.address, 1, 8, sentinel1.address, REGISTRATION_STAKING)

    const { owner, startEpoch, endEpoch, kind } = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(owner).to.be.eq(pntHolder1.address)
    expect(startEpoch).to.be.eq(1)
    expect(endEpoch).to.be.eq(8)
    expect(kind).to.be.eq(REGISTRATION_STAKING)
    expect(await registrationManager.sentinelOf(pntHolder1.address)).to.be.eq(sentinel1.address)

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    await expect(
      registrationManager.connect(pntHolder1).updateSentinelRegistrationByBorrowing(stakeAmount, 2, signature)
    ).to.be.revertedWithCustomError(registrationManager, 'InvalidRegistration')
  })

  it('should be able to updateSentinelRegistrationByStaking 2 times in order to renew his registration (1)', async () => {
    //   pntHolder1 - updateSentinelRegistrationByStaking
    //                   200k       200k        200k      200k        200k
    //   |-----xxxxx|vvvvvvvvvv-|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4           5          6          7
    //
    //
    //
    //   pntHolder1 - updateSentinelRegistrationByStaking
    //                             200k       200k       200k
    //   |----------|-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4          5
    //
    //
    //   pntHolder1 - result
    //                   200k       400k        400k      200k        200k
    //   |-----xxxxx|vvvvvvvvvv-|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4           5          6          7

    const stakeAmount = ethers.utils.parseEther('200000')
    let lockTime = EPOCH_DURATION * 6

    const signature = await getSentinelIdentity(pntHolder1.address, { sentinel: sentinel1 })
    await pnt.connect(pntHolder1).approve(registrationManager.address, stakeAmount)
    await expect(
      registrationManager.connect(pntHolder1).updateSentinelRegistrationByStaking(stakeAmount, lockTime, signature)
    )
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(pntHolder1.address, 1, 5, sentinel1.address, REGISTRATION_STAKING)

    let registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(pntHolder1.address)
    expect(registration.startEpoch).to.be.eq(1)
    expect(registration.endEpoch).to.be.eq(5)
    expect(registration.kind).to.be.eq(REGISTRATION_STAKING)
    expect(await registrationManager.sentinelOf(pntHolder1.address)).to.be.eq(sentinel1.address)

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(1)

    lockTime = EPOCH_DURATION * 3
    await pnt.connect(pntHolder1).approve(registrationManager.address, stakeAmount)
    await expect(
      registrationManager.connect(pntHolder1).updateSentinelRegistrationByStaking(stakeAmount, lockTime, signature)
    )
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(pntHolder1.address, 1, 5, sentinel1.address, REGISTRATION_STAKING)

    registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(pntHolder1.address)
    expect(registration.startEpoch).to.be.eq(1)
    expect(registration.endEpoch).to.be.eq(5)
    expect(registration.kind).to.be.eq(REGISTRATION_STAKING)
    expect(await registrationManager.sentinelOf(pntHolder1.address)).to.be.eq(sentinel1.address)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(1, sentinel1.address)).to.be.eq(stakeAmount)
    // prettier-ignore
    expect(await registrationManager.sentinelReservedAmountByEpochOf(2, sentinel1.address)).to.be.eq(stakeAmount.mul(2))
    // prettier-ignore
    expect(await registrationManager.sentinelReservedAmountByEpochOf(3, sentinel1.address)).to.be.eq(stakeAmount.mul(2))
    expect(await registrationManager.sentinelReservedAmountByEpochOf(4, sentinel1.address)).to.be.eq(stakeAmount)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(5, sentinel1.address)).to.be.eq(stakeAmount)
  })

  it('should be able to updateSentinelRegistrationByStaking 2 times in order to renew his registration (2)', async () => {
    //   pntHolder1 - updateSentinelRegistrationByStaking
    //                   200k       200k        200k      200k        200k
    //   |-----xxxxx|vvvvvvvvvv-|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1           2          3          4          5          6          7
    //
    //
    //
    //   pntHolder1 - updateSentinelRegistrationByStaking
    //                             200k       200k       200k         200k      200k
    //   |----------|-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4           5          6          7
    //
    //
    //   pntHolder1 - result
    //                   200k       400k        400k      400k        400k     200k
    //   |----------|vvvvvvvvvv-|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|
    //   0          1          2          3          4           5          6          7

    const stakeAmount = ethers.utils.parseEther('200000')
    let lockTime = EPOCH_DURATION * 6

    const signature = await getSentinelIdentity(pntHolder1.address, { sentinel: sentinel1 })
    await pnt.connect(pntHolder1).approve(registrationManager.address, stakeAmount)
    await expect(
      registrationManager.connect(pntHolder1).updateSentinelRegistrationByStaking(stakeAmount, lockTime, signature)
    )
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(pntHolder1.address, 1, 5, sentinel1.address, REGISTRATION_STAKING)

    let registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(pntHolder1.address)
    expect(registration.startEpoch).to.be.eq(1)
    expect(registration.endEpoch).to.be.eq(5)
    expect(registration.kind).to.be.eq(REGISTRATION_STAKING)
    expect(await registrationManager.sentinelOf(pntHolder1.address)).to.be.eq(sentinel1.address)

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(1)

    await pnt.connect(pntHolder1).approve(registrationManager.address, stakeAmount)
    await expect(
      registrationManager.connect(pntHolder1).updateSentinelRegistrationByStaking(stakeAmount, lockTime, signature)
    )
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(pntHolder1.address, 1, 6, sentinel1.address, REGISTRATION_STAKING)

    registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(pntHolder1.address)
    expect(registration.startEpoch).to.be.eq(1)
    expect(registration.endEpoch).to.be.eq(6)
    expect(registration.kind).to.be.eq(REGISTRATION_STAKING)
    expect(await registrationManager.sentinelOf(pntHolder1.address)).to.be.eq(sentinel1.address)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(1, sentinel1.address)).to.be.eq(stakeAmount)
    // prettier-ignore
    expect(await registrationManager.sentinelReservedAmountByEpochOf(2, sentinel1.address)).to.be.eq(stakeAmount.mul(2))
    // prettier-ignore
    expect(await registrationManager.sentinelReservedAmountByEpochOf(3, sentinel1.address)).to.be.eq(stakeAmount.mul(2))
    // prettier-ignore
    expect(await registrationManager.sentinelReservedAmountByEpochOf(4, sentinel1.address)).to.be.eq(stakeAmount.mul(2))
    // prettier-ignore
    expect(await registrationManager.sentinelReservedAmountByEpochOf(5, sentinel1.address)).to.be.eq(stakeAmount.mul(2))
    expect(await registrationManager.sentinelReservedAmountByEpochOf(6, sentinel1.address)).to.be.eq(stakeAmount)
  })

  it('should be able to updateSentinelRegistrationByStaking 2 times in order to create a new registration since the old one was expired', async () => {
    //   pntHolder1 - updateSentinelRegistrationByStaking
    //                   200k       200k       200k
    //   |-----xxxxx|vvvvvvvvvv-|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|----------|----------|----------|
    //   0          1          2          3          4           5          6          7          8          9
    //
    //
    //
    //   pntHolder1 - updateSentinelRegistrationByStaking
    //                                                                200k       200k        200k
    //   |----------|----------|----------|----------|-----xxxxx|vvvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4           5          6          7          8          9
    //

    const stakeAmount = ethers.utils.parseEther('200000')
    let lockTime = EPOCH_DURATION * 4

    const signature = await getSentinelIdentity(pntHolder1.address, { sentinel: sentinel1 })
    await pnt.connect(pntHolder1).approve(registrationManager.address, stakeAmount)
    await expect(
      registrationManager.connect(pntHolder1).updateSentinelRegistrationByStaking(stakeAmount, lockTime, signature)
    )
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(pntHolder1.address, 1, 3, sentinel1.address, REGISTRATION_STAKING)

    let registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(pntHolder1.address)
    expect(registration.startEpoch).to.be.eq(1)
    expect(registration.endEpoch).to.be.eq(3)
    expect(registration.kind).to.be.eq(REGISTRATION_STAKING)
    expect(await registrationManager.sentinelOf(pntHolder1.address)).to.be.eq(sentinel1.address)

    await time.increase(EPOCH_DURATION * 4)
    expect(await epochsManager.currentEpoch()).to.be.equal(4)

    await pnt.connect(pntHolder1).approve(registrationManager.address, stakeAmount)
    await expect(
      registrationManager.connect(pntHolder1).updateSentinelRegistrationByStaking(stakeAmount, lockTime, signature)
    )
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(pntHolder1.address, 5, 7, sentinel1.address, REGISTRATION_STAKING)

    registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(pntHolder1.address)
    expect(registration.startEpoch).to.be.eq(5)
    expect(registration.endEpoch).to.be.eq(7)
    expect(registration.kind).to.be.eq(REGISTRATION_STAKING)
    expect(await registrationManager.sentinelOf(pntHolder1.address)).to.be.eq(sentinel1.address)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(0, sentinel1.address)).to.be.eq(0)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(1, sentinel1.address)).to.be.eq(stakeAmount)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(2, sentinel1.address)).to.be.eq(stakeAmount)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(3, sentinel1.address)).to.be.eq(stakeAmount)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(4, sentinel1.address)).to.be.eq(0)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(5, sentinel1.address)).to.be.eq(stakeAmount)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(6, sentinel1.address)).to.be.eq(stakeAmount)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(7, sentinel1.address)).to.be.eq(stakeAmount)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(8, sentinel1.address)).to.be.eq(0)
  })

  it('should be able to updateSentinelRegistrationByBorrowing for 2 epochs starting from epoch 3', async () => {
    //   pntHolder1 - lend
    //
    //                   200k       200k        200k      200k
    //   |-----xxxxx|vvvvvvvvvv-|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|
    //   0          1          2          3          4          5           6          7
    //
    //
    //   user1 - updateSentinelRegistrationByBorrowing
    //
    //                                         200k       200k
    //   |----------|----------|----xxxxxx|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|
    //   0          1          2          3          4          5          6          7
    //

    const lendAmount = ethers.utils.parseEther('200000')
    const borrowAmount = ethers.utils.parseEther('200000')
    const lockTime = EPOCH_DURATION * 5
    await pnt.connect(pntHolder1).approve(borrowingManager.address, lendAmount)
    await borrowingManager.connect(pntHolder1)lend(lendAmount, lockTime, pntHolder1.address)

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    const signature = await getSentinelIdentity(user1.address, { sentinel: sentinel1 })
    await expect(registrationManager.connect(user1).updateSentinelRegistrationByBorrowing(borrowAmount, 2, signature))
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(user1.address, 3, 4, sentinel1.address, REGISTRATION_BORROWING)

    const { owner, startEpoch, endEpoch, kind } = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(owner).to.be.eq(user1.address)
    expect(startEpoch).to.be.eq(3)
    expect(endEpoch).to.be.eq(4)
    expect(kind).to.be.eq(REGISTRATION_BORROWING)
    expect(await registrationManager.sentinelOf(user1.address)).to.be.eq(sentinel1.address)
  })

  it('should be able to updateSentinelRegistrationByBorrowing for 1 epoch at epoch 2 and then not being able to updateSentinelRegistrationByBorrowing for 2 epoch at epoch 3', async () => {
    //   pntHolder1 - lend
    //
    //                   200k       200k        200k      200k       200k
    //   |-----xxxxx|vvvvvvvvvv-|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4          5           6          7
    //
    //
    //   user1 - updateSentinelRegistrationByBorrowing
    //
    //                                         200k       200k
    //   |----------|----------|----xxxxxx|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|
    //   0          1          2          3          4          5          6          7
    //
    //   user1 - updateSentinelRegistrationByBorrowing
    //
    //                                         200k       200k      200k
    //   |----------|----------|----------|-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4          5          6          7
    //
    //   user1 - result
    //
    //                                         200k       400k      200k
    //   |----------|----------|----------|----------|xxxxxxxxxx|----------|----------|
    //   0          1          2          3          4          5          6          7

    const lendAmount = ethers.utils.parseEther('200000')
    const borrowAmount = ethers.utils.parseEther('200000')
    const lockTime = EPOCH_DURATION * 6
    await pnt.connect(pntHolder1).approve(borrowingManager.address, lendAmount)
    await borrowingManager.connect(pntHolder1)lend(lendAmount, lockTime, pntHolder1.address)

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    const signature = await getSentinelIdentity(user1.address, { sentinel: sentinel1 })
    await expect(registrationManager.connect(user1).updateSentinelRegistrationByBorrowing(borrowAmount, 2, signature))
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(user1.address, 3, 4, sentinel1.address, REGISTRATION_BORROWING)

    const { owner, startEpoch, endEpoch, kind } = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(owner).to.be.eq(user1.address)
    expect(startEpoch).to.be.eq(3)
    expect(endEpoch).to.be.eq(4)
    expect(kind).to.be.eq(REGISTRATION_BORROWING)
    expect(await registrationManager.sentinelOf(user1.address)).to.be.eq(sentinel1.address)

    await expect(
      registrationManager.connect(user1).updateSentinelRegistrationByBorrowing(borrowAmount, 2, signature)
    ).to.be.revertedWithCustomError(borrowingManager, 'AmountNotAvailableInEpoch')
  })

  it('should be able tp updateSentinelRegistrationByBorrowing for 1 epoch at epoch 2 and then being able to updateSentinelRegistrationByBorrowing for 2 epoch at epoch 3', async () => {
    //   pntHolder1 - lend
    //
    //                   400k       400k        400k      400k       400k
    //   |-----xxxxx|vvvvvvvvvv-|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4          5           6          7
    //
    //
    //   user1 - updateSentinelRegistrationByBorrowing
    //
    //                                         200k       200k
    //   |----------|----------|----xxxxxx|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|
    //   0          1          2          3          4          5          6          7
    //
    //   user1 - updateSentinelRegistrationByBorrowing
    //
    //                                         200k       200k      200k
    //   |----------|----------|----------|-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4          5          6          7
    //
    //   user1 - result
    //
    //                                         200k       400k      200k
    //   |----------|----------|----------|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|
    //   0          1          2          3          4          5          6          7

    const lendAmount = ethers.utils.parseEther('400000')
    const borrowAmount = ethers.utils.parseEther('200000')
    const lockTime = EPOCH_DURATION * 6
    await pnt.connect(pntHolder1).approve(borrowingManager.address, lendAmount)
    await borrowingManager.connect(pntHolder1)lend(lendAmount, lockTime, pntHolder1.address)

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    const signature = await getSentinelIdentity(user1.address, { sentinel: sentinel1 })
    await expect(registrationManager.connect(user1).updateSentinelRegistrationByBorrowing(borrowAmount, 2, signature))
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(user1.address, 3, 4, sentinel1.address, REGISTRATION_BORROWING)

    let registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(user1.address)
    expect(registration.startEpoch).to.be.eq(3)
    expect(registration.endEpoch).to.be.eq(4)
    expect(registration.kind).to.be.eq(REGISTRATION_BORROWING)
    expect(await registrationManager.sentinelOf(user1.address)).to.be.eq(sentinel1.address)

    expect(await registrationManager.sentinelReservedAmountByEpochOf(2, sentinel1.address)).to.be.eq(0)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(3, sentinel1.address)).to.be.eq(borrowAmount)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(4, sentinel1.address)).to.be.eq(borrowAmount)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(5, sentinel1.address)).to.be.eq(0)

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(3)

    await expect(registrationManager.connect(user1).updateSentinelRegistrationByBorrowing(borrowAmount, 2, signature))
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(user1.address, 3, 5, sentinel1.address, REGISTRATION_BORROWING)

    registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(user1.address)
    expect(registration.startEpoch).to.be.eq(3)
    expect(registration.endEpoch).to.be.eq(5)
    expect(registration.kind).to.be.eq(REGISTRATION_BORROWING)
    expect(await registrationManager.sentinelOf(user1.address)).to.be.eq(sentinel1.address)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(2, sentinel1.address)).to.be.eq(0)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(3, sentinel1.address)).to.be.eq(borrowAmount)
    // prettier-ignore
    expect(await registrationManager.sentinelReservedAmountByEpochOf(4, sentinel1.address)).to.be.eq(borrowAmount.mul(2))
    expect(await registrationManager.sentinelReservedAmountByEpochOf(5, sentinel1.address)).to.be.eq(borrowAmount)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(6, sentinel1.address)).to.be.eq(0)
  })

  it('should not be able to updateSentinelRegistrationByBorrowing 2 times in which the second time the number of epochs is less than the first one and the previous borrowing is not terminated yet', async () => {
    //   pntHolder1 - lend
    //
    //                   400k       400k        400k      400k       400k
    //   |-----xxxxx|vvvvvvvvvv-|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4          5           6          7
    //
    //
    //   user1 - updateSentinelRegistrationByBorrowing
    //
    //                                         200k       200k
    //   |----------|----------|----xxxxxx|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|
    //   0          1          2          3          4          5          6          7
    //
    //   user1 - updateSentinelRegistrationByBorrowing
    //
    //                                         200k       200k      200k
    //   |----------|----------|-----xxxxx|vvvvvvvvvv|xxxxx-----|----------|----------|
    //   0          1          2          3          4          5          6          7
    //
    //   user1 - result ERROR

    const lendAmount = ethers.utils.parseEther('400000')
    const borrowAmount = ethers.utils.parseEther('200000')
    const lockTime = EPOCH_DURATION * 6
    await pnt.connect(pntHolder1).approve(borrowingManager.address, lendAmount)
    await borrowingManager.connect(pntHolder1)lend(lendAmount, lockTime, pntHolder1.address)

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    const signature = await getSentinelIdentity(user1.address, { sentinel: sentinel1 })
    await expect(registrationManager.connect(user1).updateSentinelRegistrationByBorrowing(borrowAmount, 2, signature))
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(user1.address, 3, 4, sentinel1.address, REGISTRATION_BORROWING)

    let registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(user1.address)
    expect(registration.startEpoch).to.be.eq(3)
    expect(registration.endEpoch).to.be.eq(4)
    expect(registration.kind).to.be.eq(REGISTRATION_BORROWING)
    expect(await registrationManager.sentinelOf(user1.address)).to.be.eq(sentinel1.address)

    await expect(
      registrationManager.connect(user1).updateSentinelRegistrationByBorrowing(borrowAmount, 1, signature)
    ).to.be.revertedWithCustomError(registrationManager, 'InvalidNumberOfEpochs')
  })

  it('should be able to renew a sentinel registration with updateSentinelRegistrationByBorrowing', async () => {
    //   pntHolder1 - lend
    //
    //                   600k       600k        600k      600k       600k
    //   |-----xxxxx|vvvvvvvvvv-|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4          5           6          7
    //
    //
    //   user1 - updateSentinelRegistrationByBorrowing
    //
    //                                         200k       200k
    //   |----------|----xxxxxx|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|----------|
    //   0          1          2          3          4          5          6          7
    //
    //   user1 - updateSentinelRegistrationByBorrowing
    //
    //                                         300k       300k      300k
    //   |----------|----------|-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4          5          6          7
    //
    //   user1 - result
    //                              200k      500k       300k      300k
    //   |----------|----------|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|
    //   0          1          2          3          4          5          6          7

    const lendAmount = ethers.utils.parseEther('600000')
    const borrowAmount1 = ethers.utils.parseEther('200000')
    const borrowAmount2 = ethers.utils.parseEther('200000')
    const lockTime = EPOCH_DURATION * 6
    await pnt.connect(pntHolder1).approve(borrowingManager.address, lendAmount)
    await borrowingManager.connect(pntHolder1)lend(lendAmount, lockTime, pntHolder1.address)

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(1)

    const signature = await getSentinelIdentity(user1.address, { sentinel: sentinel1 })
    await expect(registrationManager.connect(user1).updateSentinelRegistrationByBorrowing(borrowAmount1, 2, signature))
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(user1.address, 2, 3, sentinel1.address, REGISTRATION_BORROWING)

    let registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(user1.address)
    expect(registration.startEpoch).to.be.eq(2)
    expect(registration.endEpoch).to.be.eq(3)
    expect(registration.kind).to.be.eq(REGISTRATION_BORROWING)
    expect(await registrationManager.sentinelOf(user1.address)).to.be.eq(sentinel1.address)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(2, sentinel1.address)).to.be.eq(borrowAmount1)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(3, sentinel1.address)).to.be.eq(borrowAmount1)

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    await expect(registrationManager.connect(user1).updateSentinelRegistrationByBorrowing(borrowAmount1, 3, signature))
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(user1.address, 2, 5, sentinel1.address, REGISTRATION_BORROWING)

    registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(user1.address)
    expect(registration.startEpoch).to.be.eq(2)
    expect(registration.endEpoch).to.be.eq(5)
    expect(registration.kind).to.be.eq(REGISTRATION_BORROWING)
    expect(await registrationManager.sentinelOf(user1.address)).to.be.eq(sentinel1.address)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(2, sentinel1.address)).to.be.eq(borrowAmount1)
    // prettier-ignore
    expect(await registrationManager.sentinelReservedAmountByEpochOf(3, sentinel1.address)).to.be.eq(borrowAmount1.add(borrowAmount2))
    expect(await registrationManager.sentinelReservedAmountByEpochOf(4, sentinel1.address)).to.be.eq(borrowAmount2)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(5, sentinel1.address)).to.be.eq(borrowAmount2)
  })

  it('should not be able to updateSentinelRegistrationByBorrowing with an amount < 200k pnt', async () => {
    const lendAmount = ethers.utils.parseEther('200000')
    const borrowAmount = ethers.utils.parseEther('199999')
    const lockTime = EPOCH_DURATION * 6
    await pnt.connect(pntHolder1).approve(borrowingManager.address, lendAmount)
    await borrowingManager.connect(pntHolder1)lend(lendAmount, lockTime, pntHolder1.address)

    const signature = await getSentinelIdentity(user1.address, { sentinel: sentinel1 })
    await expect(
      registrationManager.connect(user1).updateSentinelRegistrationByBorrowing(borrowAmount, 2, signature)
    ).to.be.revertedWithCustomError(borrowingManager, 'InvalidAmount')
  })

  it('should not be able to updateSentinelRegistrationByBorrowing with an amount > 400k pnt', async () => {
    const lendAmount = ethers.utils.parseEther('800000')
    const borrowAmount = ethers.utils.parseEther('400001')
    const lockTime = EPOCH_DURATION * 6
    await pnt.connect(pntHolder1).approve(borrowingManager.address, lendAmount)
    await borrowingManager.connect(pntHolder1)lend(lendAmount, lockTime, pntHolder1.address)

    const signature = await getSentinelIdentity(user1.address, { sentinel: sentinel1 })
    await expect(
      registrationManager.connect(user1).updateSentinelRegistrationByBorrowing(borrowAmount, 2, signature)
    ).to.be.revertedWithCustomError(borrowingManager, 'InvalidAmount')
  })

  it('should be able to release after a updateSentinelRegistrationByStaking in the same epoch where the borrow starts', async () => {
    //   pntHolder1 - updateSentinelRegistrationByStaking
    //                   200k       200k        200k      200k
    //   |-----xxxxx|vvvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4           5          6
    //
    //
    //
    //   pntHolder1 - result after releaseSentinel at epoch 2
    //
    //                   200k      200k
    //   |----------|vvvvvvvvvv|rrrrrrrrrrr|rrrrrrrrrrr|rrrrrrrrrr|----------|
    //   0          1          2          3           4          5
    //

    const stakeAmount = ethers.utils.parseEther('200000')
    const lockTime = EPOCH_DURATION * 5

    const signature = await getSentinelIdentity(pntHolder1.address, { sentinel: sentinel1 })
    await pnt.connect(pntHolder1).approve(registrationManager.address, stakeAmount)
    await expect(
      registrationManager.connect(pntHolder1).updateSentinelRegistrationByStaking(stakeAmount, lockTime, signature)
    )
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(pntHolder1.address, 1, 4, sentinel1.address, REGISTRATION_STAKING)

    let registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(pntHolder1.address)
    expect(registration.startEpoch).to.be.eq(1)
    expect(registration.endEpoch).to.be.eq(4)
    expect(registration.kind).to.be.eq(REGISTRATION_STAKING)
    expect(await registrationManager.sentinelOf(pntHolder1.address)).to.be.eq(sentinel1.address)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(1, sentinel1.address)).to.be.eq(stakeAmount)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(2, sentinel1.address)).to.be.eq(stakeAmount)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(3, sentinel1.address)).to.be.eq(stakeAmount)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(4, sentinel1.address)).to.be.eq(stakeAmount)

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    await expect(registrationManager.releaseSentinel(sentinel1.address))
      .to.emit(registrationManager, 'SentinelReleased')
      .withArgs(sentinel1.address, 2)

    registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(pntHolder1.address)
    expect(registration.startEpoch).to.be.eq(1)
    expect(registration.endEpoch).to.be.eq(1)
    expect(registration.kind).to.be.eq(REGISTRATION_STAKING)
    expect(await registrationManager.sentinelOf(pntHolder1.address)).to.be.eq(sentinel1.address)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(1, sentinel1.address)).to.be.eq(stakeAmount)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(2, sentinel1.address)).to.be.eq(0)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(3, sentinel1.address)).to.be.eq(0)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(4, sentinel1.address)).to.be.eq(0)
  })

  it('should be able to release after a updateSentinelRegistrationByStaking in the same epoch where the borrow starts after a contract upgrade', async () => {
    //   pntHolder1 - updateSentinelRegistrationByStaking
    //                   200k       200k        200k      200k
    //   |-----xxxxx|vvvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4           5          6
    //
    //
    //
    //   pntHolder1 - result after releaseSentinel at epoch 2
    //
    //                   200k      200k
    //   |----------|vvvvvvvvvv|rrrrrrrrrrr|rrrrrrrrrrr|rrrrrrrrrr|----------|
    //   0          1          2          3           4          5
    //

    const stakeAmount = ethers.utils.parseEther('200000')
    const lockTime = EPOCH_DURATION * 5

    const signature = await getSentinelIdentity(pntHolder1.address, { sentinel: sentinel1 })
    await pnt.connect(pntHolder1).approve(registrationManager.address, stakeAmount)
    await expect(
      registrationManager.connect(pntHolder1).updateSentinelRegistrationByStaking(stakeAmount, lockTime, signature)
    )
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(pntHolder1.address, 1, 4, sentinel1.address, REGISTRATION_STAKING)

    let registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(pntHolder1.address)
    expect(registration.startEpoch).to.be.eq(1)
    expect(registration.endEpoch).to.be.eq(4)
    expect(registration.kind).to.be.eq(REGISTRATION_STAKING)
    expect(await registrationManager.sentinelOf(pntHolder1.address)).to.be.eq(sentinel1.address)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(1, sentinel1.address)).to.be.eq(stakeAmount)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(2, sentinel1.address)).to.be.eq(stakeAmount)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(3, sentinel1.address)).to.be.eq(stakeAmount)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(4, sentinel1.address)).to.be.eq(stakeAmount)

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    await upgrades.upgradeProxy(registrationManager.address, RegistrationManager, {
      kind: 'uups'
    })

    await expect(registrationManager.releaseSentinel(sentinel1.address))
      .to.emit(registrationManager, 'SentinelReleased')
      .withArgs(sentinel1.address, 2)

    registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(pntHolder1.address)
    expect(registration.startEpoch).to.be.eq(1)
    expect(registration.endEpoch).to.be.eq(1)
    expect(registration.kind).to.be.eq(REGISTRATION_STAKING)
    expect(await registrationManager.sentinelOf(pntHolder1.address)).to.be.eq(sentinel1.address)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(1, sentinel1.address)).to.be.eq(stakeAmount)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(2, sentinel1.address)).to.be.eq(0)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(3, sentinel1.address)).to.be.eq(0)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(4, sentinel1.address)).to.be.eq(0)
  })

  it('should not be able to release after a updateSentinelRegistrationByStaking', async () => {
    //   pntHolder1 - updateSentinelRegistrationByStaking
    //                   200k       200k        200k      200k
    //   |-----xxxxx|vvvvvvvvvv-|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4           5
    //
    //
    //
    //   pntHolder1 - result after releaseSentinel at epoch 4
    //
    //
    //   |----------|----------|----------|----------|-----rrrrr|
    //   0          1          2          3          4          5
    //

    const stakeAmount = ethers.utils.parseEther('200000')
    const lockTime = EPOCH_DURATION * 4

    const signature = await getSentinelIdentity(pntHolder1.address, { sentinel: sentinel1 })
    await pnt.connect(pntHolder1).approve(registrationManager.address, stakeAmount)
    await expect(
      registrationManager.connect(pntHolder1).updateSentinelRegistrationByStaking(stakeAmount, lockTime, signature)
    )
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(pntHolder1.address, 1, 3, sentinel1.address, REGISTRATION_STAKING)

    await time.increase(EPOCH_DURATION * 4)
    expect(await epochsManager.currentEpoch()).to.be.equal(4)

    await expect(registrationManager.releaseSentinel(sentinel1.address)).to.be.revertedWithCustomError(
      registrationManager,
      'SentinelNotReleasable'
    )
  })

  it('should be able to release after a updateSentinelRegistrationByBorrowing in the same epoch where the borrow starts', async () => {
    //   pntHolder1 - updateSentinelRegistrationByBorrowing 1
    //                               200k     200k       200k       200k
    //   |----------|-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4          5          6
    //
    //   pntHolder1 - result after releaseSentinel at epoch 2
    //
    //
    //   |----------|----------|rrrrrrrrrr|rrrrrrrrrrr|rrrrrrrrrr|----------|
    //   0          1          2          3          4          5          6
    //

    const lendAmount = ethers.utils.parseEther('200000')
    const borrowAmount = ethers.utils.parseEther('200000')
    const lockTime = EPOCH_DURATION * 5
    await pnt.connect(pntHolder1).approve(borrowingManager.address, lendAmount)
    await borrowingManager.connect(pntHolder1)lend(lendAmount, lockTime, pntHolder1.address)

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(1)

    const signature = await getSentinelIdentity(user1.address, { sentinel: sentinel1 })
    await expect(registrationManager.connect(user1).updateSentinelRegistrationByBorrowing(borrowAmount, 3, signature))
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(user1.address, 2, 4, sentinel1.address, REGISTRATION_BORROWING)

    let registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(user1.address)
    expect(registration.startEpoch).to.be.eq(2)
    expect(registration.endEpoch).to.be.eq(4)
    expect(registration.kind).to.be.eq(REGISTRATION_BORROWING)
    expect(await registrationManager.sentinelOf(user1.address)).to.be.eq(sentinel1.address)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(2, sentinel1.address)).to.be.eq(borrowAmount)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(3, sentinel1.address)).to.be.eq(borrowAmount)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(4, sentinel1.address)).to.be.eq(borrowAmount)

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    await expect(registrationManager.releaseSentinel(sentinel1.address))
      .to.emit(registrationManager, 'SentinelReleased')
      .withArgs(sentinel1.address, 2)

    registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(ZERO_ADDRESS)
    expect(registration.startEpoch).to.be.eq(0)
    expect(registration.endEpoch).to.be.eq(0)
    expect(registration.kind).to.be.eq(0)
    expect(await registrationManager.sentinelOf(user1.address)).to.be.eq(ZERO_ADDRESS)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(2, sentinel1.address)).to.be.eq(0)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(3, sentinel1.address)).to.be.eq(0)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(4, sentinel1.address)).to.be.eq(0)
  })

  it('should be able to release after a updateSentinelRegistrationByStaking in the same epoch where the borrow starts', async () => {
    //   pntHolder1 - updateSentinelRegistrationByStaking 1
    //                 200k     200k       200k       200k
    //   |-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4          5
    //
    //   pntHolder1 - result after releaseSentinel at epoch 1
    //
    //
    //   |----------|rrrrrrrrrr|rrrrrrrrrrr|rrrrrrrrrr|----------|
    //   0          1          2           3          4          5
    //

    const stakeAmount = ethers.utils.parseEther('200000')
    const lockTime = EPOCH_DURATION * 4

    const signature = await getSentinelIdentity(pntHolder1.address, { sentinel: sentinel1 })
    await pnt.connect(pntHolder1).approve(registrationManager.address, stakeAmount)
    await expect(
      registrationManager.connect(pntHolder1).updateSentinelRegistrationByStaking(stakeAmount, lockTime, signature)
    )
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(pntHolder1.address, 1, 3, sentinel1.address, REGISTRATION_STAKING)

    let registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(pntHolder1.address)
    expect(registration.startEpoch).to.be.eq(1)
    expect(registration.endEpoch).to.be.eq(3)
    expect(registration.kind).to.be.eq(REGISTRATION_STAKING)
    expect(await registrationManager.sentinelOf(pntHolder1.address)).to.be.eq(sentinel1.address)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(1, sentinel1.address)).to.be.eq(stakeAmount)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(2, sentinel1.address)).to.be.eq(stakeAmount)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(3, sentinel1.address)).to.be.eq(stakeAmount)

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(1)

    await expect(registrationManager.releaseSentinel(sentinel1.address))
      .to.emit(registrationManager, 'SentinelReleased')
      .withArgs(sentinel1.address, 1)

    registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(ZERO_ADDRESS)
    expect(registration.startEpoch).to.be.eq(0)
    expect(registration.endEpoch).to.be.eq(0)
    expect(registration.kind).to.be.eq(0)
    expect(await registrationManager.sentinelOf(pntHolder1.address)).to.be.eq(ZERO_ADDRESS)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(1, sentinel1.address)).to.be.eq(0)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(2, sentinel1.address)).to.be.eq(0)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(3, sentinel1.address)).to.be.eq(0)
  })

  it('should be able to release after a updateSentinelRegistrationByBorrowing', async () => {
    //   pntHolder1 - lend
    //                   200k       200k        200k      200k        200k       200k       200k      200k
    //   |-----xxxxx|vvvvvvvvvv-|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4           5          6          7          8          9          10
    //
    //
    //   pntHolder1 - updateSentinelRegistrationByBorrowing 1
    //                               200k     200k       200k       200k
    //   |----------|-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4          5          6
    //
    //   pntHolder1 - result after releaseSentinel at epoch 3
    //
    //
    //   |----------|----------|vvvvvvvvvv|rrrrrrrrrrr|rrrrrrrrrr|----------|
    //   0          1          2          3          4          5          6
    //

    const lendAmount = ethers.utils.parseEther('200000')
    const borrowAmount = ethers.utils.parseEther('200000')
    const lockTime = EPOCH_DURATION * 5
    await pnt.connect(pntHolder1).approve(borrowingManager.address, lendAmount)
    await borrowingManager.connect(pntHolder1)lend(lendAmount, lockTime, pntHolder1.address)

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(1)

    const signature = await getSentinelIdentity(user1.address, { sentinel: sentinel1 })
    await expect(registrationManager.connect(user1).updateSentinelRegistrationByBorrowing(borrowAmount, 3, signature))
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(user1.address, 2, 4, sentinel1.address, REGISTRATION_BORROWING)

    let registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(user1.address)
    expect(registration.startEpoch).to.be.eq(2)
    expect(registration.endEpoch).to.be.eq(4)
    expect(registration.kind).to.be.eq(REGISTRATION_BORROWING)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(1, sentinel1.address)).to.be.eq(0)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(2, sentinel1.address)).to.be.eq(borrowAmount)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(3, sentinel1.address)).to.be.eq(borrowAmount)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(4, sentinel1.address)).to.be.eq(borrowAmount)

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(3)

    await expect(registrationManager.releaseSentinel(sentinel1.address))
      .to.emit(registrationManager, 'SentinelReleased')
      .withArgs(sentinel1.address, 3)

    registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(user1.address)
    expect(registration.startEpoch).to.be.eq(2)
    expect(registration.endEpoch).to.be.eq(2)
    expect(registration.kind).to.be.eq(REGISTRATION_BORROWING)
    expect(await registrationManager.sentinelOf(user1.address)).to.be.eq(sentinel1.address)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(1, sentinel1.address)).to.be.eq(0)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(2, sentinel1.address)).to.be.eq(borrowAmount)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(3, sentinel1.address)).to.be.eq(0)
  })

  it('should not be able to release after a updateSentinelRegistrationByBorrowing', async () => {
    //   pntHolder1 - stake
    //                   200k       200k        200k      200k        200k       200k       200k      200k
    //   |-----xxxxx|vvvvvvvvvv-|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4           5          6          7          8          9          10
    //
    //
    //
    //   pntHolder1 - updateSentinelRegistrationByBorrowing 1
    //                               200k     200k       200k       200k
    //   |----------|-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4          5          6
    //
    //   pntHolder1 - result after releaseSentinel at epoch 5
    //
    //
    //   |----------|----------|----------|----------|----------|-----rrrrr|
    //   0          1          2          3          4          5          6
    //

    const lendAmount = ethers.utils.parseEther('200000')
    const borrowAmount = ethers.utils.parseEther('200000')
    const lockTime = EPOCH_DURATION * 9
    await pnt.connect(pntHolder1).approve(borrowingManager.address, lendAmount)
    await borrowingManager.connect(pntHolder1)lend(lendAmount, lockTime, pntHolder1.address)

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(1)

    const signature = await getSentinelIdentity(user1.address, { sentinel: sentinel1 })
    await expect(registrationManager.connect(user1).updateSentinelRegistrationByBorrowing(borrowAmount, 3, signature))
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(user1.address, 2, 4, sentinel1.address, REGISTRATION_BORROWING)

    let registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(user1.address)
    expect(registration.startEpoch).to.be.eq(2)
    expect(registration.endEpoch).to.be.eq(4)
    expect(registration.kind).to.be.eq(REGISTRATION_BORROWING)
    expect(await registrationManager.sentinelOf(user1.address)).to.be.eq(sentinel1.address)

    await time.increase(EPOCH_DURATION * 4)
    expect(await epochsManager.currentEpoch()).to.be.equal(5)

    await expect(registrationManager.releaseSentinel(sentinel1.address)).to.be.revertedWithCustomError(
      registrationManager,
      'SentinelNotReleasable'
    )
  })

  it('should not be able to break everything when things are complicated - updateSentinelRegistrationByBorrowing (1)', async () => {
    //   pntHolder1 - deposit - 1
    //
    //                  600k       600k       600k       600k       600k       600k
    //   |-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4          5          6          7
    //
    //   user1 - updateSentinelRegistrationByBorrowing - 1
    //                  200k        200k
    //   |----------|vvvvvvvvvv|vvvvvvvvvv|----------|----------|----------|----------|
    //   0          1          2          3          4          5          6          7
    //
    //   user1 - updateSentinelRegistrationByBorrowing - 2
    //                  150k        150k
    //   |----------|vvvvvvvvvv|vvvvvvvvvv|----------|----------|----------|----------|
    //   0          1          2          3          4          5          6          7
    //
    //   user1 - updateSentinelRegistrationByBorrowing - 3 - ERROR: impossible to updateSentinelRegistration with an end epoch less than the current one
    //                   50k
    //   |----------|rrrrrrrrrr|----------|----------|----------|----------|----------|----------|
    //   0          1          2          3          4           5         6          7
    //
    //   pntHolder1 - deposit - 2
    //
    //                  300k        300k       300k
    //   |-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|----------|----------|
    //   0          1          2          3          4          5          6          7
    //
    //
    //   user1 - updateSentinelRegistrationByBorrowing - 4 - ERROR: epoch 3 would have an amount (50k) that is less than the minimum one
    //                   50k      50k        50k
    //   |----------|rrrrrrrrrr|rrrrrrrrrrr|rrrrrrrrr|----------|----------|----------|----------|----------|
    //   0          1          2          3          4          5         6          7
    //
    //
    //   user1 - updateSentinelRegistrationByBorrowing - 5
    //                                                                        200k
    //   |----------|----------|----------|----------|----------|---------|vvvvvvvvvv|----------|
    //   0          1          2          3          4          5         6          7

    let lendAmount = ethers.utils.parseEther('600000')
    let lockTime = EPOCH_DURATION * 7
    const borrowAmount1 = ethers.utils.parseEther('200000')
    const borrowAmount2 = ethers.utils.parseEther('150000')
    const borrowAmount3 = ethers.utils.parseEther('50000')

    await pnt.connect(pntHolder1).approve(borrowingManager.address, lendAmount)
    await borrowingManager.connect(pntHolder1)lend(lendAmount, lockTime, pntHolder1.address)

    const signature = await getSentinelIdentity(user1.address, { sentinel: sentinel1 })
    await expect(registrationManager.connect(user1).updateSentinelRegistrationByBorrowing(borrowAmount1, 2, signature))
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(user1.address, 1, 2, sentinel1.address, REGISTRATION_BORROWING)

    expect(await registrationManager.sentinelReservedAmountByEpochOf(1, sentinel1.address)).to.be.eq(borrowAmount1)
    expect(await registrationManager.sentinelReservedAmountByEpochOf(2, sentinel1.address)).to.be.eq(borrowAmount1)

    await expect(registrationManager.connect(user1).updateSentinelRegistrationByBorrowing(borrowAmount2, 2, signature))
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(user1.address, 1, 2, sentinel1.address, REGISTRATION_BORROWING)

    // prettier-ignore
    expect(await registrationManager.sentinelReservedAmountByEpochOf(1, sentinel1.address)).to.be.eq(borrowAmount1.add(borrowAmount2))
    // prettier-ignore
    expect(await registrationManager.sentinelReservedAmountByEpochOf(2, sentinel1.address)).to.be.eq(borrowAmount1.add(borrowAmount2))

    await expect(
      registrationManager.connect(user1).updateSentinelRegistrationByBorrowing(borrowAmount3, 1, signature)
    ).to.be.revertedWithCustomError(registrationManager, 'InvalidNumberOfEpochs')

    lendAmount = ethers.utils.parseEther('300000')
    lockTime = EPOCH_DURATION * 4
    await pnt.connect(pntHolder1).approve(borrowingManager.address, lendAmount)
    await borrowingManager.connect(pntHolder1)lend(lendAmount, lockTime, pntHolder1.address)
    await expect(
      registrationManager.connect(user1).updateSentinelRegistrationByBorrowing(borrowAmount3, 3, signature)
    ).to.be.revertedWithCustomError(borrowingManager, 'InvalidAmount')

    await time.increase(EPOCH_DURATION * 5)
    expect(await epochsManager.currentEpoch()).to.be.equal(5)

    await expect(registrationManager.connect(user1).updateSentinelRegistrationByBorrowing(borrowAmount1, 1, signature))
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(user1.address, 6, 6, sentinel1.address, REGISTRATION_BORROWING)

    expect(await registrationManager.sentinelReservedAmountByEpochOf(6, sentinel1.address)).to.be.eq(borrowAmount1)

    const { owner, startEpoch, endEpoch, kind } = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(owner).to.be.eq(user1.address)
    expect(startEpoch).to.be.eq(6)
    expect(endEpoch).to.be.eq(6)
    expect(kind).to.be.eq(REGISTRATION_BORROWING)
  })
})
*/
