const { time } = require('@nomicfoundation/hardhat-network-helpers')
const { expect } = require('chai')
const { ethers, upgrades, config, network } = require('hardhat')

const {
  ADDRESSES: {
    GNOSIS: { ACL_ADDRESS, SAFE_ADDRESS, TOKEN_MANAGER_ADDRESS }
  },
  MISC: {
    BORROW_AMOUNT_FOR_SENTINEL_REGISTRATION,
    EPOCH_DURATION,
    LEND_MAX_EPOCHS,
    ONE_DAY,
    PNT_MAX_TOTAL_SUPPLY,
    MINIMUM_BORROWING_FEE,
    ONE_HOUR_IN_S
  },
  PNETWORK_NETWORK_IDS,
  REGISTRATION_TYPE: { REGISTRATION_SENTINEL_STAKING, REGISTRATION_SENTINEL_BORROWING, REGISTRATON_GUARDIAN }
} = require('../lib/constants')
const { getAllRoles } = require('../lib/roles')

const { getSentinelIdentity, truncateWithPrecision } = require('./utils')
const { hardhatReset } = require('./utils/hardhat-reset')
const { sendEth } = require('./utils/send-eth')

const {
  BORROW_ROLE,
  RELEASE_ROLE,
  STAKE_ROLE,
  INCREASE_DURATION_ROLE,
  SLASH_ROLE,
  INCREASE_AMOUNT_ROLE,
  UPGRADE_ROLE,
  UPDATE_GUARDIAN_REGISTRATION_ROLE,
  SET_GOVERNANCE_MESSAGE_EMITTER_ROLE,
  SET_FEES_MANAGER_ROLE,
  REDIRECT_CLAIM_TO_CHALLENGER_BY_EPOCH_ROLE,
  MINT_ROLE,
  BURN_ROLE
} = getAllRoles(ethers)

let signers,
  stakingManagerRM,
  stakingManagerLM,
  epochsManager,
  lendingManager,
  registrationManager,
  pnt,
  owner,
  user1,
  pntHolder1,
  pntHolder2,
  sentinel1,
  sentinel2,
  RegistrationManager,
  acl,
  daoRoot,
  fakeForwarder,
  fakeDandelionVoting,
  guardian1,
  guardianOwner1,
  guardian2,
  guardianOwner2,
  feesManager,
  fakePnetworkHub,
  challenger,
  governanceMessageEmitter

