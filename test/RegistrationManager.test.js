const { expect } = require('chai')
const { ethers, upgrades, config } = require('hardhat')
const { time } = require('@nomicfoundation/hardhat-network-helpers')
const { getRole, getSentinelIdentity, truncateWithPrecision } = require('./utils')
const {
  ACL_ADDRESS,
  BORROW_AMOUNT_FOR_SENTINEL_REGISTRATION,
  DAO_ROOT_ADDRESS,
  EPOCH_DURATION,
  LEND_MAX_EPOCHS,
  ONE_DAY,
  PNETWORK_CHAIN_IDS,
  PNT_ADDRESS,
  PNT_HOLDER_1_ADDRESS,
  PNT_HOLDER_2_ADDRESS,
  REGISTRATION_NULL,
  REGISTRATION_SENTINEL_BORROWING,
  REGISTRATION_SENTINEL_STAKING,
  TOKEN_MANAGER_ADDRESS,
  ZERO_ADDRESS
} = require('./constants')

let stakingManagerRM,
  stakingManagerBM,
  epochsManager,
  registrationManager,
  pnt,
  owner,
  pntHolder1,
  sentinel1,
  RegistrationManager,
  acl,
  daoRoot,
  fakeForwarder
let BORROW_ROLE, RELEASE_SENTINEL_ROLE, UPGRADE_ROLE

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
    const StakingManager = await ethers.getContractFactory('StakingManagerPermissioned')
    const ERC20 = await ethers.getContractFactory('ERC20')
    const ACL = await ethers.getContractFactory('ACL')

    const signers = await ethers.getSigners()
    owner = signers[0]
    sentinel1 = signers[1]
    user1 = signers[2]
    fakeForwarder = signers[3]
    pntHolder1 = await ethers.getImpersonatedSigner(PNT_HOLDER_1_ADDRESS)
    pntHolder2 = await ethers.getImpersonatedSigner(PNT_HOLDER_2_ADDRESS)
    daoRoot = await ethers.getImpersonatedSigner(DAO_ROOT_ADDRESS)

    pnt = await ERC20.attach(PNT_ADDRESS)
    acl = await ACL.attach(ACL_ADDRESS)

    stakingManagerBM = await upgrades.deployProxy(StakingManager, [PNT_ADDRESS, TOKEN_MANAGER_ADDRESS, fakeForwarder.address], {
      initializer: 'initialize',
      kind: 'uups'
    })

    stakingManagerRM = await upgrades.deployProxy(StakingManager, [PNT_ADDRESS, TOKEN_MANAGER_ADDRESS, fakeForwarder.address], {
      initializer: 'initialize',
      kind: 'uups'
    })

    epochsManager = await upgrades.deployProxy(EpochsManager, [EPOCH_DURATION], {
      initializer: 'initialize',
      kind: 'uups'
    })

    borrowingManager = await upgrades.deployProxy(
      BorrowingManager,
      [pnt.address, stakingManagerBM.address, epochsManager.address, fakeForwarder.address, LEND_MAX_EPOCHS],
      {
        initializer: 'initialize',
        kind: 'uups'
      }
    )

    registrationManager = await upgrades.deployProxy(
      RegistrationManager,
      [pnt.address, stakingManagerRM.address, epochsManager.address, borrowingManager.address, fakeForwarder.address],
      {
        initializer: 'initialize',
        kind: 'uups'
      }
    )

    // roles
    BORROW_ROLE = getRole('BORROW_ROLE')
    RELEASE_ROLE = getRole('RELEASE_ROLE')
    RELEASE_SENTINEL_ROLE = getRole('RELEASE_SENTINEL_ROLE')
    STAKE_ROLE = getRole('STAKE_ROLE')
    INCREASE_DURATION_ROLE = getRole('INCREASE_DURATION_ROLE')
    UPGRADE_ROLE = getRole('UPGRADE_ROLE')

    // grant roles
    await borrowingManager.grantRole(BORROW_ROLE, registrationManager.address)
    await borrowingManager.grantRole(RELEASE_ROLE, registrationManager.address)
    await stakingManagerBM.grantRole(STAKE_ROLE, borrowingManager.address)
    await stakingManagerBM.grantRole(INCREASE_DURATION_ROLE, borrowingManager.address)
    await stakingManagerRM.grantRole(STAKE_ROLE, registrationManager.address)
    await stakingManagerRM.grantRole(INCREASE_DURATION_ROLE, registrationManager.address)
    await registrationManager.grantRole(RELEASE_SENTINEL_ROLE, owner.address)
    await registrationManager.grantRole(UPGRADE_ROLE, owner.address)
    await acl.connect(daoRoot).grantPermission(stakingManagerRM.address, TOKEN_MANAGER_ADDRESS, getRole('MINT_ROLE'))
    await acl.connect(daoRoot).grantPermission(stakingManagerRM.address, TOKEN_MANAGER_ADDRESS, getRole('BURN_ROLE'))
    await acl.connect(daoRoot).grantPermission(stakingManagerBM.address, TOKEN_MANAGER_ADDRESS, getRole('MINT_ROLE'))
    await acl.connect(daoRoot).grantPermission(stakingManagerBM.address, TOKEN_MANAGER_ADDRESS, getRole('BURN_ROLE'))
  })

  it('should be able to updateSentinelRegistrationByStaking for 4 epochs starting from epoch 1', async () => {
    //   pntHolder1 - updateSentinelRegistrationByStaking
    //                   200k       200k        200k      200k
    //   |-----xxxxx|vvvvvvvvvv-|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|
    //   0          1          2          3          4          5           6          7
    //

    const stakeAmount = ethers.utils.parseEther('200000')
    const duration = EPOCH_DURATION * 5

    const signature = await getSentinelIdentity(pntHolder1.address, { sentinel: sentinel1 })
    await pnt.connect(pntHolder1).approve(registrationManager.address, stakeAmount)
    await expect(registrationManager.connect(pntHolder1).updateSentinelRegistrationByStaking(pntHolder1.address, stakeAmount, duration, signature))
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(pntHolder1.address, 1, 4, sentinel1.address, REGISTRATION_SENTINEL_STAKING, stakeAmount)

    const { owner, startEpoch, endEpoch, kind } = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(owner).to.be.eq(pntHolder1.address)
    expect(startEpoch).to.be.eq(1)
    expect(endEpoch).to.be.eq(4)
    expect(kind).to.be.eq(REGISTRATION_SENTINEL_STAKING)
  })

  it('should be able to updateSentinelRegistrationByStaking for 4 epochs starting from epoch 1 in behalf of another user', async () => {
    //   pntHolder1 - updateSentinelRegistrationByStaking
    //                   200k       200k        200k      200k
    //   |-----xxxxx|vvvvvvvvvv-|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|
    //   0          1          2          3          4          5           6          7
    //

    const stakeAmount = ethers.utils.parseEther('200000')
    const duration = EPOCH_DURATION * 5

    const signature = await getSentinelIdentity(user1.address, { sentinel: sentinel1 })
    await pnt.connect(pntHolder1).approve(registrationManager.address, stakeAmount)
    await expect(registrationManager.connect(pntHolder1).updateSentinelRegistrationByStaking(user1.address, stakeAmount, duration, signature))
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(user1.address, 1, 4, sentinel1.address, REGISTRATION_SENTINEL_STAKING, stakeAmount)

    const { owner, startEpoch, endEpoch, kind } = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(owner).to.be.eq(user1.address)
    expect(startEpoch).to.be.eq(1)
    expect(endEpoch).to.be.eq(4)
    expect(kind).to.be.eq(REGISTRATION_SENTINEL_STAKING)
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
    const duration = EPOCH_DURATION * 9

    const signature = await getSentinelIdentity(pntHolder1.address, { sentinel: sentinel1 })
    await pnt.connect(pntHolder1).approve(registrationManager.address, stakeAmount)
    await expect(registrationManager.connect(pntHolder1).updateSentinelRegistrationByStaking(pntHolder1.address, stakeAmount, duration, signature))
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(pntHolder1.address, 1, 8, sentinel1.address, REGISTRATION_SENTINEL_STAKING, stakeAmount)

    const { owner, startEpoch, endEpoch, kind } = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(owner).to.be.eq(pntHolder1.address)
    expect(startEpoch).to.be.eq(1)
    expect(endEpoch).to.be.eq(8)
    expect(kind).to.be.eq(REGISTRATION_SENTINEL_STAKING)
    expect(await registrationManager.sentinelOf(pntHolder1.address)).to.be.eq(sentinel1.address)

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    await expect(
      registrationManager.connect(pntHolder1)['updateSentinelRegistrationByBorrowing(uint16,bytes)'](2, signature)
    ).to.be.revertedWithCustomError(registrationManager, 'InvalidRegistration')
  })

  it('should be able to updateSentinelRegistrationByStaking 2 times in order to renew his registration (1)', async () => {
    //
    //   pntHolder1 - updateSentinelRegistrationByStaking at epoch 0
    //                   200k       200k        200k      200k        200k
    //   |----------|vvvvvvvvvv-|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|
    //   0          1          2          3          4           5          6          7
    //
    //
    //
    //   pntHolder1 - updateSentinelRegistrationByStaking at epoch 0
    //                   200k      200k
    //   |----------|vvvvvvvvvv|vvvvvvvvvv|-----------|
    //   0          1          2          3           4
    //
    //
    //   pntHolder1 - result
    //                   400k       400k        200k      200k       200k
    //   |----------|vvvvvvvvvv-|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|
    //   0          1          2          3          4           5          6

    const stakeAmount = ethers.utils.parseEther('200000')
    let duration = EPOCH_DURATION * 6

    const signature = await getSentinelIdentity(pntHolder1.address, { sentinel: sentinel1 })
    await pnt.connect(pntHolder1).approve(registrationManager.address, stakeAmount)
    await expect(registrationManager.connect(pntHolder1).updateSentinelRegistrationByStaking(pntHolder1.address, stakeAmount, duration, signature))
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(pntHolder1.address, 1, 5, sentinel1.address, REGISTRATION_SENTINEL_STAKING, stakeAmount)

    let registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(pntHolder1.address)
    expect(registration.startEpoch).to.be.eq(1)
    expect(registration.endEpoch).to.be.eq(5)
    expect(registration.kind).to.be.eq(REGISTRATION_SENTINEL_STAKING)
    expect(await registrationManager.sentinelOf(pntHolder1.address)).to.be.eq(sentinel1.address)

    duration = EPOCH_DURATION * 3
    await pnt.connect(pntHolder1).approve(registrationManager.address, stakeAmount)
    await expect(registrationManager.connect(pntHolder1).updateSentinelRegistrationByStaking(pntHolder1.address, stakeAmount, duration, signature))
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(pntHolder1.address, 1, 5, sentinel1.address, REGISTRATION_SENTINEL_STAKING, stakeAmount)

    registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(pntHolder1.address)
    expect(registration.startEpoch).to.be.eq(1)
    expect(registration.endEpoch).to.be.eq(5)
    expect(registration.kind).to.be.eq(REGISTRATION_SENTINEL_STAKING)
    expect(await registrationManager.sentinelOf(pntHolder1.address)).to.be.eq(sentinel1.address)

    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 1)).to.be.eq(truncateWithPrecision(stakeAmount.mul(2)))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 2)).to.be.eq(truncateWithPrecision(stakeAmount.mul(2)))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 3)).to.be.eq(truncateWithPrecision(stakeAmount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 4)).to.be.eq(truncateWithPrecision(stakeAmount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 5)).to.be.eq(truncateWithPrecision(stakeAmount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 6)).to.be.eq(0)

    await time.increase(EPOCH_DURATION * 5)
    expect(await epochsManager.currentEpoch()).to.be.equal(5)
    await expect(
      stakingManagerRM.connect(pntHolder1)['unstake(uint256,bytes4)'](stakeAmount.mul(2), PNETWORK_CHAIN_IDS.polygonMainnet)
    ).to.be.revertedWithCustomError(stakingManagerRM, 'UnfinishedStakingPeriod')

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(6)
    await expect(stakingManagerRM.connect(pntHolder1)['unstake(uint256,bytes4)'](stakeAmount.mul(2), PNETWORK_CHAIN_IDS.polygonMainnet)).to.not.be
      .reverted
  })

  it('should be able to updateSentinelRegistrationByStaking 2 times in order to renew his registration (2)', async () => {
    //
    //   pntHolder1 - updateSentinelRegistrationByStaking at epoch 0
    //                   200k       200k        200k
    //   |----------|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|-----------|----------|----------|
    //   0          1           2          3          4          5          6          7
    //
    //
    //
    //   pntHolder1 - updateSentinelRegistrationByStaking at epoch 4
    //                                                                200k     200k
    //   |----------|----------|----------|----------|-----------|vvvvvvvvvv|vvvvvvvvvv|
    //   0          1          2          3          4           5          6          7
    //
    //
    //   pntHolder1 - result
    //                   200k       200k        200k                 200k     200k
    //   |----------|vvvvvvvvvv-|vvvvvvvvvv|vvvvvvvvvv|----------|vvvvvvvvvv|vvvvvvvvvv|----------|
    //   0          1          2          3          4           5          6          7

    const stakeAmount = ethers.utils.parseEther('200000')
    let duration = EPOCH_DURATION * 4

    const signature = await getSentinelIdentity(pntHolder1.address, { sentinel: sentinel1 })
    await pnt.connect(pntHolder1).approve(registrationManager.address, stakeAmount)
    await expect(registrationManager.connect(pntHolder1).updateSentinelRegistrationByStaking(pntHolder1.address, stakeAmount, duration, signature))
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(pntHolder1.address, 1, 3, sentinel1.address, REGISTRATION_SENTINEL_STAKING, stakeAmount)

    let registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(pntHolder1.address)
    expect(registration.startEpoch).to.be.eq(1)
    expect(registration.endEpoch).to.be.eq(3)
    expect(registration.kind).to.be.eq(REGISTRATION_SENTINEL_STAKING)
    expect(await registrationManager.sentinelOf(pntHolder1.address)).to.be.eq(sentinel1.address)

    await time.increase(EPOCH_DURATION * 4)
    expect(await epochsManager.currentEpoch()).to.be.equal(4)
    await expect(stakingManagerRM.connect(pntHolder1)['unstake(uint256,bytes4)'](stakeAmount, PNETWORK_CHAIN_IDS.polygonMainnet)).to.not.be.reverted

    duration = EPOCH_DURATION * 3
    await pnt.connect(pntHolder1).approve(registrationManager.address, stakeAmount)
    await expect(registrationManager.connect(pntHolder1).updateSentinelRegistrationByStaking(pntHolder1.address, stakeAmount, duration, signature))
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(pntHolder1.address, 5, 6, sentinel1.address, REGISTRATION_SENTINEL_STAKING, stakeAmount)

    registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(pntHolder1.address)
    expect(registration.startEpoch).to.be.eq(5)
    expect(registration.endEpoch).to.be.eq(6)
    expect(registration.kind).to.be.eq(REGISTRATION_SENTINEL_STAKING)
    expect(await registrationManager.sentinelOf(pntHolder1.address)).to.be.eq(sentinel1.address)
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 1)).to.be.eq(truncateWithPrecision(stakeAmount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 2)).to.be.eq(truncateWithPrecision(stakeAmount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 3)).to.be.eq(truncateWithPrecision(stakeAmount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 4)).to.be.eq(0)
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 5)).to.be.eq(truncateWithPrecision(stakeAmount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 6)).to.be.eq(truncateWithPrecision(stakeAmount))

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(5)
    await expect(
      stakingManagerRM.connect(pntHolder1)['unstake(uint256,bytes4)'](stakeAmount, PNETWORK_CHAIN_IDS.polygonMainnet)
    ).to.be.revertedWithCustomError(stakingManagerRM, 'UnfinishedStakingPeriod')

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(7)
    await expect(stakingManagerRM.connect(pntHolder1)['unstake(uint256,bytes4)'](stakeAmount, PNETWORK_CHAIN_IDS.polygonMainnet)).to.not.be.reverted
  })

  it('should be able to updateSentinelRegistrationByBorrowing in order to renew his registration (1)', async () => {
    //   pntHolder1 - lend
    //
    //   |----------|vvvvvvvvvv-|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|
    //   0          1          2          3          4           5           6          7
    //
    //
    //   user1 - updateSentinelRegistrationByBorrowing at epoch 0
    //
    //   |----------|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|
    //   0          1          2          3          4          5
    //
    //
    //   user1 - updateSentinelRegistrationByBorrowing at epoch 0
    //
    //   |----------|----------|----------|----------|vvvvvvvvvv|vvvvvvvvvv|----------|
    //   0          1          2          3          4          5          6

    const lendAmount = ethers.utils.parseEther('200000')
    const duration = EPOCH_DURATION * 6
    await pnt.connect(pntHolder1).approve(borrowingManager.address, lendAmount)
    await borrowingManager.connect(pntHolder1).lend(pntHolder1.address, lendAmount, duration)

    const signature = await getSentinelIdentity(user1.address, { sentinel: sentinel1 })
    await expect(registrationManager.connect(user1)['updateSentinelRegistrationByBorrowing(uint16,bytes)'](3, signature))
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(user1.address, 1, 3, sentinel1.address, REGISTRATION_SENTINEL_BORROWING, BORROW_AMOUNT_FOR_SENTINEL_REGISTRATION)

    let registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(user1.address)
    expect(registration.startEpoch).to.be.eq(1)
    expect(registration.endEpoch).to.be.eq(3)
    expect(registration.kind).to.be.eq(REGISTRATION_SENTINEL_BORROWING)
    expect(await registrationManager.sentinelOf(user1.address)).to.be.eq(sentinel1.address)

    await expect(registrationManager.connect(user1)['updateSentinelRegistrationByBorrowing(uint16,bytes)'](2, signature))
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(user1.address, 1, 5, sentinel1.address, REGISTRATION_SENTINEL_BORROWING, BORROW_AMOUNT_FOR_SENTINEL_REGISTRATION)

    registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(user1.address)
    expect(registration.startEpoch).to.be.eq(1)
    expect(registration.endEpoch).to.be.eq(5)
    expect(registration.kind).to.be.eq(REGISTRATION_SENTINEL_BORROWING)
    expect(await registrationManager.sentinelOf(user1.address)).to.be.eq(sentinel1.address)
  })

  it('should be able to updateSentinelRegistrationByBorrowing in order to renew his registration (2)', async () => {
    //   pntHolder1 - lend
    //
    //   |----------|vvvvvvvvvv-|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|
    //   0          1          2          3          4           5          6          7
    //
    //
    //   user1 - updateSentinelRegistrationByBorrowing at epoch 0
    //
    //   |----------|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|
    //   0          1          2          3          4          5
    //
    //
    //   user1 - updateSentinelRegistrationByBorrowing at epoch 4
    //
    //   |----------|----------|----------|----------|----------|vvvvvvvvvv|vvvvvvvvvv|----------|
    //   0          1          2          3          4          5          6          7

    const lendAmount = ethers.utils.parseEther('200000')
    const duration = EPOCH_DURATION * 7
    await pnt.connect(pntHolder1).approve(borrowingManager.address, lendAmount)
    await borrowingManager.connect(pntHolder1).lend(pntHolder1.address, lendAmount, duration)

    const signature = await getSentinelIdentity(user1.address, { sentinel: sentinel1 })
    await expect(registrationManager.connect(user1)['updateSentinelRegistrationByBorrowing(uint16,bytes)'](3, signature))
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(user1.address, 1, 3, sentinel1.address, REGISTRATION_SENTINEL_BORROWING, BORROW_AMOUNT_FOR_SENTINEL_REGISTRATION)

    let registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(user1.address)
    expect(registration.startEpoch).to.be.eq(1)
    expect(registration.endEpoch).to.be.eq(3)
    expect(registration.kind).to.be.eq(REGISTRATION_SENTINEL_BORROWING)
    expect(await registrationManager.sentinelOf(user1.address)).to.be.eq(sentinel1.address)

    await time.increase(EPOCH_DURATION * 4)
    expect(await epochsManager.currentEpoch()).to.be.equal(4)

    await expect(registrationManager.connect(user1)['updateSentinelRegistrationByBorrowing(uint16,bytes)'](2, signature))
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(user1.address, 5, 6, sentinel1.address, REGISTRATION_SENTINEL_BORROWING, BORROW_AMOUNT_FOR_SENTINEL_REGISTRATION)

    registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(user1.address)
    expect(registration.startEpoch).to.be.eq(5)
    expect(registration.endEpoch).to.be.eq(6)
    expect(registration.kind).to.be.eq(REGISTRATION_SENTINEL_BORROWING)
    expect(await registrationManager.sentinelOf(user1.address)).to.be.eq(sentinel1.address)
  })

  it('should be able to release after a updateSentinelRegistrationByStaking in the same epoch where the borrow starts', async () => {
    //   pntHolder1 - updateSentinelRegistrationByStaking
    //                   200k       200k        200k      200k
    //   |----------|vvvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|
    //   0          1          2          3          4           5          6
    //
    //
    //
    //   pntHolder1 - result after releaseSentinel at epoch 2
    //
    //
    //   |----------|rrrrrrrrrr|rrrrrrrrrrr|rrrrrrrrrrr|rrrrrrrrrr|----------|
    //   0          1          2          3           4          5
    //

    const stakeAmount = ethers.utils.parseEther('200000')
    const duration = EPOCH_DURATION * 5

    const signature = await getSentinelIdentity(pntHolder1.address, { sentinel: sentinel1 })
    await pnt.connect(pntHolder1).approve(registrationManager.address, stakeAmount)
    await expect(registrationManager.connect(pntHolder1).updateSentinelRegistrationByStaking(pntHolder1.address, stakeAmount, duration, signature))
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(pntHolder1.address, 1, 4, sentinel1.address, REGISTRATION_SENTINEL_STAKING, stakeAmount)

    let registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(pntHolder1.address)
    expect(registration.startEpoch).to.be.eq(1)
    expect(registration.endEpoch).to.be.eq(4)
    expect(registration.kind).to.be.eq(REGISTRATION_SENTINEL_STAKING)
    expect(await registrationManager.sentinelOf(pntHolder1.address)).to.be.eq(sentinel1.address)
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 1)).to.be.eq(truncateWithPrecision(stakeAmount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 2)).to.be.eq(truncateWithPrecision(stakeAmount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 3)).to.be.eq(truncateWithPrecision(stakeAmount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 4)).to.be.eq(truncateWithPrecision(stakeAmount))

    await time.increase(EPOCH_DURATION * 1)
    expect(await epochsManager.currentEpoch()).to.be.equal(1)

    await expect(registrationManager.releaseSentinel(sentinel1.address))
      .to.emit(registrationManager, 'SentinelReleased')
      .withArgs(sentinel1.address, 1)

    registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(ZERO_ADDRESS)
    expect(registration.startEpoch).to.be.eq(0)
    expect(registration.endEpoch).to.be.eq(0)
    expect(registration.kind).to.be.eq(REGISTRATION_NULL)
    expect(await registrationManager.sentinelOf(pntHolder1.address)).to.be.eq(ZERO_ADDRESS)
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 1)).to.be.eq(0)
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 2)).to.be.eq(0)
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 3)).to.be.eq(0)
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 4)).to.be.eq(0)
  })

  it('should be able to release after a updateSentinelRegistrationByStaking ', async () => {
    //   pntHolder1 - updateSentinelRegistrationByStaking
    //                   200k       200k        200k      200k
    //   |----------|vvvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|
    //   0          1          2          3          4           5          6
    //
    //
    //
    //   pntHolder1 - result after releaseSentinel at epoch 2
    //
    //                   200k
    //   |----------|vvvvvvvvvv|rrrrrrrrrrr|rrrrrrrrrrr|rrrrrrrrrr|----------|
    //   0          1          2          3           4          5
    //

    const stakeAmount = ethers.utils.parseEther('200000')
    const duration = EPOCH_DURATION * 5

    const signature = await getSentinelIdentity(pntHolder1.address, { sentinel: sentinel1 })
    await pnt.connect(pntHolder1).approve(registrationManager.address, stakeAmount)
    await expect(registrationManager.connect(pntHolder1).updateSentinelRegistrationByStaking(pntHolder1.address, stakeAmount, duration, signature))
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(pntHolder1.address, 1, 4, sentinel1.address, REGISTRATION_SENTINEL_STAKING, stakeAmount)

    let registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(pntHolder1.address)
    expect(registration.startEpoch).to.be.eq(1)
    expect(registration.endEpoch).to.be.eq(4)
    expect(registration.kind).to.be.eq(REGISTRATION_SENTINEL_STAKING)
    expect(await registrationManager.sentinelOf(pntHolder1.address)).to.be.eq(sentinel1.address)
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 1)).to.be.eq(truncateWithPrecision(stakeAmount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 2)).to.be.eq(truncateWithPrecision(stakeAmount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 3)).to.be.eq(truncateWithPrecision(stakeAmount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 4)).to.be.eq(truncateWithPrecision(stakeAmount))

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    await expect(registrationManager.releaseSentinel(sentinel1.address))
      .to.emit(registrationManager, 'SentinelReleased')
      .withArgs(sentinel1.address, 2)

    registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(pntHolder1.address)
    expect(registration.startEpoch).to.be.eq(1)
    expect(registration.endEpoch).to.be.eq(1)
    expect(registration.kind).to.be.eq(REGISTRATION_SENTINEL_STAKING)
    expect(await registrationManager.sentinelOf(pntHolder1.address)).to.be.eq(sentinel1.address)
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 1)).to.be.eq(truncateWithPrecision(stakeAmount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 2)).to.be.eq(0)
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 3)).to.be.eq(0)
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 4)).to.be.eq(0)
  })

  it('should be able to release after a updateSentinelRegistrationByStaking in the same epoch where the borrow starts after a contract upgrade', async () => {
    //   pntHolder1 - updateSentinelRegistrationByStaking
    //                   200k       200k        200k      200k
    //   |----------|vvvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|
    //   0          1          2          3          4           5          6
    //
    //
    //
    //   pntHolder1 - result after releaseSentinel at epoch 2
    //
    //
    //   |----------|rrrrrrrrrr|rrrrrrrrrrr|rrrrrrrrrrr|rrrrrrrrrr|----------|
    //   0          1          2          3           4          5
    //

    const stakeAmount = ethers.utils.parseEther('200000')
    const duration = EPOCH_DURATION * 5

    const signature = await getSentinelIdentity(pntHolder1.address, { sentinel: sentinel1 })
    await pnt.connect(pntHolder1).approve(registrationManager.address, stakeAmount)
    await expect(registrationManager.connect(pntHolder1).updateSentinelRegistrationByStaking(pntHolder1.address, stakeAmount, duration, signature))
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(pntHolder1.address, 1, 4, sentinel1.address, REGISTRATION_SENTINEL_STAKING, stakeAmount)

    let registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(pntHolder1.address)
    expect(registration.startEpoch).to.be.eq(1)
    expect(registration.endEpoch).to.be.eq(4)
    expect(registration.kind).to.be.eq(REGISTRATION_SENTINEL_STAKING)
    expect(await registrationManager.sentinelOf(pntHolder1.address)).to.be.eq(sentinel1.address)
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 1)).to.be.eq(truncateWithPrecision(stakeAmount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 2)).to.be.eq(truncateWithPrecision(stakeAmount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 3)).to.be.eq(truncateWithPrecision(stakeAmount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 4)).to.be.eq(truncateWithPrecision(stakeAmount))

    await time.increase(EPOCH_DURATION * 1)
    expect(await epochsManager.currentEpoch()).to.be.equal(1)

    await upgrades.upgradeProxy(registrationManager.address, RegistrationManager, {
      kind: 'uups'
    })

    await expect(registrationManager.releaseSentinel(sentinel1.address))
      .to.emit(registrationManager, 'SentinelReleased')
      .withArgs(sentinel1.address, 1)

    registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(ZERO_ADDRESS)
    expect(registration.startEpoch).to.be.eq(0)
    expect(registration.endEpoch).to.be.eq(0)
    expect(registration.kind).to.be.eq(REGISTRATION_NULL)
    expect(await registrationManager.sentinelOf(pntHolder1.address)).to.be.eq(ZERO_ADDRESS)
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 1)).to.be.eq(0)
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 2)).to.be.eq(0)
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 3)).to.be.eq(0)
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 4)).to.be.eq(0)
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
    const duration = EPOCH_DURATION * 4

    const signature = await getSentinelIdentity(pntHolder1.address, { sentinel: sentinel1 })
    await pnt.connect(pntHolder1).approve(registrationManager.address, stakeAmount)
    await expect(registrationManager.connect(pntHolder1).updateSentinelRegistrationByStaking(pntHolder1.address, stakeAmount, duration, signature))
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(pntHolder1.address, 1, 3, sentinel1.address, REGISTRATION_SENTINEL_STAKING, stakeAmount)

    await time.increase(EPOCH_DURATION * 4)
    expect(await epochsManager.currentEpoch()).to.be.equal(4)

    await expect(registrationManager.releaseSentinel(sentinel1.address)).to.be.revertedWithCustomError(registrationManager, 'SentinelNotReleasable')
  })

  it('should be able to release after a updateSentinelRegistrationByBorrowing in the same epoch where the borrow starts', async () => {
    //   pntHolder1 - updateSentinelRegistrationByBorrowing 1
    //                               200k     200k       200k
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
    const duration = EPOCH_DURATION * 5
    await pnt.connect(pntHolder1).approve(borrowingManager.address, lendAmount)
    await borrowingManager.connect(pntHolder1).lend(pntHolder1.address, lendAmount, duration)

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(1)

    const signature = await getSentinelIdentity(user1.address, { sentinel: sentinel1 })
    await expect(registrationManager.connect(user1)['updateSentinelRegistrationByBorrowing(uint16,bytes)'](3, signature))
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(user1.address, 2, 4, sentinel1.address, REGISTRATION_SENTINEL_BORROWING, BORROW_AMOUNT_FOR_SENTINEL_REGISTRATION)

    let registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(user1.address)
    expect(registration.startEpoch).to.be.eq(2)
    expect(registration.endEpoch).to.be.eq(4)
    expect(registration.kind).to.be.eq(REGISTRATION_SENTINEL_BORROWING)
    expect(await registrationManager.sentinelOf(user1.address)).to.be.eq(sentinel1.address)
    expect(await borrowingManager.borrowedAmountByEpochOf(sentinel1.address, 2)).to.be.eq(truncateWithPrecision(borrowAmount))
    expect(await borrowingManager.borrowedAmountByEpochOf(sentinel1.address, 3)).to.be.eq(truncateWithPrecision(borrowAmount))
    expect(await borrowingManager.borrowedAmountByEpochOf(sentinel1.address, 4)).to.be.eq(truncateWithPrecision(borrowAmount))

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    await expect(registrationManager.releaseSentinel(sentinel1.address))
      .to.emit(registrationManager, 'SentinelReleased')
      .withArgs(sentinel1.address, 2)

    registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(ZERO_ADDRESS)
    expect(registration.startEpoch).to.be.eq(0)
    expect(registration.endEpoch).to.be.eq(0)
    expect(registration.kind).to.be.eq(REGISTRATION_NULL)
    expect(await registrationManager.sentinelOf(user1.address)).to.be.eq(ZERO_ADDRESS)
    expect(await borrowingManager.borrowedAmountByEpochOf(sentinel1.address, 2)).to.be.eq(0)
    expect(await borrowingManager.borrowedAmountByEpochOf(sentinel1.address, 3)).to.be.eq(0)
    expect(await borrowingManager.borrowedAmountByEpochOf(sentinel1.address, 4)).to.be.eq(0)
  })

  it('should be able to release after a updateSentinelRegistrationByBorrowing', async () => {
    //   pntHolder1 - lend
    //                   200k       200k        200k      200k        200k
    //   |----------|vvvvvvvvvv-|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|
    //   0          1          2          3          4           5          6
    //
    //   pntHolder1 - updateSentinelRegistrationByBorrowing
    //                   200k       200k        200k      200k
    //   |----------|vvvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|
    //   0          1          2          3          4           5          6
    //
    //
    //
    //   pntHolder1 - result after releaseSentinel at epoch 2
    //
    //                   200k
    //   |----------|vvvvvvvvvv|rrrrrrrrrrr|rrrrrrrrrrr|rrrrrrrrrr|----------|
    //   0          1          2          3           4          5
    //
    //

    const lendAmount = ethers.utils.parseEther('200000')
    const borrowAmount = ethers.utils.parseEther('200000')
    const duration = EPOCH_DURATION * 6
    await pnt.connect(pntHolder1).approve(borrowingManager.address, lendAmount)
    await borrowingManager.connect(pntHolder1).lend(pntHolder1.address, lendAmount, duration)

    const signature = await getSentinelIdentity(user1.address, { sentinel: sentinel1 })
    await expect(registrationManager.connect(user1)['updateSentinelRegistrationByBorrowing(uint16,bytes)'](4, signature))
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(user1.address, 1, 4, sentinel1.address, REGISTRATION_SENTINEL_BORROWING, BORROW_AMOUNT_FOR_SENTINEL_REGISTRATION)

    let registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(user1.address)
    expect(registration.startEpoch).to.be.eq(1)
    expect(registration.endEpoch).to.be.eq(4)
    expect(registration.kind).to.be.eq(REGISTRATION_SENTINEL_BORROWING)
    expect(await borrowingManager.borrowedAmountByEpochOf(sentinel1.address, 1)).to.be.eq(truncateWithPrecision(borrowAmount))
    expect(await borrowingManager.borrowedAmountByEpochOf(sentinel1.address, 2)).to.be.eq(truncateWithPrecision(borrowAmount))
    expect(await borrowingManager.borrowedAmountByEpochOf(sentinel1.address, 3)).to.be.eq(truncateWithPrecision(borrowAmount))
    expect(await borrowingManager.borrowedAmountByEpochOf(sentinel1.address, 4)).to.be.eq(truncateWithPrecision(borrowAmount))

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    await expect(registrationManager.releaseSentinel(sentinel1.address))
      .to.emit(registrationManager, 'SentinelReleased')
      .withArgs(sentinel1.address, 2)

    registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(user1.address)
    expect(registration.startEpoch).to.be.eq(1)
    expect(registration.endEpoch).to.be.eq(1)
    expect(registration.kind).to.be.eq(REGISTRATION_SENTINEL_BORROWING)
    expect(await registrationManager.sentinelOf(user1.address)).to.be.eq(sentinel1.address)
    expect(await borrowingManager.borrowedAmountByEpochOf(sentinel1.address, 1)).to.be.eq(truncateWithPrecision(borrowAmount))
    expect(await borrowingManager.borrowedAmountByEpochOf(sentinel1.address, 2)).to.be.eq(0)
    expect(await borrowingManager.borrowedAmountByEpochOf(sentinel1.address, 3)).to.be.eq(0)
    expect(await borrowingManager.borrowedAmountByEpochOf(sentinel1.address, 4)).to.be.eq(0)
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
    //                               200k     200k       200k
    //   |----------|----------|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|
    //   0          1          2          3          4          5          6
    //
    //   pntHolder1 - result after releaseSentinel at epoch 5
    //
    //
    //   |----------|----------|----------|----------|----------|-----rrrrr|
    //   0          1          2          3          4          5          6
    //

    const lendAmount = ethers.utils.parseEther('200000')
    const duration = EPOCH_DURATION * 9
    await pnt.connect(pntHolder1).approve(borrowingManager.address, lendAmount)
    await borrowingManager.connect(pntHolder1).lend(pntHolder1.address, lendAmount, duration)

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(1)

    const signature = await getSentinelIdentity(user1.address, { sentinel: sentinel1 })
    await expect(registrationManager.connect(user1)['updateSentinelRegistrationByBorrowing(uint16,bytes)'](3, signature))
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(user1.address, 2, 4, sentinel1.address, REGISTRATION_SENTINEL_BORROWING, BORROW_AMOUNT_FOR_SENTINEL_REGISTRATION)

    let registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(user1.address)
    expect(registration.startEpoch).to.be.eq(2)
    expect(registration.endEpoch).to.be.eq(4)
    expect(registration.kind).to.be.eq(REGISTRATION_SENTINEL_BORROWING)
    expect(await registrationManager.sentinelOf(user1.address)).to.be.eq(sentinel1.address)

    await time.increase(EPOCH_DURATION * 4)
    expect(await epochsManager.currentEpoch()).to.be.equal(5)

    await expect(registrationManager.releaseSentinel(sentinel1.address)).to.be.revertedWithCustomError(registrationManager, 'SentinelNotReleasable')
  })

  it('should not be able to register a node by updateSentinelRegistrationByStaking with an amount less than 200k PNT', async () => {
    const stakeAmount = ethers.utils.parseEther('199999')
    const duration = EPOCH_DURATION * 2

    const signature = await getSentinelIdentity(pntHolder1.address, { sentinel: sentinel1 })
    await pnt.connect(pntHolder1).approve(registrationManager.address, stakeAmount)
    await expect(
      registrationManager.connect(pntHolder1).updateSentinelRegistrationByStaking(pntHolder1.address, stakeAmount, duration, signature)
    ).to.be.revertedWithCustomError(registrationManager, 'InvalidAmount')
  })

  it('should be able to increase the sentinel registration duration by 3 epochs and should not be able to unstake before the ending epoch', async () => {
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
    //   increaseSentinelDuration at epoch 3 of 3 epochs -> reset of epoch 4,5 and 6 and adds new ones [7,10]
    //
    //   |----------|----------|----------|----------|rrrrrrrrrr|rrrrrrrrrr|rrrrrrrrrr|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|
    //   0          1          2          3          4          5          6          7          8          9          10         11

    const amount = ethers.utils.parseEther('200000')
    let duration = EPOCH_DURATION * 5
    const signature = await getSentinelIdentity(pntHolder1.address, { sentinel: sentinel1 })

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    await pnt.connect(pntHolder1).approve(registrationManager.address, amount)
    await registrationManager.connect(pntHolder1).updateSentinelRegistrationByStaking(pntHolder1.address, amount, duration, signature)

    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 2)).to.be.eq(0)
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 3)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 4)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 5)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 6)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 7)).to.be.eq(0)

    expect(await registrationManager.totalSentinelStakedAmountByEpoch(2)).to.be.eq(0)
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(3)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(4)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(5)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(6)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(7)).to.be.eq(0)

    let registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(pntHolder1.address)
    expect(registration.startEpoch).to.be.eq(3)
    expect(registration.endEpoch).to.be.eq(6)

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(3)
    duration = EPOCH_DURATION * 4
    await expect(registrationManager.connect(pntHolder1)['increaseSentinelRegistrationDuration(uint64)'](duration))
      .to.emit(registrationManager, 'DurationIncreased')
      .withArgs(sentinel1.address, 10)

    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 3)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 4)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 5)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 6)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 7)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 8)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 9)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 10)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 11)).to.be.eq(0)

    expect(await registrationManager.totalSentinelStakedAmountByEpoch(3)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(4)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(5)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(6)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(7)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(8)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(9)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(10)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(11)).to.be.eq(0)

    registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(pntHolder1.address)
    expect(registration.startEpoch).to.be.eq(3)
    expect(registration.endEpoch).to.be.eq(10)

    await time.increase(EPOCH_DURATION * 6)
    expect(await epochsManager.currentEpoch()).to.be.equal(9)
    await expect(
      stakingManagerRM.connect(pntHolder1)['unstake(uint256,bytes4)'](amount, PNETWORK_CHAIN_IDS.polygonMainnet)
    ).to.be.revertedWithCustomError(stakingManagerRM, 'UnfinishedStakingPeriod')

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(10)
    await expect(
      stakingManagerRM.connect(pntHolder1)['unstake(uint256,bytes4)'](amount, PNETWORK_CHAIN_IDS.polygonMainnet)
    ).to.be.revertedWithCustomError(stakingManagerRM, 'UnfinishedStakingPeriod')

    await time.increase(EPOCH_DURATION - ONE_DAY)
    expect(await epochsManager.currentEpoch()).to.be.equal(10)
    await expect(
      stakingManagerRM.connect(pntHolder1)['unstake(uint256,bytes4)'](amount, PNETWORK_CHAIN_IDS.polygonMainnet)
    ).to.be.revertedWithCustomError(stakingManagerRM, 'UnfinishedStakingPeriod')

    const stake = await stakingManagerRM.stakeOf(pntHolder1.address)
    await time.increaseTo(stake.endDate)
    expect(await epochsManager.currentEpoch()).to.be.equal(11)
    await expect(stakingManagerRM.connect(pntHolder1)['unstake(uint256,bytes4)'](amount, PNETWORK_CHAIN_IDS.polygonMainnet))
      .to.emit(stakingManagerRM, 'Unstaked')
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

    const amount = ethers.utils.parseEther('200000')
    let duration = EPOCH_DURATION * 4
    const signature = await getSentinelIdentity(pntHolder1.address, { sentinel: sentinel1 })

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    await pnt.connect(pntHolder1).approve(registrationManager.address, amount)
    await pnt.connect(pntHolder1).approve(registrationManager.address, amount)
    await registrationManager.connect(pntHolder1).updateSentinelRegistrationByStaking(pntHolder1.address, amount, duration, signature)

    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 2)).to.be.eq(0)
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 3)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 4)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 5)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 6)).to.be.eq(0)

    expect(await registrationManager.totalSentinelStakedAmountByEpoch(2)).to.be.eq(0)
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(3)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(4)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(5)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(6)).to.be.eq(0)

    let registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(pntHolder1.address)
    expect(registration.startEpoch).to.be.eq(3)
    expect(registration.endEpoch).to.be.eq(5)

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(4)
    duration = EPOCH_DURATION * 4
    await expect(registrationManager.connect(pntHolder1)['increaseSentinelRegistrationDuration(uint64)'](duration))
      .to.emit(registrationManager, 'DurationIncreased')
      .withArgs(sentinel1.address, 9)

    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 3)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 4)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 5)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 6)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 7)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 8)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 9)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 10)).to.be.eq(0)

    expect(await registrationManager.totalSentinelStakedAmountByEpoch(3)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(4)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(5)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(6)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(7)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(8)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(9)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(10)).to.be.eq(0)

    registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(pntHolder1.address)
    expect(registration.startEpoch).to.be.eq(3)
    expect(registration.endEpoch).to.be.eq(9)

    await time.increase(EPOCH_DURATION * 4)
    expect(await epochsManager.currentEpoch()).to.be.equal(8)
    await expect(
      stakingManagerRM.connect(pntHolder1)['unstake(uint256,bytes4)'](amount, PNETWORK_CHAIN_IDS.polygonMainnet)
    ).to.be.revertedWithCustomError(stakingManagerRM, 'UnfinishedStakingPeriod')

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(9)
    await expect(
      stakingManagerRM.connect(pntHolder1)['unstake(uint256,bytes4)'](amount, PNETWORK_CHAIN_IDS.polygonMainnet)
    ).to.be.revertedWithCustomError(stakingManagerRM, 'UnfinishedStakingPeriod')

    await time.increase(EPOCH_DURATION - ONE_DAY)
    expect(await epochsManager.currentEpoch()).to.be.equal(9)
    await expect(
      stakingManagerRM.connect(pntHolder1)['unstake(uint256,bytes4)'](amount, PNETWORK_CHAIN_IDS.polygonMainnet)
    ).to.be.revertedWithCustomError(stakingManagerRM, 'UnfinishedStakingPeriod')

    const stake = await stakingManagerRM.stakeOf(pntHolder1.address)
    await time.increaseTo(stake.endDate)
    expect(await epochsManager.currentEpoch()).to.be.equal(10)
    await expect(stakingManagerRM.connect(pntHolder1)['unstake(uint256,bytes4)'](amount, PNETWORK_CHAIN_IDS.polygonMainnet))
      .to.emit(stakingManagerRM, 'Unstaked')
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

    const amount = ethers.utils.parseEther('200000')
    let duration = EPOCH_DURATION * 4
    const signature = await getSentinelIdentity(pntHolder1.address, { sentinel: sentinel1 })

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    await pnt.connect(pntHolder1).approve(registrationManager.address, amount)
    await pnt.connect(pntHolder1).approve(registrationManager.address, amount)
    await registrationManager.connect(pntHolder1).updateSentinelRegistrationByStaking(pntHolder1.address, amount, duration, signature)

    let registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(pntHolder1.address)
    expect(registration.startEpoch).to.be.eq(3)
    expect(registration.endEpoch).to.be.eq(5)

    await time.increase(EPOCH_DURATION * 5)
    expect(await epochsManager.currentEpoch()).to.be.equal(7)
    await expect(registrationManager.connect(pntHolder1)['increaseSentinelRegistrationDuration(uint64)'](duration))
      .to.emit(registrationManager, 'DurationIncreased')
      .withArgs(sentinel1.address, 10)

    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 8)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 9)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 10)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 11)).to.be.eq(0)

    expect(await registrationManager.totalSentinelStakedAmountByEpoch(8)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(9)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(10)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(11)).to.be.eq(0)

    registration = await registrationManager.sentinelRegistration(sentinel1.address)
    expect(registration.owner).to.be.eq(pntHolder1.address)
    expect(registration.startEpoch).to.be.eq(8)
    expect(registration.endEpoch).to.be.eq(10)

    await time.increase(EPOCH_DURATION * 3)
    expect(await epochsManager.currentEpoch()).to.be.equal(10)
    await expect(
      stakingManagerRM.connect(pntHolder1)['unstake(uint256,bytes4)'](amount, PNETWORK_CHAIN_IDS.polygonMainnet)
    ).to.be.revertedWithCustomError(stakingManagerRM, 'UnfinishedStakingPeriod')

    await time.increase(EPOCH_DURATION - ONE_DAY)
    expect(await epochsManager.currentEpoch()).to.be.equal(10)
    await expect(
      stakingManagerRM.connect(pntHolder1)['unstake(uint256,bytes4)'](amount, PNETWORK_CHAIN_IDS.polygonMainnet)
    ).to.be.revertedWithCustomError(stakingManagerRM, 'UnfinishedStakingPeriod')

    const stake = await stakingManagerRM.stakeOf(pntHolder1.address)
    await time.increaseTo(stake.endDate)
    expect(await epochsManager.currentEpoch()).to.be.equal(11)
    await expect(stakingManagerRM.connect(pntHolder1)['unstake(uint256,bytes4)'](amount, PNETWORK_CHAIN_IDS.polygonMainnet))
      .to.emit(stakingManagerRM, 'Unstaked')
      .withArgs(pntHolder1.address, amount)
  })
})