describe('RegistrationManager', () => {
  const getSignatureNonce = (_address) => registrationManager.getSignatureNonceByOwner(_address)

  beforeEach(async () => {
    const rpc = config.networks.hardhat.forking.url
    const blockToForkFrom = config.networks.hardhat.forking.blockNumber
    await hardhatReset(network.provider, rpc, blockToForkFrom)

    RegistrationManager = await ethers.getContractFactory('RegistrationManager')
    const LendingManager = await ethers.getContractFactory('LendingManager')
    const EpochsManager = await ethers.getContractFactory('EpochsManager')
    const StakingManager = await ethers.getContractFactory('StakingManagerPermissioned')
    const FeesManager = await ethers.getContractFactory('FeesManager')
    const TestToken = await ethers.getContractFactory('TestToken')
    const ACL = await ethers.getContractFactory('ACL')
    const MockGovernanceMessageEmitter = await ethers.getContractFactory('MockGovernanceMessageEmitter')

    signers = await ethers.getSigners()
    owner = signers[0]
    sentinel1 = signers[1]
    user1 = signers[2]
    fakeForwarder = signers[3]
    fakeDandelionVoting = signers[4]
    guardian1 = signers[5]
    guardianOwner1 = signers[6]
    guardian2 = signers[7]
    guardianOwner2 = signers[8]
    fakePnetworkHub = signers[9]
    challenger = signers[10]
    sentinel2 = signers[11]
    pntHolder1 = ethers.Wallet.createRandom().connect(ethers.provider)
    pntHolder2 = ethers.Wallet.createRandom().connect(ethers.provider)
    daoRoot = await ethers.getImpersonatedSigner(SAFE_ADDRESS)
    await sendEth(ethers, owner, daoRoot.address, '1')

    pnt = await TestToken.deploy('PNT', 'PNT')
    acl = ACL.attach(ACL_ADDRESS)

    await pnt.connect(owner).transfer(pntHolder1.address, ethers.parseEther('500000'))
    await pnt.connect(owner).transfer(pntHolder2.address, ethers.parseEther('500000'))

    await sendEth(ethers, owner, pntHolder1.address, '10')
    await sendEth(ethers, owner, pntHolder2.address, '10')

    stakingManagerLM = await upgrades.deployProxy(
      StakingManager,
      [pnt.target, TOKEN_MANAGER_ADDRESS, fakeForwarder.address, PNT_MAX_TOTAL_SUPPLY],
      {
        initializer: 'initialize',
        kind: 'uups'
      }
    )

    stakingManagerRM = await upgrades.deployProxy(
      StakingManager,
      [pnt.target, TOKEN_MANAGER_ADDRESS, fakeForwarder.address, PNT_MAX_TOTAL_SUPPLY],
      {
        initializer: 'initialize',
        kind: 'uups'
      }
    )

    epochsManager = await upgrades.deployProxy(EpochsManager, [EPOCH_DURATION, 0], {
      initializer: 'initialize',
      kind: 'uups'
    })

    lendingManager = await upgrades.deployProxy(
      LendingManager,
      [
        pnt.target,
        stakingManagerLM.target,
        epochsManager.target,
        fakeForwarder.address,
        fakeDandelionVoting.address,
        LEND_MAX_EPOCHS
      ],
      {
        initializer: 'initialize',
        kind: 'uups'
      }
    )

    registrationManager = await upgrades.deployProxy(
      RegistrationManager,
      [pnt.target, stakingManagerRM.target, epochsManager.target, lendingManager.target, fakeForwarder.address],
      {
        initializer: 'initialize',
        kind: 'uups'
      }
    )

    feesManager = await upgrades.deployProxy(
      FeesManager,
      [
        epochsManager.target,
        lendingManager.target,
        registrationManager.target,
        fakeForwarder.address,
        MINIMUM_BORROWING_FEE
      ],
      {
        initializer: 'initialize',
        kind: 'uups'
      }
    )

    governanceMessageEmitter = await MockGovernanceMessageEmitter.deploy(
      epochsManager.target,
      registrationManager.target
    )

    // grant roles
    await lendingManager.grantRole(BORROW_ROLE, registrationManager.target)
    await lendingManager.grantRole(RELEASE_ROLE, registrationManager.target)
    await stakingManagerLM.grantRole(STAKE_ROLE, lendingManager.target)
    await stakingManagerLM.grantRole(INCREASE_DURATION_ROLE, lendingManager.target)
    await stakingManagerRM.grantRole(STAKE_ROLE, registrationManager.target)
    await stakingManagerRM.grantRole(SLASH_ROLE, registrationManager.target)
    await stakingManagerRM.grantRole(INCREASE_DURATION_ROLE, registrationManager.target)
    await stakingManagerRM.grantRole(INCREASE_AMOUNT_ROLE, registrationManager.target)
    await registrationManager.grantRole(SLASH_ROLE, fakePnetworkHub.address)
    await registrationManager.grantRole(UPGRADE_ROLE, owner.address)
    await registrationManager.grantRole(UPDATE_GUARDIAN_REGISTRATION_ROLE, fakeDandelionVoting.address)
    await registrationManager.grantRole(SET_GOVERNANCE_MESSAGE_EMITTER_ROLE, owner.address)
    await registrationManager.grantRole(SET_FEES_MANAGER_ROLE, owner.address)
    await feesManager.grantRole(REDIRECT_CLAIM_TO_CHALLENGER_BY_EPOCH_ROLE, registrationManager.target)
    await acl.connect(daoRoot).grantPermission(stakingManagerRM.target, TOKEN_MANAGER_ADDRESS, MINT_ROLE)
    await acl.connect(daoRoot).grantPermission(stakingManagerRM.target, TOKEN_MANAGER_ADDRESS, BURN_ROLE)
    await acl.connect(daoRoot).grantPermission(stakingManagerLM.target, TOKEN_MANAGER_ADDRESS, MINT_ROLE)
    await acl.connect(daoRoot).grantPermission(stakingManagerLM.target, TOKEN_MANAGER_ADDRESS, BURN_ROLE)

    await registrationManager.setFeesManager(feesManager.target)
    await registrationManager.setGovernanceMessageEmitter(governanceMessageEmitter.target)
  })

  it('should be able to updateSentinelRegistrationByStaking for 4 epochs starting from epoch 1', async () => {
    //   pntHolder1 - updateSentinelRegistrationByStaking
    //                   200k       200k        200k      200k
    //   |-----xxxxx|vvvvvvvvvv-|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|
    //   0          1          2          3          4          5           6          7
    //

    const stakeAmount = ethers.parseEther('200000')
    const duration = EPOCH_DURATION * 5

    const signature = await getSentinelIdentity(pntHolder1.address, { actor: sentinel1, registrationManager })
    await pnt.connect(pntHolder1).approve(registrationManager.target, stakeAmount)
    await expect(
      registrationManager
        .connect(pntHolder1)
        .updateSentinelRegistrationByStaking(
          pntHolder1.address,
          stakeAmount,
          duration,
          signature,
          await getSignatureNonce(pntHolder1.address)
        )
    )
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(pntHolder1.address, 1, 4, sentinel1.address, REGISTRATION_SENTINEL_STAKING, stakeAmount)

    const { owner, startEpoch, endEpoch, kind } = await registrationManager.registrationOf(sentinel1.address)
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

    const stakeAmount = ethers.parseEther('200000')
    const duration = EPOCH_DURATION * 5

    const signature = await getSentinelIdentity(user1.address, { actor: sentinel1, registrationManager })
    await pnt.connect(pntHolder1).approve(registrationManager.target, stakeAmount)
    await expect(
      registrationManager
        .connect(pntHolder1)
        .updateSentinelRegistrationByStaking(
          user1.address,
          stakeAmount,
          duration,
          signature,
          await getSignatureNonce(pntHolder1.address)
        )
    )
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(user1.address, 1, 4, sentinel1.address, REGISTRATION_SENTINEL_STAKING, stakeAmount)

    const { owner, startEpoch, endEpoch, kind } = await registrationManager.registrationOf(sentinel1.address)
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

    const stakeAmount = ethers.parseEther('200000')
    const duration = EPOCH_DURATION * 9

    await pnt.connect(pntHolder1).approve(registrationManager.target, stakeAmount)
    await expect(
      registrationManager
        .connect(pntHolder1)
        .updateSentinelRegistrationByStaking(
          pntHolder1.address,
          stakeAmount,
          duration,
          await getSentinelIdentity(pntHolder1.address, { actor: sentinel1, registrationManager }),
          await getSignatureNonce(pntHolder1.address)
        )
    )
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(pntHolder1.address, 1, 8, sentinel1.address, REGISTRATION_SENTINEL_STAKING, stakeAmount)

    const { owner, startEpoch, endEpoch, kind } = await registrationManager.registrationOf(sentinel1.address)
    expect(owner).to.be.eq(pntHolder1.address)
    expect(startEpoch).to.be.eq(1)
    expect(endEpoch).to.be.eq(8)
    expect(kind).to.be.eq(REGISTRATION_SENTINEL_STAKING)
    expect(await registrationManager.sentinelOf(pntHolder1.address)).to.be.eq(sentinel1.address)

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    await expect(
      registrationManager
        .connect(pntHolder1)
        [
          'updateSentinelRegistrationByBorrowing(uint16,bytes,uint256)'
        ](2, await getSentinelIdentity(pntHolder1.address, { actor: sentinel1, registrationManager }), await getSignatureNonce(pntHolder1.address))
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

    const stakeAmount = ethers.parseEther('200000')
    let duration = EPOCH_DURATION * 6

    let signature = await getSentinelIdentity(pntHolder1.address, { actor: sentinel1, registrationManager })
    await pnt.connect(pntHolder1).approve(registrationManager.target, stakeAmount)
    await expect(
      registrationManager
        .connect(pntHolder1)
        .updateSentinelRegistrationByStaking(
          pntHolder1.address,
          stakeAmount,
          duration,
          signature,
          await getSignatureNonce(pntHolder1.address)
        )
    )
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(pntHolder1.address, 1, 5, sentinel1.address, REGISTRATION_SENTINEL_STAKING, stakeAmount)

    let registration = await registrationManager.registrationOf(sentinel1.address)
    expect(registration.owner).to.be.eq(pntHolder1.address)
    expect(registration.startEpoch).to.be.eq(1)
    expect(registration.endEpoch).to.be.eq(5)
    expect(registration.kind).to.be.eq(REGISTRATION_SENTINEL_STAKING)
    expect(await registrationManager.sentinelOf(pntHolder1.address)).to.be.eq(sentinel1.address)

    duration = EPOCH_DURATION * 3
    signature = await getSentinelIdentity(pntHolder1.address, { actor: sentinel1, registrationManager })
    await pnt.connect(pntHolder1).approve(registrationManager.target, stakeAmount)
    await expect(
      registrationManager
        .connect(pntHolder1)
        .updateSentinelRegistrationByStaking(
          pntHolder1.address,
          stakeAmount,
          duration,
          signature,
          await getSignatureNonce(pntHolder1.address)
        )
    )
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(pntHolder1.address, 1, 2, sentinel1.address, REGISTRATION_SENTINEL_STAKING, stakeAmount)

    registration = await registrationManager.registrationOf(sentinel1.address)
    expect(registration.owner).to.be.eq(pntHolder1.address)
    expect(registration.startEpoch).to.be.eq(1)
    expect(registration.endEpoch).to.be.eq(5)
    expect(registration.kind).to.be.eq(REGISTRATION_SENTINEL_STAKING)
    expect(await registrationManager.sentinelOf(pntHolder1.address)).to.be.eq(sentinel1.address)

    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 1)).to.be.eq(
      truncateWithPrecision(stakeAmount * 2n)
    )
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 2)).to.be.eq(
      truncateWithPrecision(stakeAmount * 2n)
    )
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 3)).to.be.eq(
      truncateWithPrecision(stakeAmount)
    )
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 4)).to.be.eq(
      truncateWithPrecision(stakeAmount)
    )
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 5)).to.be.eq(
      truncateWithPrecision(stakeAmount)
    )
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 6)).to.be.eq(0)

    await time.increase(EPOCH_DURATION * 5)
    expect(await epochsManager.currentEpoch()).to.be.equal(5)
    await expect(
      stakingManagerRM.connect(pntHolder1)['unstake(uint256,bytes4)'](stakeAmount * 2n, PNETWORK_NETWORK_IDS.GNOSIS)
    ).to.be.revertedWithCustomError(stakingManagerRM, 'UnfinishedStakingPeriod')

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(6)
    await stakingManagerRM.connect(pntHolder1)['unstake(uint256,bytes4)'](stakeAmount * 2n, PNETWORK_NETWORK_IDS.GNOSIS)
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

    const stakeAmount = ethers.parseEther('200000')
    let duration = EPOCH_DURATION * 4

    let signature = await getSentinelIdentity(pntHolder1.address, { actor: sentinel1, registrationManager })
    await pnt.connect(pntHolder1).approve(registrationManager.target, stakeAmount)
    await expect(
      registrationManager
        .connect(pntHolder1)
        .updateSentinelRegistrationByStaking(
          pntHolder1.address,
          stakeAmount,
          duration,
          signature,
          await getSignatureNonce(pntHolder1.address)
        )
    )
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(pntHolder1.address, 1, 3, sentinel1.address, REGISTRATION_SENTINEL_STAKING, stakeAmount)

    let registration = await registrationManager.registrationOf(sentinel1.address)
    expect(registration.owner).to.be.eq(pntHolder1.address)
    expect(registration.startEpoch).to.be.eq(1)
    expect(registration.endEpoch).to.be.eq(3)
    expect(registration.kind).to.be.eq(REGISTRATION_SENTINEL_STAKING)
    expect(await registrationManager.sentinelOf(pntHolder1.address)).to.be.eq(sentinel1.address)

    await time.increase(EPOCH_DURATION * 4)
    expect(await epochsManager.currentEpoch()).to.be.equal(4)
    await expect(
      stakingManagerRM.connect(pntHolder1)['unstake(uint256,bytes4)'](stakeAmount, PNETWORK_NETWORK_IDS.GNOSIS)
    ).to.not.be.reverted

    duration = EPOCH_DURATION * 3
    signature = await getSentinelIdentity(pntHolder1.address, { actor: sentinel1, registrationManager })
    await pnt.connect(pntHolder1).approve(registrationManager.target, stakeAmount)
    await expect(
      registrationManager
        .connect(pntHolder1)
        .updateSentinelRegistrationByStaking(
          pntHolder1.address,
          stakeAmount,
          duration,
          signature,
          await getSignatureNonce(pntHolder1.address)
        )
    )
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(pntHolder1.address, 5, 6, sentinel1.address, REGISTRATION_SENTINEL_STAKING, stakeAmount)

    registration = await registrationManager.registrationOf(sentinel1.address)
    expect(registration.owner).to.be.eq(pntHolder1.address)
    expect(registration.startEpoch).to.be.eq(5)
    expect(registration.endEpoch).to.be.eq(6)
    expect(registration.kind).to.be.eq(REGISTRATION_SENTINEL_STAKING)
    expect(await registrationManager.sentinelOf(pntHolder1.address)).to.be.eq(sentinel1.address)
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 1)).to.be.eq(
      truncateWithPrecision(stakeAmount)
    )
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 2)).to.be.eq(
      truncateWithPrecision(stakeAmount)
    )
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 3)).to.be.eq(
      truncateWithPrecision(stakeAmount)
    )
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 4)).to.be.eq(0)
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 5)).to.be.eq(
      truncateWithPrecision(stakeAmount)
    )
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 6)).to.be.eq(
      truncateWithPrecision(stakeAmount)
    )

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(5)
    await expect(
      stakingManagerRM.connect(pntHolder1)['unstake(uint256,bytes4)'](stakeAmount, PNETWORK_NETWORK_IDS.GNOSIS)
    ).to.be.revertedWithCustomError(stakingManagerRM, 'UnfinishedStakingPeriod')

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(7)
    await expect(
      stakingManagerRM.connect(pntHolder1)['unstake(uint256,bytes4)'](stakeAmount, PNETWORK_NETWORK_IDS.GNOSIS)
    ).to.not.be.reverted
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

    const lendAmount = ethers.parseEther('200000')
    const duration = EPOCH_DURATION * 6
    await pnt.connect(pntHolder1).approve(lendingManager.target, lendAmount)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, lendAmount, duration)

    let signature = await getSentinelIdentity(user1.address, { actor: sentinel1, registrationManager })
    await expect(
      registrationManager
        .connect(user1)
        [
          'updateSentinelRegistrationByBorrowing(uint16,bytes,uint256)'
        ](3, signature, await getSignatureNonce(user1.address))
    )
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(
        user1.address,
        1,
        3,
        sentinel1.address,
        REGISTRATION_SENTINEL_BORROWING,
        BORROW_AMOUNT_FOR_SENTINEL_REGISTRATION
      )

    let registration = await registrationManager.registrationOf(sentinel1.address)
    expect(registration.owner).to.be.eq(user1.address)
    expect(registration.startEpoch).to.be.eq(1)
    expect(registration.endEpoch).to.be.eq(3)
    expect(registration.kind).to.be.eq(REGISTRATION_SENTINEL_BORROWING)
    expect(await registrationManager.sentinelOf(user1.address)).to.be.eq(sentinel1.address)

    signature = await getSentinelIdentity(user1.address, { actor: sentinel1, registrationManager })
    await expect(
      registrationManager
        .connect(user1)
        [
          'updateSentinelRegistrationByBorrowing(uint16,bytes,uint256)'
        ](2, signature, await getSignatureNonce(user1.address))
    )
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(
        user1.address,
        1,
        5,
        sentinel1.address,
        REGISTRATION_SENTINEL_BORROWING,
        BORROW_AMOUNT_FOR_SENTINEL_REGISTRATION
      )

    registration = await registrationManager.registrationOf(sentinel1.address)
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

    const lendAmount = ethers.parseEther('200000')
    const duration = EPOCH_DURATION * 7
    await pnt.connect(pntHolder1).approve(lendingManager.target, lendAmount)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, lendAmount, duration)

    let signature = await getSentinelIdentity(user1.address, { actor: sentinel1, registrationManager })
    await expect(
      registrationManager
        .connect(user1)
        [
          'updateSentinelRegistrationByBorrowing(uint16,bytes,uint256)'
        ](3, signature, await getSignatureNonce(user1.address))
    )
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(
        user1.address,
        1,
        3,
        sentinel1.address,
        REGISTRATION_SENTINEL_BORROWING,
        BORROW_AMOUNT_FOR_SENTINEL_REGISTRATION
      )

    let registration = await registrationManager.registrationOf(sentinel1.address)
    expect(registration.owner).to.be.eq(user1.address)
    expect(registration.startEpoch).to.be.eq(1)
    expect(registration.endEpoch).to.be.eq(3)
    expect(registration.kind).to.be.eq(REGISTRATION_SENTINEL_BORROWING)
    expect(await registrationManager.sentinelOf(user1.address)).to.be.eq(sentinel1.address)

    await time.increase(EPOCH_DURATION * 4)
    expect(await epochsManager.currentEpoch()).to.be.equal(4)

    signature = await getSentinelIdentity(user1.address, { actor: sentinel1, registrationManager })
    await expect(
      registrationManager
        .connect(user1)
        [
          'updateSentinelRegistrationByBorrowing(uint16,bytes,uint256)'
        ](2, signature, await getSignatureNonce(user1.address))
    )
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(
        user1.address,
        5,
        6,
        sentinel1.address,
        REGISTRATION_SENTINEL_BORROWING,
        BORROW_AMOUNT_FOR_SENTINEL_REGISTRATION
      )

    registration = await registrationManager.registrationOf(sentinel1.address)
    expect(registration.owner).to.be.eq(user1.address)
    expect(registration.startEpoch).to.be.eq(5)
    expect(registration.endEpoch).to.be.eq(6)
    expect(registration.kind).to.be.eq(REGISTRATION_SENTINEL_BORROWING)
    expect(await registrationManager.sentinelOf(user1.address)).to.be.eq(sentinel1.address)
  })

  it('should not be able to register a node by updateSentinelRegistrationByStaking with an amount less than 200k PNT', async () => {
    const stakeAmount = ethers.parseEther('199999')
    const duration = EPOCH_DURATION * 2

    const signature = await getSentinelIdentity(pntHolder1.address, { actor: sentinel1, registrationManager })
    await pnt.connect(pntHolder1).approve(registrationManager.target, stakeAmount)
    await expect(
      registrationManager
        .connect(pntHolder1)
        .updateSentinelRegistrationByStaking(
          pntHolder1.address,
          stakeAmount,
          duration,
          signature,
          await getSignatureNonce(pntHolder1.address)
        )
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

    const amount = ethers.parseEther('200000')
    let duration = EPOCH_DURATION * 5
    const signature = await getSentinelIdentity(pntHolder1.address, { actor: sentinel1, registrationManager })

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    await pnt.connect(pntHolder1).approve(registrationManager.target, amount)
    await registrationManager
      .connect(pntHolder1)
      .updateSentinelRegistrationByStaking(
        pntHolder1.address,
        amount,
        duration,
        signature,
        await getSignatureNonce(pntHolder1.address)
      )

    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 2)).to.be.eq(0)
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 3)).to.be.eq(
      truncateWithPrecision(amount)
    )
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 4)).to.be.eq(
      truncateWithPrecision(amount)
    )
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 5)).to.be.eq(
      truncateWithPrecision(amount)
    )
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 6)).to.be.eq(
      truncateWithPrecision(amount)
    )
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 7)).to.be.eq(0)

    expect(await registrationManager.totalSentinelStakedAmountByEpoch(2)).to.be.eq(0)
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(3)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(4)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(5)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(6)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(7)).to.be.eq(0)

    let registration = await registrationManager.registrationOf(sentinel1.address)
    expect(registration.owner).to.be.eq(pntHolder1.address)
    expect(registration.startEpoch).to.be.eq(3)
    expect(registration.endEpoch).to.be.eq(6)

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(3)
    duration = EPOCH_DURATION * 4
    await expect(registrationManager.connect(pntHolder1)['increaseSentinelRegistrationDuration(uint64)'](duration))
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(pntHolder1.address, 3, 10, sentinel1.address, REGISTRATION_SENTINEL_STAKING, amount)

    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 3)).to.be.eq(
      truncateWithPrecision(amount)
    )
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 4)).to.be.eq(
      truncateWithPrecision(amount)
    )
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 5)).to.be.eq(
      truncateWithPrecision(amount)
    )
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 6)).to.be.eq(
      truncateWithPrecision(amount)
    )
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 7)).to.be.eq(
      truncateWithPrecision(amount)
    )
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 8)).to.be.eq(
      truncateWithPrecision(amount)
    )
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 9)).to.be.eq(
      truncateWithPrecision(amount)
    )
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 10)).to.be.eq(
      truncateWithPrecision(amount)
    )
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

    registration = await registrationManager.registrationOf(sentinel1.address)
    expect(registration.owner).to.be.eq(pntHolder1.address)
    expect(registration.startEpoch).to.be.eq(3)
    expect(registration.endEpoch).to.be.eq(10)

    await time.increase(EPOCH_DURATION * 6)
    expect(await epochsManager.currentEpoch()).to.be.equal(9)
    await expect(
      stakingManagerRM.connect(pntHolder1)['unstake(uint256,bytes4)'](amount, PNETWORK_NETWORK_IDS.GNOSIS)
    ).to.be.revertedWithCustomError(stakingManagerRM, 'UnfinishedStakingPeriod')

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(10)
    await expect(
      stakingManagerRM.connect(pntHolder1)['unstake(uint256,bytes4)'](amount, PNETWORK_NETWORK_IDS.GNOSIS)
    ).to.be.revertedWithCustomError(stakingManagerRM, 'UnfinishedStakingPeriod')

    await time.increase(EPOCH_DURATION - ONE_DAY)
    expect(await epochsManager.currentEpoch()).to.be.equal(10)
    await expect(
      stakingManagerRM.connect(pntHolder1)['unstake(uint256,bytes4)'](amount, PNETWORK_NETWORK_IDS.GNOSIS)
    ).to.be.revertedWithCustomError(stakingManagerRM, 'UnfinishedStakingPeriod')

    const stake = await stakingManagerRM.stakeOf(pntHolder1.address)
    await time.increaseTo(stake.endDate)
    expect(await epochsManager.currentEpoch()).to.be.equal(11)
    await expect(stakingManagerRM.connect(pntHolder1)['unstake(uint256,bytes4)'](amount, PNETWORK_NETWORK_IDS.GNOSIS))
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

    const amount = ethers.parseEther('200000')
    let duration = EPOCH_DURATION * 4
    const signature = await getSentinelIdentity(pntHolder1.address, { actor: sentinel1, registrationManager })

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    await pnt.connect(pntHolder1).approve(registrationManager.target, amount)
    await pnt.connect(pntHolder1).approve(registrationManager.target, amount)
    await registrationManager
      .connect(pntHolder1)
      .updateSentinelRegistrationByStaking(
        pntHolder1.address,
        amount,
        duration,
        signature,
        await getSignatureNonce(pntHolder1.address)
      )

    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 2)).to.be.eq(0)
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 3)).to.be.eq(
      truncateWithPrecision(amount)
    )
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 4)).to.be.eq(
      truncateWithPrecision(amount)
    )
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 5)).to.be.eq(
      truncateWithPrecision(amount)
    )
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 6)).to.be.eq(0)

    expect(await registrationManager.totalSentinelStakedAmountByEpoch(2)).to.be.eq(0)
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(3)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(4)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(5)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(6)).to.be.eq(0)

    let registration = await registrationManager.registrationOf(sentinel1.address)
    expect(registration.owner).to.be.eq(pntHolder1.address)
    expect(registration.startEpoch).to.be.eq(3)
    expect(registration.endEpoch).to.be.eq(5)

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(4)
    duration = EPOCH_DURATION * 4
    await expect(registrationManager.connect(pntHolder1)['increaseSentinelRegistrationDuration(uint64)'](duration))
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(pntHolder1.address, 3, 9, sentinel1.address, REGISTRATION_SENTINEL_STAKING, amount)

    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 3)).to.be.eq(
      truncateWithPrecision(amount)
    )
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 4)).to.be.eq(
      truncateWithPrecision(amount)
    )
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 5)).to.be.eq(
      truncateWithPrecision(amount)
    )
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 6)).to.be.eq(
      truncateWithPrecision(amount)
    )
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 7)).to.be.eq(
      truncateWithPrecision(amount)
    )
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 8)).to.be.eq(
      truncateWithPrecision(amount)
    )
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 9)).to.be.eq(
      truncateWithPrecision(amount)
    )
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 10)).to.be.eq(0)

    expect(await registrationManager.totalSentinelStakedAmountByEpoch(3)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(4)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(5)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(6)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(7)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(8)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(9)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(10)).to.be.eq(0)

    registration = await registrationManager.registrationOf(sentinel1.address)
    expect(registration.owner).to.be.eq(pntHolder1.address)
    expect(registration.startEpoch).to.be.eq(3)
    expect(registration.endEpoch).to.be.eq(9)

    await time.increase(EPOCH_DURATION * 4)
    expect(await epochsManager.currentEpoch()).to.be.equal(8)
    await expect(
      stakingManagerRM.connect(pntHolder1)['unstake(uint256,bytes4)'](amount, PNETWORK_NETWORK_IDS.GNOSIS)
    ).to.be.revertedWithCustomError(stakingManagerRM, 'UnfinishedStakingPeriod')

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(9)
    await expect(
      stakingManagerRM.connect(pntHolder1)['unstake(uint256,bytes4)'](amount, PNETWORK_NETWORK_IDS.GNOSIS)
    ).to.be.revertedWithCustomError(stakingManagerRM, 'UnfinishedStakingPeriod')

    await time.increase(EPOCH_DURATION - ONE_DAY)
    expect(await epochsManager.currentEpoch()).to.be.equal(9)
    await expect(
      stakingManagerRM.connect(pntHolder1)['unstake(uint256,bytes4)'](amount, PNETWORK_NETWORK_IDS.GNOSIS)
    ).to.be.revertedWithCustomError(stakingManagerRM, 'UnfinishedStakingPeriod')

    const stake = await stakingManagerRM.stakeOf(pntHolder1.address)
    await time.increaseTo(stake.endDate)
    expect(await epochsManager.currentEpoch()).to.be.equal(10)
    await expect(stakingManagerRM.connect(pntHolder1)['unstake(uint256,bytes4)'](amount, PNETWORK_NETWORK_IDS.GNOSIS))
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

    const amount = ethers.parseEther('200000')
    const duration = EPOCH_DURATION * 4
    const signature = await getSentinelIdentity(pntHolder1.address, { actor: sentinel1, registrationManager })

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    await pnt.connect(pntHolder1).approve(registrationManager.target, amount)
    await pnt.connect(pntHolder1).approve(registrationManager.target, amount)
    await registrationManager
      .connect(pntHolder1)
      .updateSentinelRegistrationByStaking(
        pntHolder1.address,
        amount,
        duration,
        signature,
        await getSignatureNonce(pntHolder1.address)
      )

    let registration = await registrationManager.registrationOf(sentinel1.address)
    expect(registration.owner).to.be.eq(pntHolder1.address)
    expect(registration.startEpoch).to.be.eq(3)
    expect(registration.endEpoch).to.be.eq(5)

    await time.increase(EPOCH_DURATION * 5)
    expect(await epochsManager.currentEpoch()).to.be.equal(7)
    await expect(registrationManager.connect(pntHolder1)['increaseSentinelRegistrationDuration(uint64)'](duration))
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(pntHolder1.address, 8, 10, sentinel1.address, REGISTRATION_SENTINEL_STAKING, amount)

    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 8)).to.be.eq(
      truncateWithPrecision(amount)
    )
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 9)).to.be.eq(
      truncateWithPrecision(amount)
    )
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 10)).to.be.eq(
      truncateWithPrecision(amount)
    )
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 11)).to.be.eq(0)

    expect(await registrationManager.totalSentinelStakedAmountByEpoch(8)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(9)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(10)).to.be.eq(truncateWithPrecision(amount))
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(11)).to.be.eq(0)

    registration = await registrationManager.registrationOf(sentinel1.address)
    expect(registration.owner).to.be.eq(pntHolder1.address)
    expect(registration.startEpoch).to.be.eq(8)
    expect(registration.endEpoch).to.be.eq(10)

    await time.increase(EPOCH_DURATION * 3)
    expect(await epochsManager.currentEpoch()).to.be.equal(10)
    await expect(
      stakingManagerRM.connect(pntHolder1)['unstake(uint256,bytes4)'](amount, PNETWORK_NETWORK_IDS.GNOSIS)
    ).to.be.revertedWithCustomError(stakingManagerRM, 'UnfinishedStakingPeriod')

    await time.increase(EPOCH_DURATION - ONE_DAY)
    expect(await epochsManager.currentEpoch()).to.be.equal(10)
    await expect(
      stakingManagerRM.connect(pntHolder1)['unstake(uint256,bytes4)'](amount, PNETWORK_NETWORK_IDS.GNOSIS)
    ).to.be.revertedWithCustomError(stakingManagerRM, 'UnfinishedStakingPeriod')

    const stake = await stakingManagerRM.stakeOf(pntHolder1.address)
    await time.increaseTo(stake.endDate)
    expect(await epochsManager.currentEpoch()).to.be.equal(11)
    await expect(stakingManagerRM.connect(pntHolder1)['unstake(uint256,bytes4)'](amount, PNETWORK_NETWORK_IDS.GNOSIS))
      .to.emit(stakingManagerRM, 'Unstaked')
      .withArgs(pntHolder1.address, amount)
  })

  it('should be able to register a guardian', async () => {
    //   |-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|----------|
    //   0          1          2          3          4          5          6          7          8

    const currentEpoch = await epochsManager.currentEpoch()
    const numberOfEpochs = 5

    await expect(
      registrationManager
        .connect(fakeDandelionVoting)
        .updateGuardianRegistration(guardianOwner1.address, numberOfEpochs, guardian1.address)
    )
      .to.emit(registrationManager, 'GuardianRegistrationUpdated')
      .withArgs(guardianOwner1.address, currentEpoch, currentEpoch + 4n, guardian1.address, REGISTRATON_GUARDIAN)

    expect(await registrationManager.totalNumberOfGuardiansByEpoch(0)).to.be.equal(1)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(1)).to.be.equal(1)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(2)).to.be.equal(1)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(3)).to.be.equal(1)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(4)).to.be.equal(1)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(5)).to.be.equal(0)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(6)).to.be.equal(0)
  })

  it('should be able to update a guardian registration (1)', async () => {
    //
    //   updateGuardianRegistration - 1
    //
    //   |-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|
    //   0          1          2          3          4          5          6          7          8
    //
    //
    //   updateGuardianRegistration - 2 (reset in epoch 4 & 5)
    //
    //   |----------|----------|----------|-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4          5          6          7          8
    //
    //   res - 2
    //
    //   |----------|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|
    //   0          1          2          3          4          5          6          7          8

    let currentEpoch = await epochsManager.currentEpoch()
    let numberOfEpochs = 5
    await expect(
      registrationManager
        .connect(fakeDandelionVoting)
        .updateGuardianRegistration(guardianOwner1.address, numberOfEpochs, guardian1.address)
    )
      .to.emit(registrationManager, 'GuardianRegistrationUpdated')
      .withArgs(
        guardianOwner1.address,
        currentEpoch,
        currentEpoch + BigInt(numberOfEpochs - 1),
        guardian1.address,
        REGISTRATON_GUARDIAN
      )

    await time.increase(EPOCH_DURATION * 3)
    currentEpoch = await epochsManager.currentEpoch()
    expect(currentEpoch).to.be.eq(3)

    numberOfEpochs = 3
    await expect(
      registrationManager
        .connect(fakeDandelionVoting)
        .updateGuardianRegistration(guardianOwner1.address, numberOfEpochs, guardian1.address)
    )
      .to.emit(registrationManager, 'GuardianRegistrationUpdated')
      .withArgs(
        guardianOwner1.address,
        currentEpoch,
        currentEpoch + BigInt(numberOfEpochs - 1),
        guardian1.address,
        REGISTRATON_GUARDIAN
      )

    expect(await registrationManager.totalNumberOfGuardiansByEpoch(0)).to.be.equal(1)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(1)).to.be.equal(1)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(2)).to.be.equal(1)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(3)).to.be.equal(1)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(4)).to.be.equal(1)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(5)).to.be.equal(1)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(6)).to.be.equal(0)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(7)).to.be.equal(0)
    expect(await registrationManager.guardianOf(guardianOwner1.address)).to.be.eq(guardian1.address)
  })

  it('should be able to update a guardian registration (2)', async () => {
    //
    //   guardian1 - updateGuardianRegistration - 1
    //
    //   |-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|----------|
    //   0          1          2          3          4          5          6          7          8
    //
    //
    //   guardian2 - updateGuardianRegistration - 2
    //
    //   |----------|----------|----------|----------|----------|----------|-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3          4          5          6          7          8          9          10
    //
    //   res - 2
    //
    //   |----------|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|----------|vvvvvvvvvv|vvvvvvvvvv|----------|
    //   0          1          2          3          4          5          6          7          8          9          10

    let currentEpoch = await epochsManager.currentEpoch()
    let numberOfEpochs = 4
    await expect(
      registrationManager
        .connect(fakeDandelionVoting)
        .updateGuardianRegistration(guardianOwner1.address, numberOfEpochs, guardian1.address)
    )
      .to.emit(registrationManager, 'GuardianRegistrationUpdated')
      .withArgs(
        guardianOwner1.address,
        currentEpoch,
        currentEpoch + BigInt(numberOfEpochs - 1),
        guardian1.address,
        REGISTRATON_GUARDIAN
      )

    await time.increase(EPOCH_DURATION * 6)
    currentEpoch = await epochsManager.currentEpoch()
    expect(currentEpoch).to.be.eq(6)

    numberOfEpochs = 2
    await expect(
      registrationManager
        .connect(fakeDandelionVoting)
        .updateGuardianRegistration(guardianOwner2.address, numberOfEpochs, guardian2.address)
    )
      .to.emit(registrationManager, 'GuardianRegistrationUpdated')
      .withArgs(
        guardianOwner2.address,
        currentEpoch,
        currentEpoch + BigInt(numberOfEpochs - 1),
        guardian2.address,
        REGISTRATON_GUARDIAN
      )

    expect(await registrationManager.totalNumberOfGuardiansByEpoch(0)).to.be.equal(1)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(1)).to.be.equal(1)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(2)).to.be.equal(1)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(3)).to.be.equal(1)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(4)).to.be.equal(0)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(5)).to.be.equal(0)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(6)).to.be.equal(1)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(7)).to.be.equal(1)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(8)).to.be.equal(0)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(9)).to.be.equal(0)
    expect(await registrationManager.guardianOf(guardianOwner1.address)).to.be.eq(guardian1.address)
  })

  it('should be able to register 2 guardians', async () => {
    //
    //   guardian1 - updateGuardianRegistration - 1
    //
    //   |-----xxxxx|1111111111|1111111111|1111111111|1111111111|1111111111|xxxxx-----|----------|
    //   0          1          2          3          4          5          6          7          8
    //
    //
    //   guardian2 - updateGuardianRegistration - 2 (reset in epoch 4 & 5)
    //
    //   |----------|----------|----------|-----xxxxx|1111111111|1111111111|1111111111|xxxxx-----|
    //   0          1          2          3          4          5          6          7          8
    //
    //   res - 2
    //
    //   |----------|1111111111|1111111111|1111111111|2222222222|2222222222|1111111111|----------|
    //   0          1          2          3          4          5          6          7          8

    let currentEpoch = await epochsManager.currentEpoch()
    let numberOfEpochs = 5
    await expect(
      registrationManager
        .connect(fakeDandelionVoting)
        .updateGuardianRegistration(guardianOwner1.address, numberOfEpochs, guardian1.address)
    )
      .to.emit(registrationManager, 'GuardianRegistrationUpdated')
      .withArgs(
        guardianOwner1.address,
        currentEpoch,
        currentEpoch + BigInt(numberOfEpochs - 1),
        guardian1.address,
        REGISTRATON_GUARDIAN
      )

    await time.increase(EPOCH_DURATION * 3)
    currentEpoch = await epochsManager.currentEpoch()
    expect(currentEpoch).to.be.eq(3)

    numberOfEpochs = 3
    await expect(
      registrationManager
        .connect(fakeDandelionVoting)
        .updateGuardianRegistration(guardianOwner2.address, numberOfEpochs, guardian2.address)
    )
      .to.emit(registrationManager, 'GuardianRegistrationUpdated')
      .withArgs(
        guardianOwner2.address,
        currentEpoch,
        currentEpoch + BigInt(numberOfEpochs - 1),
        guardian2.address,
        REGISTRATON_GUARDIAN
      )

    expect(await registrationManager.totalNumberOfGuardiansByEpoch(0)).to.be.equal(1)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(1)).to.be.equal(1)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(2)).to.be.equal(1)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(3)).to.be.equal(2)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(4)).to.be.equal(2)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(5)).to.be.equal(1)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(6)).to.be.equal(0)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(7)).to.be.equal(0)
    expect(await registrationManager.guardianOf(guardianOwner1.address)).to.be.eq(guardian1.address)
  })

  it('cannot register a guardian using number of epochs = 0', async () => {
    await expect(
      registrationManager
        .connect(fakeDandelionVoting)
        .updateGuardianRegistration(guardianOwner1.address, 0, guardian1.address)
    ).to.be.revertedWithCustomError(registrationManager, 'InvalidNumberOfEpochs')
  })

  it('should be able to register more guardians', async () => {
    //
    //   guardians[0] - updateGuardianRegistration
    //
    //   |-----xxxxx|1111111111|1111111111|1111111111|1111111111|1111111111|xxxxx-----|----------|
    //   0          1          2          3          4          5          6          7          8
    //
    //   guardians[1] - updateGuardianRegistration
    //
    //   |-----xxxxx|1111111111|1111111111|xxxxx-----|----------|----------|----------|----------|
    //   0          1          2          3          4          5          6          7          8
    //
    //   guardians[2] - updateGuardianRegistration
    //
    //   |-----xxxxx|1111111111|1111111111|1111111111|xxxxx-----|----------|----------|----------|
    //   0          1          2          3          4          5          6          7          8
    //
    //   guardians[3] - updateGuardianRegistration
    //
    //   |-----xxxxx|1111111111|1111111111|1111111111|1111111111|1111111111|1111111111|xxxxx-----|
    //   0          1          2          3          4          5          6          7          8
    //
    //   guardians[4] - updateGuardianRegistration
    //
    //   |-----xxxxx|1111111111|xxxxx-----|----------|----------|----------|----------|----------|
    //   0          1          2          3          4          5          6          7          8
    //
    //   res
    //
    //   |-----xxxxx|5555555555|4444444444|3333333333|2222222222|2222222222|1111111111|----------|
    //   0          1          2          3          4          5          6          7          8

    const guardians = signers.slice(10, 15).map(({ address }) => address)
    const guardiansOwners = signers.slice(15, 20).map(({ address }) => address)
    const currentEpoch = await epochsManager.currentEpoch()
    const numbersOfEpochs = [5, 2, 3, 6, 1]

    await expect(
      registrationManager
        .connect(fakeDandelionVoting)
        .updateGuardiansRegistrations(guardiansOwners, numbersOfEpochs, guardians)
    )
      .to.emit(registrationManager, 'GuardianRegistrationUpdated')
      .withArgs(
        guardiansOwners[0],
        currentEpoch,
        currentEpoch + BigInt(numbersOfEpochs[0] - 1),
        guardians[0],
        REGISTRATON_GUARDIAN
      )
      .and.to.emit(registrationManager, 'GuardianRegistrationUpdated')
      .withArgs(
        guardiansOwners[1],
        currentEpoch,
        currentEpoch + BigInt(numbersOfEpochs[1] - 1),
        guardians[1],
        REGISTRATON_GUARDIAN
      )
      .and.to.emit(registrationManager, 'GuardianRegistrationUpdated')
      .withArgs(
        guardiansOwners[2],
        currentEpoch,
        currentEpoch + BigInt(numbersOfEpochs[2] - 1),
        guardians[2],
        REGISTRATON_GUARDIAN
      )
      .and.to.emit(registrationManager, 'GuardianRegistrationUpdated')
      .withArgs(
        guardiansOwners[3],
        currentEpoch,
        currentEpoch + BigInt(numbersOfEpochs[3] - 1),
        guardians[3],
        REGISTRATON_GUARDIAN
      )
      .and.to.emit(registrationManager, 'GuardianRegistrationUpdated')
      .withArgs(
        guardiansOwners[4],
        currentEpoch,
        currentEpoch + BigInt(numbersOfEpochs[4] - 1),
        guardians[4],
        REGISTRATON_GUARDIAN
      )

    expect(await registrationManager.totalNumberOfGuardiansByEpoch(0)).to.be.equal(5)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(1)).to.be.equal(4)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(2)).to.be.equal(3)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(3)).to.be.equal(2)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(4)).to.be.equal(2)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(5)).to.be.equal(1)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(6)).to.be.equal(0)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(7)).to.be.equal(0)

    expect(await registrationManager.guardianOf(guardiansOwners[0])).to.be.eq(guardians[0])
    expect(await registrationManager.guardianOf(guardiansOwners[1])).to.be.eq(guardians[1])
    expect(await registrationManager.guardianOf(guardiansOwners[2])).to.be.eq(guardians[2])
    expect(await registrationManager.guardianOf(guardiansOwners[3])).to.be.eq(guardians[3])
    expect(await registrationManager.guardianOf(guardiansOwners[4])).to.be.eq(guardians[4])
  })

  it('should be able to hard-slash a staking sentinel', async () => {
    //
    //   updateSentinelRegistrationByStaking
    //                  200k        200k      200k       200k
    //   |-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|----------|
    //   0          1          2          3          4          5          6          7          8
    //
    //
    //   slash
    //                              10k        10k        10k
    //   |----------|vvvvvvvvvv|vvvvvsssss|ssssssssss|ssssssssss|----------|----------|----------|
    //   0          1          2          3          4          5          6          7          8
    //
    //   result
    //                             190k        190k       190k
    //   |----------|vvvvvvvvvv|vvvvvsssss|ssssssssss|ssssssssss|----------|----------|----------|
    //   0          1          2          3          4          5          6          7          8

    const stakeAmount = ethers.parseEther('200000')
    const slashAmount = ethers.parseEther('10000')
    const truncatedStakedAmount = truncateWithPrecision(stakeAmount)
    const truncatedLeftAmount = truncateWithPrecision(stakeAmount - slashAmount)
    const duration = EPOCH_DURATION * 5

    const signature = await getSentinelIdentity(pntHolder1.address, { actor: sentinel1, registrationManager })
    await pnt.connect(pntHolder1).approve(registrationManager.target, stakeAmount)
    await registrationManager
      .connect(pntHolder1)
      .updateSentinelRegistrationByStaking(
        pntHolder1.address,
        stakeAmount,
        duration,
        signature,
        await getSignatureNonce(pntHolder1.address)
      )
    await time.increase(EPOCH_DURATION)

    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 1)).to.be.eq(
      truncatedStakedAmount
    )
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 2)).to.be.eq(
      truncatedStakedAmount
    )
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 3)).to.be.eq(
      truncatedStakedAmount
    )
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 4)).to.be.eq(
      truncatedStakedAmount
    )
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(1)).to.be.eq(truncatedStakedAmount)
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(2)).to.be.eq(truncatedStakedAmount)
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(3)).to.be.eq(truncatedStakedAmount)
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(4)).to.be.eq(truncatedStakedAmount)

    await expect(
      registrationManager
        .connect(fakePnetworkHub)
        .slash(sentinel1.address, slashAmount, challenger.address, await time.latest())
    )
      .to.emit(registrationManager, 'StakingSentinelSlashed')
      .withArgs(sentinel1.address, slashAmount)
      .and.to.emit(governanceMessageEmitter, 'GovernanceMessage')

    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 1)).to.be.eq(truncatedLeftAmount)
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 2)).to.be.eq(truncatedLeftAmount)
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 3)).to.be.eq(truncatedLeftAmount)
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 4)).to.be.eq(truncatedLeftAmount)
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(1)).to.be.eq(truncatedLeftAmount)
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(2)).to.be.eq(truncatedLeftAmount)
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(3)).to.be.eq(truncatedLeftAmount)
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(4)).to.be.eq(truncatedLeftAmount)
  })

  it('should be able to light-slash a staking sentinel', async () => {
    const stakeAmount = ethers.parseEther('400000')
    const slashAmount = ethers.parseEther('10000')
    const duration = EPOCH_DURATION * 5

    const signature = await getSentinelIdentity(pntHolder1.address, { actor: sentinel1, registrationManager })
    await pnt.connect(pntHolder1).approve(registrationManager.target, stakeAmount)
    await registrationManager
      .connect(pntHolder1)
      .updateSentinelRegistrationByStaking(
        pntHolder1.address,
        stakeAmount,
        duration,
        signature,
        await getSignatureNonce(pntHolder1.address)
      )
    await time.increase(EPOCH_DURATION)

    await expect(
      registrationManager
        .connect(fakePnetworkHub)
        .slash(sentinel1.address, slashAmount, challenger.address, await time.latest())
    )
      .to.emit(registrationManager, 'StakingSentinelSlashed')
      .withArgs(sentinel1.address, slashAmount)
      .and.to.emit(governanceMessageEmitter, 'GovernanceMessage')
  })

  it('should be able to light-resume a staking sentinel and slash it again', async () => {
    const stakeAmount = ethers.parseEther('400000')
    const slashAmount = ethers.parseEther('10000')
    const duration = EPOCH_DURATION * 5

    let signature = await getSentinelIdentity(pntHolder1.address, { actor: sentinel1, registrationManager })
    await pnt.connect(pntHolder1).approve(registrationManager.target, stakeAmount)
    await registrationManager
      .connect(pntHolder1)
      .updateSentinelRegistrationByStaking(
        pntHolder1.address,
        stakeAmount,
        duration,
        signature,
        await getSignatureNonce(pntHolder1.address)
      )
    await time.increase(EPOCH_DURATION)

    const ts = await time.latest()
    await expect(
      registrationManager.connect(fakePnetworkHub).slash(sentinel1.address, slashAmount, challenger.address, ts)
    )
      .to.emit(registrationManager, 'StakingSentinelSlashed')
      .withArgs(sentinel1.address, slashAmount)
      .and.to.emit(governanceMessageEmitter, 'GovernanceMessage')

    signature = await getSentinelIdentity(pntHolder1.address, { actor: sentinel1, registrationManager })
    await expect(
      registrationManager.connect(pntHolder1).lightResume(signature, await getSignatureNonce(pntHolder1.address))
    )
      .to.emit(registrationManager, 'LightResumed')
      .withArgs(sentinel1.address, REGISTRATION_SENTINEL_STAKING)
      .and.to.emit(governanceMessageEmitter, 'GovernanceMessage')

    await expect(
      registrationManager.connect(fakePnetworkHub).slash(sentinel1.address, slashAmount, challenger.address, ts)
    ).to.revertedWithCustomError(registrationManager, 'ActorAlreadyResumed')

    await expect(
      registrationManager
        .connect(fakePnetworkHub)
        .slash(sentinel1.address, slashAmount, challenger.address, await time.latest())
    )
      .to.emit(registrationManager, 'StakingSentinelSlashed')
      .withArgs(sentinel1.address, slashAmount)
      .and.to.emit(governanceMessageEmitter, 'GovernanceMessage')
  })

  it('should not be able to light-resume a staking sentinel after an hard-slash', async () => {
    const stakeAmount = ethers.parseEther('200000')
    const slashAmount = ethers.parseEther('10000')
    const duration = EPOCH_DURATION * 5

    let signature = await getSentinelIdentity(pntHolder1.address, { actor: sentinel1, registrationManager })
    await pnt.connect(pntHolder1).approve(registrationManager.target, stakeAmount)
    await registrationManager
      .connect(pntHolder1)
      .updateSentinelRegistrationByStaking(
        pntHolder1.address,
        stakeAmount,
        duration,
        signature,
        await getSignatureNonce(pntHolder1.address)
      )
    await time.increase(EPOCH_DURATION)

    await expect(
      registrationManager
        .connect(fakePnetworkHub)
        .slash(sentinel1.address, slashAmount, challenger.address, await time.latest())
    )
      .to.emit(registrationManager, 'StakingSentinelSlashed')
      .withArgs(sentinel1.address, slashAmount)

    signature = await getSentinelIdentity(pntHolder1.address, { actor: sentinel1, registrationManager })
    await expect(
      registrationManager.connect(pntHolder1).lightResume(signature, await getSignatureNonce(pntHolder1.address))
    ).to.be.revertedWithCustomError(registrationManager, 'NotResumable')
  })

  it('should not be able to light-resume a sentinel not registered', async () => {
    const signature = await getSentinelIdentity(pntHolder1.address, { actor: sentinel1, registrationManager })
    await expect(
      registrationManager.connect(pntHolder1).lightResume(signature, await getSignatureNonce(pntHolder1.address))
    ).to.be.revertedWithCustomError(registrationManager, 'InvalidRegistration')
  })

  it('should be able to updateSentinelRegistrationByStaking for 4 epochs starting from epoch 1 for more times with different amounts', async () => {
    //   pntHolder1 - updateSentinelRegistrationByStaking
    //                   200k       200k        200k      200k
    //   |-----xxxxx|vvvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|
    //   0          1          2          3           4           5           6          7
    //
    //   pntHolder1 - updateSentinelRegistrationByStaking
    //                              10k        10k
    //   |----------|-----xxxxx|vvvvvvvvvv|vvvvvvvvvvv|xxxxx-----|----------|----------|
    //   0          1          2          3           4          5           6          7
    //
    //   pntHolder1 - updateSentinelRegistrationByStaking
    //                                        50k         50k
    //   |----------|----------|-----xxxxx|vvvvvvvvvvv|vvvvvvvvvv|xxxxx------|----------|
    //   0          1          2          3           4          5           6          7
    //
    //   result
    //                  200k       210k       260k        250k
    //   |----------|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvvv|vvvvvvvvvv|-----------|--------|
    //   0          1          2          3           4          5           6          7
    //

    let stakeAmount = ethers.parseEther('200000')
    let duration = EPOCH_DURATION * 5
    let signature = await getSentinelIdentity(pntHolder1.address, { actor: sentinel1, registrationManager })

    await pnt.connect(pntHolder1).approve(registrationManager.target, stakeAmount)
    await expect(
      registrationManager
        .connect(pntHolder1)
        .updateSentinelRegistrationByStaking(
          pntHolder1.address,
          stakeAmount,
          duration,
          signature,
          await getSignatureNonce(pntHolder1.address)
        )
    )
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(pntHolder1.address, 1, 4, sentinel1.address, REGISTRATION_SENTINEL_STAKING, stakeAmount)

    let registration = await registrationManager.registrationOf(sentinel1.address)
    expect(registration.owner).to.be.eq(pntHolder1.address)
    expect(registration.startEpoch).to.be.eq(1)
    expect(registration.endEpoch).to.be.eq(4)

    await time.increase(EPOCH_DURATION)

    stakeAmount = ethers.parseEther('10000')
    duration = EPOCH_DURATION * 3
    signature = await getSentinelIdentity(pntHolder1.address, { actor: sentinel1, registrationManager })
    await pnt.connect(pntHolder1).approve(registrationManager.target, stakeAmount)
    await expect(
      registrationManager
        .connect(pntHolder1)
        .updateSentinelRegistrationByStaking(
          pntHolder1.address,
          stakeAmount,
          duration,
          signature,
          await getSignatureNonce(pntHolder1.address)
        )
    )
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(pntHolder1.address, 2, 3, sentinel1.address, REGISTRATION_SENTINEL_STAKING, stakeAmount)

    registration = await registrationManager.registrationOf(sentinel1.address)
    expect(registration.owner).to.be.eq(pntHolder1.address)
    expect(registration.startEpoch).to.be.eq(1)
    expect(registration.endEpoch).to.be.eq(4)
    await time.increase(EPOCH_DURATION)

    stakeAmount = ethers.parseEther('50000')
    duration = EPOCH_DURATION * 3
    signature = await getSentinelIdentity(pntHolder1.address, { actor: sentinel1, registrationManager })
    await pnt.connect(pntHolder1).approve(registrationManager.target, stakeAmount)
    await expect(
      registrationManager
        .connect(pntHolder1)
        .updateSentinelRegistrationByStaking(
          pntHolder1.address,
          stakeAmount,
          duration,
          signature,
          await getSignatureNonce(pntHolder1.address)
        )
    )
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(pntHolder1.address, 3, 4, sentinel1.address, REGISTRATION_SENTINEL_STAKING, stakeAmount)

    registration = await registrationManager.registrationOf(sentinel1.address)
    expect(registration.owner).to.be.eq(pntHolder1.address)
    expect(registration.startEpoch).to.be.eq(1)
    expect(registration.endEpoch).to.be.eq(4)

    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 1)).to.be.eq('200000')
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 2)).to.be.eq('210000')
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 3)).to.be.eq('260000')
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 4)).to.be.eq('250000')
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(1)).to.be.eq('200000')
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(2)).to.be.eq('210000')
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(3)).to.be.eq('260000')
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(4)).to.be.eq('250000')
  })

  it('should be able to hard-resume a staking sentinel', async () => {
    //   pntHolder1 - updateSentinelRegistrationByStaking
    //                   200k       200k        200k      200k
    //   |-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|
    //   0          1           2          3          4           5           6          7
    //
    //   slash
    //                              10k        10k       10k
    //   |----------|----------|ssssssssss|ssssssssss|ssssssssss|----------|----------|
    //   0          1          2          3          4          5          6          7
    //
    //   pntHolder1 - hardResume
    //                              20k       20k         20k
    //   |----------|----------|iiiiiiiiiii|iiiiiiiiii|iiiiiiiiii|---------|----------|
    //   0          1           2          3          4          5         6          7
    //
    //   result
    //                   200k        210k       210k       210k
    //   |----------|vvvvvvvvvvv|vvvvvvvvvvv|vvvvvvvvvvv|vvvvvvvvv|---------|----------|
    //   0          1           2          3          4          5         6          7

    const stakeAmount = ethers.parseEther('200000')
    const slashAmount = ethers.parseEther('10000')
    const duration = EPOCH_DURATION * 5

    let signature1 = await getSentinelIdentity(pntHolder1.address, { actor: sentinel1, registrationManager })
    await pnt.connect(pntHolder1).approve(registrationManager.target, stakeAmount)
    await registrationManager
      .connect(pntHolder1)
      .updateSentinelRegistrationByStaking(
        pntHolder1.address,
        stakeAmount,
        duration,
        signature1,
        await getSignatureNonce(pntHolder1.address)
      )

    const signature2 = await getSentinelIdentity(pntHolder2.address, { actor: sentinel2, registrationManager })
    await pnt.connect(pntHolder2).approve(registrationManager.target, stakeAmount)
    await registrationManager
      .connect(pntHolder2)
      .updateSentinelRegistrationByStaking(
        pntHolder2.address,
        stakeAmount,
        duration,
        signature2,
        await getSignatureNonce(pntHolder2.address)
      )
    await time.increase(EPOCH_DURATION * 2)
    await registrationManager
      .connect(fakePnetworkHub)
      .slash(sentinel1.address, slashAmount, challenger.address, await time.latest())

    const increaseAmount = ethers.parseEther('30000')
    signature1 = await getSentinelIdentity(pntHolder1.address, { actor: sentinel1, registrationManager })
    await pnt.connect(pntHolder1).approve(registrationManager.target, increaseAmount)
    const ts = await time.latest()
    await expect(
      registrationManager
        .connect(pntHolder1)
        .hardResume(increaseAmount, signature1, await getSignatureNonce(pntHolder1.address))
    )
      .to.emit(registrationManager, 'SentinelHardResumed')
      .withArgs(sentinel1.address)
      .and.to.emit(governanceMessageEmitter, 'GovernanceMessage')

    await expect(
      registrationManager.connect(fakePnetworkHub).slash(sentinel1.address, 0, challenger.address, ts)
    ).to.revertedWithCustomError(registrationManager, 'ActorAlreadyResumed')

    await expect(
      registrationManager
        .connect(fakePnetworkHub)
        .slash(sentinel1.address, slashAmount, challenger.address, await time.latest())
    )
      .to.emit(registrationManager, 'StakingSentinelSlashed')
      .withArgs(sentinel1.address, slashAmount)
      .and.to.emit(governanceMessageEmitter, 'GovernanceMessage')

    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 1)).to.be.eq('200000')
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 2)).to.be.eq('210000')
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 3)).to.be.eq('210000')
    expect(await registrationManager.sentinelStakedAmountByEpochOf(sentinel1.address, 4)).to.be.eq('210000')
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(1)).to.be.eq('400000')
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(2)).to.be.eq('410000')
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(3)).to.be.eq('410000')
    expect(await registrationManager.totalSentinelStakedAmountByEpoch(4)).to.be.eq('410000')
  })

  it('should be able to light-resume a borrowing sentinel after an light-slash and slash it again', async () => {
    const stakeAmount = ethers.parseEther('200000')
    const duration = EPOCH_DURATION * 5

    const lendAmount = ethers.parseEther('200000')
    await pnt.connect(pntHolder1).approve(lendingManager.target, lendAmount)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, lendAmount, duration)

    let signature = await getSentinelIdentity(pntHolder1.address, { actor: sentinel1, registrationManager })
    await pnt.connect(pntHolder1).approve(registrationManager.target, stakeAmount)
    await registrationManager
      .connect(pntHolder1)
      [
        'updateSentinelRegistrationByBorrowing(uint16,bytes,uint256)'
      ](4, signature, await getSignatureNonce(pntHolder1.address))
    await time.increase(EPOCH_DURATION * 2)

    signature = await getSentinelIdentity(pntHolder1.address, { actor: sentinel1, registrationManager })
    const ts = await time.latest()
    await registrationManager.connect(fakePnetworkHub).slash(sentinel1.address, 0, challenger.address, ts)
    await expect(
      registrationManager.connect(pntHolder1).lightResume(signature, await getSignatureNonce(pntHolder1.address))
    )
      .to.emit(registrationManager, 'LightResumed')
      .withArgs(sentinel1.address, REGISTRATION_SENTINEL_BORROWING)

    await expect(
      registrationManager.connect(fakePnetworkHub).slash(sentinel1.address, 0, challenger.address, ts)
    ).to.revertedWithCustomError(registrationManager, 'ActorAlreadyResumed')

    await expect(
      registrationManager.connect(fakePnetworkHub).slash(sentinel1.address, 0, challenger.address, await time.latest())
    )
      .to.emit(registrationManager, 'BorrowingSentinelSlashed')
      .withArgs(sentinel1.address)
      .and.to.emit(governanceMessageEmitter, 'GovernanceMessage')
  })

  it('should not be able to hard-resume a staking sentinel after having increase the amount at stake after a slashing if the new amount at stake is less than 200k PNT', async () => {
    //   pntHolder1 - updateSentinelRegistrationByStaking
    //                   200k       200k        200k      200k
    //   |-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|
    //   0          1           2          3          4           5           6          7
    //
    //   slash
    //                              10k        10k       10k
    //   |----------|----------|ssssssssss|ssssssssss|ssssssssss|----------|----------|
    //   0          1          2          3          4          5          6          7
    //
    //   pntHolder1 - hardResume
    //                               5k         5k         5k
    //   |----------|----------|iiiiiiiiiii|iiiiiiiiii|iiiiiiiiii|---------|----------|
    //   0          1           2          3          4          5         6          7
    //
    //   result
    //                   200k        195K       195K       195K
    //   |----------|vvvvvvvvvvv|vvvvvvvvvvv|vvvvvvvvvvv|vvvvvvvvv|---------|----------|
    //   0          1           2          3          4          5         6          7

    const stakeAmount = ethers.parseEther('200000')
    const slashAmount = ethers.parseEther('10000')
    const duration = EPOCH_DURATION * 5

    let signature1 = await getSentinelIdentity(pntHolder1.address, { actor: sentinel1, registrationManager })
    await pnt.connect(pntHolder1).approve(registrationManager.target, stakeAmount)
    await registrationManager
      .connect(pntHolder1)
      .updateSentinelRegistrationByStaking(
        pntHolder1.address,
        stakeAmount,
        duration,
        signature1,
        await getSignatureNonce(pntHolder1.address)
      )

    const signature2 = await getSentinelIdentity(pntHolder2.address, { actor: sentinel2, registrationManager })
    await pnt.connect(pntHolder2).approve(registrationManager.target, stakeAmount)
    await registrationManager
      .connect(pntHolder2)
      .updateSentinelRegistrationByStaking(
        pntHolder2.address,
        stakeAmount,
        duration,
        signature2,
        await getSignatureNonce(pntHolder2.address)
      )
    await time.increase(EPOCH_DURATION * 2)

    await registrationManager
      .connect(fakePnetworkHub)
      .slash(sentinel1.address, slashAmount, challenger.address, await time.latest())
    expect(await registrationManager.slashesByEpochOf(2, sentinel1.address)).to.be.eq(1)

    const increaseAmount = ethers.parseEther('5000')
    signature1 = await getSentinelIdentity(pntHolder1.address, { actor: sentinel1, registrationManager })
    await pnt.connect(pntHolder1).approve(registrationManager.target, increaseAmount)
    await expect(
      registrationManager
        .connect(pntHolder1)
        .hardResume(increaseAmount, signature1, await getSignatureNonce(pntHolder1.address))
    ).to.be.revertedWithCustomError(registrationManager, 'AmountNotAvailableInEpoch')
  })

  it('should not be able to hard-resume a staking sentinel with amount = 0', async () => {
    const stakeAmount = ethers.parseEther('200000')
    const slashAmount = ethers.parseEther('10000')
    const duration = EPOCH_DURATION * 5

    let signature1 = await getSentinelIdentity(pntHolder1.address, { actor: sentinel1, registrationManager })
    await pnt.connect(pntHolder1).approve(registrationManager.target, stakeAmount)
    await registrationManager
      .connect(pntHolder1)
      .updateSentinelRegistrationByStaking(
        pntHolder1.address,
        stakeAmount,
        duration,
        signature1,
        await getSignatureNonce(pntHolder1.address)
      )

    await time.increase(EPOCH_DURATION * 2)
    await registrationManager
      .connect(fakePnetworkHub)
      .slash(sentinel1.address, slashAmount, challenger.address, await time.latest())

    signature1 = await getSentinelIdentity(pntHolder1.address, { actor: sentinel1, registrationManager })
    await expect(
      registrationManager.connect(pntHolder1).hardResume(0, signature1, await getSignatureNonce(pntHolder1.address))
    ).to.be.revertedWithCustomError(registrationManager, 'InvalidAmount')
  })

  it('should be able to light-slash a borrowing sentinel, hard-slash it then should not be able to light-resume it', async () => {
    //
    //   updateSentinelRegistrationByBorrowing
    //
    //   |-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|----------|
    //   0          1          2          3          4          5          6          7          8
    //
    //   slash for the 3 time in epoch 1
    //
    //   |----------|-----sssss|ssssssssss|ssssssssss|ssssssssss|----------|----------|----------|
    //   0          1          2          3          4          5          6          7          8
    //
    //
    //
    //   |----------|vvvvvvvvvv|----------|----------|----------|----------|----------|----------|
    //   0          1          2          3          4          5          6          7          8

    const stakeAmount = ethers.parseEther('200000')
    const duration = EPOCH_DURATION * 5

    const lendAmount = ethers.parseEther('200000')
    await pnt.connect(pntHolder1).approve(lendingManager.target, lendAmount)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, lendAmount, duration)

    let signature = await getSentinelIdentity(pntHolder1.address, { actor: sentinel1, registrationManager })
    await pnt.connect(pntHolder1).approve(registrationManager.target, stakeAmount)
    await registrationManager
      .connect(pntHolder1)
      [
        'updateSentinelRegistrationByBorrowing(uint16,bytes,uint256)'
      ](4, signature, await getSignatureNonce(pntHolder1.address))
    await time.increase(EPOCH_DURATION)

    let registrationOf = await registrationManager.registrationOf(sentinel1.address)
    expect(registrationOf.startEpoch).to.be.eq(1)
    expect(registrationOf.endEpoch).to.be.eq(4)

    const ts = await time.latest()
    await expect(registrationManager.connect(fakePnetworkHub).slash(sentinel1.address, 0, challenger.address, ts))
      .to.emit(registrationManager, 'BorrowingSentinelSlashed')
      .withArgs(sentinel1.address)
      .and.to.emit(governanceMessageEmitter, 'GovernanceMessage')
    expect(await registrationManager.slashesByEpochOf(1, sentinel1.address)).to.be.eq(1)

    await expect(
      registrationManager.connect(fakePnetworkHub).slash(sentinel1.address, 0, challenger.address, ts)
    ).to.revertedWithCustomError(registrationManager, 'ActorAlreadySlashed')
    expect(await registrationManager.slashesByEpochOf(1, sentinel1.address)).to.be.eq(1)

    await time.increase(ONE_HOUR_IN_S + 1)
    await expect(
      registrationManager.connect(fakePnetworkHub).slash(sentinel1.address, 0, challenger.address, await time.latest())
    )
      .to.emit(registrationManager, 'BorrowingSentinelSlashed')
      .withArgs(sentinel1.address)
      .and.to.emit(governanceMessageEmitter, 'GovernanceMessage')

    await time.increase(ONE_HOUR_IN_S + 1)
    expect(await registrationManager.slashesByEpochOf(1, sentinel1.address)).to.be.eq(2)
    await expect(
      registrationManager.connect(fakePnetworkHub).slash(sentinel1.address, 0, challenger.address, await time.latest())
    )
      .to.emit(registrationManager, 'BorrowingSentinelSlashed')
      .withArgs(sentinel1.address)
      .and.to.emit(governanceMessageEmitter, 'GovernanceMessage')

    expect(await registrationManager.slashesByEpochOf(1, sentinel1.address)).to.be.eq(3)
    expect(await lendingManager.borrowableAmountByEpoch(1)).to.be.eq(0)
    expect(await lendingManager.borrowableAmountByEpoch(2)).to.be.eq(0)
    expect(await lendingManager.borrowableAmountByEpoch(3)).to.be.eq(0)
    expect(await lendingManager.borrowableAmountByEpoch(4)).to.be.eq(0)

    await time.increase(ONE_HOUR_IN_S + 1)
    await expect(
      registrationManager.connect(fakePnetworkHub).slash(sentinel1.address, 0, challenger.address, await time.latest())
    )
      .to.emit(registrationManager, 'BorrowingSentinelSlashed')
      .withArgs(sentinel1.address)
      .and.to.emit(governanceMessageEmitter, 'GovernanceMessage')

    expect(await registrationManager.slashesByEpochOf(1, sentinel1.address)).to.be.eq(4)
    expect(await lendingManager.borrowableAmountByEpoch(1)).to.be.eq(0)
    expect(await lendingManager.borrowableAmountByEpoch(2)).to.be.eq(200000)
    expect(await lendingManager.borrowableAmountByEpoch(3)).to.be.eq(200000)
    expect(await lendingManager.borrowableAmountByEpoch(4)).to.be.eq(200000)

    signature = await getSentinelIdentity(pntHolder1.address, { actor: sentinel1, registrationManager })
    await expect(
      registrationManager.connect(pntHolder1).lightResume(signature, await getSignatureNonce(pntHolder1.address))
    ).to.be.revertedWithCustomError(registrationManager, 'NotResumable')

    registrationOf = await registrationManager.registrationOf(sentinel1.address)
    expect(registrationOf.startEpoch).to.be.eq(1)
    expect(registrationOf.endEpoch).to.be.eq(1)
  })

  it('should not be able to light-resume an hard-slashed staking sentinel', async () => {
    const stakeAmount = ethers.parseEther('200000')
    const slashAmount = ethers.parseEther('20000')
    const duration = EPOCH_DURATION * 5

    let signature = await getSentinelIdentity(pntHolder1.address, { actor: sentinel1, registrationManager })
    await pnt.connect(pntHolder1).approve(registrationManager.target, stakeAmount)
    await registrationManager
      .connect(pntHolder1)
      .updateSentinelRegistrationByStaking(
        pntHolder1.address,
        stakeAmount,
        duration,
        signature,
        await getSignatureNonce(pntHolder1.address)
      )
    await time.increase(EPOCH_DURATION)

    signature = await getSentinelIdentity(pntHolder1.address, { actor: sentinel1, registrationManager })
    await registrationManager
      .connect(fakePnetworkHub)
      .slash(sentinel1.address, slashAmount, challenger.address, await time.latest())
    await expect(
      registrationManager.connect(pntHolder1).lightResume(signature, await getSignatureNonce(pntHolder1.address))
    ).to.be.revertedWithCustomError(registrationManager, 'NotResumable')
  })

  it('should be able to light-slash a guardian, light-resume it, hard-slash it and then should not be able to light-resume it', async () => {
    //
    //   updateGuardianRegistration
    //
    //   |-----xxxxx|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|----------|----------|
    //   0          1          2          3          4          5          6          7          8
    //
    //
    //   slash for the 3 time in epoch 1
    //
    //   |----------|-----sssss|ssssssssss|ssssssssss|ssssssssss|----------|----------|----------|
    //   0          1          2          3          4          5          6          7          8
    //
    //
    //
    //   |----------|vvvvvvvvvv|----------|----------|----------|----------|----------|----------|
    //   0          1          2          3          4          5          6          7          8

    await registrationManager
      .connect(fakeDandelionVoting)
      .updateGuardianRegistration(guardianOwner1.address, 4, guardian1.address)
    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.eq(1)
    let registrationOf = await registrationManager.registrationOf(guardian1.address)
    expect(registrationOf.startEpoch).to.be.eq(0)
    expect(registrationOf.endEpoch).to.be.eq(3)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(0)).to.be.eq(1)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(1)).to.be.eq(1)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(2)).to.be.eq(1)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(3)).to.be.eq(1)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(4)).to.be.eq(0)
    const ts = await time.latest()
    await expect(registrationManager.connect(fakePnetworkHub).slash(guardian1.address, 0, challenger.address, ts))
      .to.emit(registrationManager, 'GuardianSlashed')
      .withArgs(guardian1.address)
      .and.to.emit(governanceMessageEmitter, 'GovernanceMessage')
    expect(await registrationManager.slashesByEpochOf(1, guardian1.address)).to.be.eq(1)

    await expect(
      registrationManager.connect(fakePnetworkHub).slash(guardian1.address, 0, challenger.address, ts)
    ).to.revertedWithCustomError(registrationManager, 'ActorAlreadySlashed')
    expect(await registrationManager.slashesByEpochOf(1, guardian1.address)).to.be.eq(1)

    await expect(
      registrationManager
        .connect(guardianOwner1)
        .lightResume(
          await getSentinelIdentity(guardianOwner1.address, { actor: guardian1, registrationManager }),
          await getSignatureNonce(guardianOwner1.address)
        )
    )
      .to.emit(registrationManager, 'LightResumed')
      .withArgs(guardian1.address, REGISTRATON_GUARDIAN)

    await expect(
      registrationManager.connect(fakePnetworkHub).slash(guardian1.address, 0, challenger.address, await time.latest())
    )
      .to.emit(registrationManager, 'GuardianSlashed')
      .withArgs(guardian1.address)
      .and.to.emit(governanceMessageEmitter, 'GovernanceMessage')
    expect(await registrationManager.slashesByEpochOf(1, guardian1.address)).to.be.eq(2)

    await time.increase(ONE_HOUR_IN_S + 1)
    await expect(
      registrationManager.connect(fakePnetworkHub).slash(guardian1.address, 0, challenger.address, await time.latest())
    )
      .to.emit(registrationManager, 'GuardianSlashed')
      .withArgs(guardian1.address)
      .and.to.emit(governanceMessageEmitter, 'GovernanceMessage')
    expect(await registrationManager.slashesByEpochOf(1, guardian1.address)).to.be.eq(3)

    await time.increase(ONE_HOUR_IN_S + 1)
    await expect(
      registrationManager.connect(fakePnetworkHub).slash(guardian1.address, 0, challenger.address, await time.latest())
    )
      .to.emit(registrationManager, 'GuardianSlashed')
      .withArgs(guardian1.address)
      .and.to.emit(governanceMessageEmitter, 'GovernanceMessage')
    expect(await registrationManager.slashesByEpochOf(1, guardian1.address)).to.be.eq(4)

    await expect(
      registrationManager
        .connect(guardianOwner1)
        .lightResume(
          await getSentinelIdentity(guardianOwner1.address, { actor: guardian1, registrationManager }),
          await getSignatureNonce(guardianOwner1.address)
        )
    ).to.be.revertedWithCustomError(registrationManager, 'NotResumable')

    registrationOf = await registrationManager.registrationOf(guardian1.address)
    expect(registrationOf.startEpoch).to.be.eq(0)
    expect(registrationOf.endEpoch).to.be.eq(1)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(0)).to.be.eq(1)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(1)).to.be.eq(1)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(2)).to.be.eq(0)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(3)).to.be.eq(0)
    expect(await registrationManager.totalNumberOfGuardiansByEpoch(4)).to.be.eq(0)
  })
})
