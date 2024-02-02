const { time } = require('@nomicfoundation/hardhat-network-helpers')
const { expect } = require('chai')
const { ethers, upgrades, config, network } = require('hardhat')

const {
  ACL_ADDRESS,
  DAO_ROOT_ADDRESS,
  EPOCH_DURATION,
  LEND_MAX_EPOCHS,
  MINIMUM_BORROWING_FEE,
  PNT_HOLDER_1_ADDRESS,
  PNT_HOLDER_2_ADDRESS,
  PNT_MAX_TOTAL_SUPPLY,
  TOKEN_MANAGER_ADDRESS
} = require('./constants')
const { getRole, getSentinelIdentity } = require('./utils')

// roles
const BORROW_ROLE = getRole('BORROW_ROLE')
const RELEASE_ROLE = getRole('RELEASE_ROLE')
const STAKE_ROLE = getRole('STAKE_ROLE')
const INCREASE_DURATION_ROLE = getRole('INCREASE_DURATION_ROLE')
const REDIRECT_CLAIM_TO_CHALLENGER_BY_EPOCH_ROLE = getRole('REDIRECT_CLAIM_TO_CHALLENGER_BY_EPOCH_ROLE')
const UPDATE_GUARDIAN_REGISTRATION_ROLE = getRole('UPDATE_GUARDIAN_REGISTRATION_ROLE')

let stakingManagerLM,
  stakingManagerRM,
  epochsManager,
  registrationManager,
  feesManager,
  lendingManager,
  acl,
  dandelionVoting,
  pnt,
  owner,
  pntHolder1,
  pntHolder2,
  sentinel1,
  sentinel2,
  sentinel3,
  FeesManager,
  sentinelBorrowerRegistrator1,
  sentinelBorrowerRegistrator2,
  daoRoot,
  fakeRegistrationManager,
  challenger,
  fakeDandelionVoting,
  fakeForwarder,
  guardian1,
  guardianOwner1,
  guardian2,
  guardianOwner2

describe('FeesManager', () => {
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
    const LendingManager = await ethers.getContractFactory('LendingManager')
    const EpochsManager = await ethers.getContractFactory('EpochsManager')
    const StakingManager = await ethers.getContractFactory('StakingManagerPermissioned')
    const TestToken = await ethers.getContractFactory('TestToken')
    const ACL = await ethers.getContractFactory('ACL')
    const MockDandelionVotingContract = await ethers.getContractFactory('MockDandelionVotingContract')

    const signers = await ethers.getSigners()
    owner = signers[0]
    sentinel1 = signers[1]
    sentinel2 = signers[2]
    sentinel3 = signers[3]
    fakeForwarder = signers[4]
    sentinelBorrowerRegistrator1 = signers[5]
    sentinelBorrowerRegistrator2 = signers[6]
    fakeRegistrationManager = signers[7]
    challenger = signers[8]
    fakeDandelionVoting = signers[9]
    guardian1 = signers[10]
    guardianOwner1 = signers[11]
    guardian2 = signers[12]
    guardianOwner2 = signers[13]
    pntHolder1 = await ethers.getImpersonatedSigner(PNT_HOLDER_1_ADDRESS)
    pntHolder2 = await ethers.getImpersonatedSigner(PNT_HOLDER_2_ADDRESS)
    daoRoot = await ethers.getImpersonatedSigner(DAO_ROOT_ADDRESS)

    pnt = await TestToken.deploy('PNT', 'PNT')
    acl = ACL.attach(ACL_ADDRESS)
    dandelionVoting = await MockDandelionVotingContract.deploy()
    await dandelionVoting.setTestStartDate(EPOCH_DURATION * 1000) // this is needed to don't break normal tests

    await pnt.connect(owner).transfer(pntHolder1.address, ethers.parseEther('1000000'))
    await pnt.connect(owner).transfer(pntHolder2.address, ethers.parseEther('1000000'))

    stakingManagerLM = await upgrades.deployProxy(
      StakingManager,
      [await pnt.getAddress(), TOKEN_MANAGER_ADDRESS, fakeForwarder.address, PNT_MAX_TOTAL_SUPPLY],
      {
        initializer: 'initialize',
        kind: 'uups'
      }
    )

    stakingManagerRM = await upgrades.deployProxy(
      StakingManager,
      [await pnt.getAddress(), TOKEN_MANAGER_ADDRESS, fakeForwarder.address, PNT_MAX_TOTAL_SUPPLY],
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
        await pnt.getAddress(),
        await stakingManagerLM.getAddress(),
        await epochsManager.getAddress(),
        fakeForwarder.address,
        await dandelionVoting.getAddress(),
        LEND_MAX_EPOCHS
      ],
      {
        initializer: 'initialize',
        kind: 'uups'
      }
    )

    registrationManager = await upgrades.deployProxy(
      RegistrationManager,
      [
        await pnt.getAddress(),
        await stakingManagerRM.getAddress(),
        await epochsManager.getAddress(),
        await lendingManager.getAddress(),
        fakeForwarder.address
      ],
      {
        initializer: 'initialize',
        kind: 'uups'
      }
    )

    feesManager = await upgrades.deployProxy(
      FeesManager,
      [
        await epochsManager.getAddress(),
        await lendingManager.getAddress(),
        await registrationManager.getAddress(),
        fakeForwarder.address,
        MINIMUM_BORROWING_FEE
      ],
      {
        initializer: 'initialize',
        kind: 'uups'
      }
    )

    // grant roles
    await lendingManager.grantRole(BORROW_ROLE, await registrationManager.getAddress())
    await lendingManager.grantRole(RELEASE_ROLE, await registrationManager.getAddress())
    await stakingManagerLM.grantRole(STAKE_ROLE, await lendingManager.getAddress())
    await stakingManagerLM.grantRole(INCREASE_DURATION_ROLE, await lendingManager.getAddress())
    await stakingManagerRM.grantRole(STAKE_ROLE, await registrationManager.getAddress())
    await stakingManagerRM.grantRole(INCREASE_DURATION_ROLE, await registrationManager.getAddress())
    await registrationManager.grantRole(UPDATE_GUARDIAN_REGISTRATION_ROLE, fakeDandelionVoting.address)
    await feesManager.grantRole(REDIRECT_CLAIM_TO_CHALLENGER_BY_EPOCH_ROLE, fakeRegistrationManager.address)
    await acl
      .connect(daoRoot)
      .grantPermission(await stakingManagerRM.getAddress(), TOKEN_MANAGER_ADDRESS, getRole('MINT_ROLE'))
    await acl
      .connect(daoRoot)
      .grantPermission(await stakingManagerRM.getAddress(), TOKEN_MANAGER_ADDRESS, getRole('BURN_ROLE'))
    await acl
      .connect(daoRoot)
      .grantPermission(await stakingManagerLM.getAddress(), TOKEN_MANAGER_ADDRESS, getRole('MINT_ROLE'))
    await acl
      .connect(daoRoot)
      .grantPermission(await stakingManagerLM.getAddress(), TOKEN_MANAGER_ADDRESS, getRole('BURN_ROLE'))

    await owner.sendTransaction({
      to: pntHolder1.address,
      value: ethers.parseEther('10')
    })
    await owner.sendTransaction({
      to: pntHolder2.address,
      value: ethers.parseEther('10')
    })
  })

  it('borrower should not be able to earn anything when utilization ratio is 100%', async () => {
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
    //   claim(1): utilizationRatio = 100%, totalStaked = 200k, totalBorrowed = 200k -> staking sentinels keep 50% (200k / 400k) and lenders
    //   keeps other 200k (other 50%). In this case borrowers don't earn anything
    //

    const stakeAmount = ethers.parseEther('200000')
    const duration = EPOCH_DURATION * 4

    const lendAmount = ethers.parseEther('200000')
    await pnt.connect(pntHolder1).approve(await lendingManager.getAddress(), lendAmount)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, lendAmount, EPOCH_DURATION * 10)

    const signature1 = await getSentinelIdentity(pntHolder2.address, { actor: sentinel1, registrationManager })
    await pnt.connect(pntHolder2).approve(await registrationManager.getAddress(), stakeAmount)
    await registrationManager
      .connect(pntHolder2)
      .updateSentinelRegistrationByStaking(pntHolder2.address, stakeAmount, duration, signature1, 0)

    const signature2 = await getSentinelIdentity(sentinelBorrowerRegistrator1.address, {
      actor: sentinel2,
      registrationManager
    })
    await registrationManager
      .connect(sentinelBorrowerRegistrator1)
      ['updateSentinelRegistrationByBorrowing(uint16,bytes,uint256)'](3, signature2, 0)

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(1)

    const fee = ethers.parseEther('100')
    await pnt.connect(pntHolder1).approve(await feesManager.getAddress(), fee)
    await feesManager.connect(pntHolder1).depositFee(await pnt.getAddress(), fee)

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    await expect(feesManager.claimFeeByEpoch(pntHolder2.address, await pnt.getAddress(), 1))
      .to.emit(feesManager, 'FeeClaimed')
      .withArgs(pntHolder2.address, sentinel1.address, 1, await pnt.getAddress(), fee / 2n)

    await expect(
      feesManager.claimFeeByEpoch(sentinelBorrowerRegistrator1.address, await pnt.getAddress(), 1)
    ).to.be.revertedWithCustomError(feesManager, 'NothingToClaim')

    await expect(lendingManager.connect(pntHolder1).claimRewardByEpoch(await pnt.getAddress(), 1))
      .to.emit(lendingManager, 'RewardClaimed')
      .withArgs(pntHolder1.address, await pnt.getAddress(), 1, fee / 2n)
  })

  it('lenders should not be able to earn anything when utilization ratio is 0%', async () => {
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
    //   claim(1): utilizationRatio = 100%, totalStaked = 200k, totalBorrowed = 0k -> staking sentinels keep 100% (200k / 200k) and lenders
    //

    const stakeAmount = ethers.parseEther('200000')
    const duration = EPOCH_DURATION * 4

    const lendAmount = ethers.parseEther('200000')
    await pnt.connect(pntHolder1).approve(await lendingManager.getAddress(), lendAmount)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, lendAmount, EPOCH_DURATION * 10)

    const signature1 = await getSentinelIdentity(pntHolder2.address, { actor: sentinel1, registrationManager })
    await pnt.connect(pntHolder2).approve(await registrationManager.getAddress(), stakeAmount)
    await registrationManager
      .connect(pntHolder2)
      .updateSentinelRegistrationByStaking(pntHolder2.address, stakeAmount, duration, signature1, 0)

    await time.increase(EPOCH_DURATION)

    const fee = ethers.parseEther('100')
    await pnt.connect(pntHolder1).approve(await feesManager.getAddress(), fee)
    await feesManager.connect(pntHolder1).depositFee(await pnt.getAddress(), fee)

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    await expect(feesManager.claimFeeByEpoch(pntHolder2.address, await pnt.getAddress(), 1))
      .to.emit(feesManager, 'FeeClaimed')
      .withArgs(pntHolder2.address, sentinel1.address, 1, await pnt.getAddress(), fee)

    await expect(
      lendingManager.connect(pntHolder1).claimRewardByEpoch(await pnt.getAddress(), 1)
    ).to.be.revertedWithCustomError(lendingManager, 'NothingToClaim')
  })

  it('lenders and borrowers should earn respectively 55% and 45% of the fees part splitted among lenders&borrowers and staking nodes when utilization ratio is 50%', async () => {
    //   pntHolder1 - lend
    //                   400k       400k       400k
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
    //   sentinelBorrowerRegistrator1 - updateSentinelRegistrationByBorrowing
    //
    //                  200k      200k      200k
    //   |----------|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|
    //   0          1          2          3          4          5
    //
    //
    //
    //   claim(1): utilizationRatio = 50%, totalStaked = 400k, totalBorrowed = 200k -> staking sentinels keep 50% (200k / 400k)
    //   k = 0.3 + (0.5^2) = 0.55 (55%) -> lenders 55% and borrowers 45%
    //

    const stakeAmount = ethers.parseEther('200000')
    const duration = EPOCH_DURATION * 4

    const lendAmount = ethers.parseEther('400000')
    await pnt.connect(pntHolder1).approve(await lendingManager.getAddress(), lendAmount)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, lendAmount, EPOCH_DURATION * 10)

    const signature1 = await getSentinelIdentity(pntHolder2.address, { actor: sentinel1, registrationManager })
    await pnt.connect(pntHolder2).approve(await registrationManager.getAddress(), stakeAmount)
    await registrationManager
      .connect(pntHolder2)
      .updateSentinelRegistrationByStaking(pntHolder2.address, stakeAmount, duration, signature1, 0)

    const signature2 = await getSentinelIdentity(sentinelBorrowerRegistrator1.address, {
      actor: sentinel2,
      registrationManager
    })
    await registrationManager
      .connect(sentinelBorrowerRegistrator1)
      ['updateSentinelRegistrationByBorrowing(uint16,bytes,uint256)'](3, signature2, 0)

    await time.increase(EPOCH_DURATION)

    const fee = ethers.parseEther('100')
    await pnt.connect(pntHolder1).approve(await feesManager.getAddress(), fee)
    await feesManager.connect(pntHolder1).depositFee(await pnt.getAddress(), fee)

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    await expect(feesManager.claimFeeByEpoch(pntHolder2.address, await pnt.getAddress(), 1))
      .to.emit(feesManager, 'FeeClaimed')
      .withArgs(pntHolder2.address, sentinel1.address, 1, await pnt.getAddress(), fee / 2n)

    await expect(feesManager.claimFeeByEpoch(sentinelBorrowerRegistrator1.address, await pnt.getAddress(), 1))
      .to.emit(feesManager, 'FeeClaimed')
      .withArgs(
        sentinelBorrowerRegistrator1.address,
        sentinel2.address,
        1,
        await pnt.getAddress(),
        ethers.parseEther('22.5')
      ) // (100 * 0.5) * 0.45

    await expect(lendingManager.connect(pntHolder1).claimRewardByEpoch(await pnt.getAddress(), 1))
      .to.emit(lendingManager, 'RewardClaimed')
      .withArgs(pntHolder1.address, await pnt.getAddress(), 1, ethers.parseEther('27.5')) // (100 * 0.5) * 0.55
  })

  it('borrowers and lenders should earn when utilization ration is 66%', async () => {
    //   pntHolder1 - lend
    //                   600k       600k      600k
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
    //   sentinelBorrowerRegistrator1 - updateSentinelRegistrationByBorrowing
    //
    //                  200k      200k      200k
    //   |----------|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|
    //   0          1          2          3          4          5
    //
    //
    //   sentinelBorrowerRegistrator2 - updateSentinelRegistrationByBorrowing
    //
    //                  200k      200k      200k
    //   |----------|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|
    //   0          1          2          3          4          5
    //
    //
    //
    //   claim(1): utilizationRatio = 66.6666%, totalStaked = 200k, totalBorrowed = 400k -> staking sentinels keep 33.3333% (200k / 600k)
    //   k = (400k / 600k)^2 + 0.3 = (0.6666)^2 + 0.3 = 0.4442 + 0.3 = 0.74444444 -> lenders 74.444444% and borrowers 25.555556%
    //

    const stakeAmount = ethers.parseEther('200000')
    const duration = EPOCH_DURATION * 4

    const lendAmount = ethers.parseEther('600000')
    await pnt.connect(pntHolder1).approve(await lendingManager.getAddress(), lendAmount)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, lendAmount, EPOCH_DURATION * 10)

    const signature1 = await getSentinelIdentity(pntHolder2.address, { actor: sentinel1, registrationManager })
    await pnt.connect(pntHolder2).approve(await registrationManager.getAddress(), stakeAmount)
    await registrationManager
      .connect(pntHolder2)
      .updateSentinelRegistrationByStaking(pntHolder2.address, stakeAmount, duration, signature1, 0)

    const signature2 = await getSentinelIdentity(sentinelBorrowerRegistrator1.address, {
      actor: sentinel2,
      registrationManager
    })
    await registrationManager
      .connect(sentinelBorrowerRegistrator1)
      ['updateSentinelRegistrationByBorrowing(uint16,bytes,uint256)'](3, signature2, 0)

    const signature3 = await getSentinelIdentity(sentinelBorrowerRegistrator2.address, {
      actor: sentinel3,
      registrationManager
    })
    await registrationManager
      .connect(sentinelBorrowerRegistrator2)
      ['updateSentinelRegistrationByBorrowing(uint16,bytes,uint256)'](3, signature3, 0)

    await time.increase(EPOCH_DURATION)

    const fee = ethers.parseEther('100')
    await pnt.connect(pntHolder1).approve(await feesManager.getAddress(), fee)
    await feesManager.connect(pntHolder1).depositFee(await pnt.getAddress(), fee)

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    await expect(feesManager.claimFeeByEpoch(pntHolder2.address, await pnt.getAddress(), 1))
      .to.emit(feesManager, 'FeeClaimed')
      .withArgs(
        pntHolder2.address,
        sentinel1.address,
        1,
        await pnt.getAddress(),
        ethers.parseEther('33.333333333333333333')
      )

    await expect(feesManager.claimFeeByEpoch(sentinelBorrowerRegistrator1.address, await pnt.getAddress(), 1))
      .to.emit(feesManager, 'FeeClaimed')
      .withArgs(
        sentinelBorrowerRegistrator1.address,
        sentinel2.address,
        1,
        await pnt.getAddress(),
        ethers.parseEther('8.518566666666666667')
      ) // ~(100 * 0.6666 * 0.2555555) / 2

    await expect(
      feesManager
        .connect(sentinelBorrowerRegistrator2)
        .claimFeeByEpoch(sentinelBorrowerRegistrator2.address, await pnt.getAddress(), 1)
    )
      .to.emit(feesManager, 'FeeClaimed')
      .withArgs(
        sentinelBorrowerRegistrator2.address,
        sentinel3.address,
        1,
        await pnt.getAddress(),
        ethers.parseEther('8.518566666666666667')
      ) // ~(100 * 0.6666 * 0.2555555) / 2

    await expect(lendingManager.connect(pntHolder1).claimRewardByEpoch(await pnt.getAddress(), 1))
      .to.emit(lendingManager, 'RewardClaimed')
      .withArgs(pntHolder1.address, await pnt.getAddress(), 1, ethers.parseEther('49.629533333333333333')) // ~(100 * 0.6666 * 0.74444444)
  })

  it('should not be able to claim the fee twice in the same epoch', async () => {
    const stakeAmount = ethers.parseEther('200000')
    const duration = EPOCH_DURATION * 4

    const signature1 = await getSentinelIdentity(pntHolder2.address, { actor: sentinel1, registrationManager })
    await pnt.connect(pntHolder2).approve(await registrationManager.getAddress(), stakeAmount)
    await registrationManager
      .connect(pntHolder2)
      .updateSentinelRegistrationByStaking(pntHolder2.address, stakeAmount, duration, signature1, 0)

    await time.increase(EPOCH_DURATION)

    const fee = ethers.parseEther('100')
    await pnt.connect(pntHolder1).approve(await feesManager.getAddress(), fee)
    await feesManager.connect(pntHolder1).depositFee(await pnt.getAddress(), fee)

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    await expect(feesManager.claimFeeByEpoch(pntHolder2.address, await pnt.getAddress(), 1))
      .to.emit(feesManager, 'FeeClaimed')
      .withArgs(pntHolder2.address, sentinel1.address, 1, await pnt.getAddress(), fee)

    await expect(
      feesManager.claimFeeByEpoch(pntHolder2.address, await pnt.getAddress(), 1)
    ).to.be.revertedWithCustomError(feesManager, 'NothingToClaim')
  })

  it('should not be able to claim the fee in the current or the next epoch', async () => {
    const stakeAmount = ethers.parseEther('200000')
    const duration = EPOCH_DURATION * 4

    const signature1 = await getSentinelIdentity(pntHolder2.address, { actor: sentinel1, registrationManager })
    await pnt.connect(pntHolder2).approve(await registrationManager.getAddress(), stakeAmount)
    await registrationManager
      .connect(pntHolder2)
      .updateSentinelRegistrationByStaking(pntHolder2.address, stakeAmount, duration, signature1, 0)

    await time.increase(EPOCH_DURATION)

    const fee = ethers.parseEther('100')
    await pnt.connect(pntHolder1).approve(await feesManager.getAddress(), fee)
    await feesManager.connect(pntHolder1).depositFee(await pnt.getAddress(), fee)

    await expect(
      feesManager.claimFeeByEpoch(pntHolder2.address, await pnt.getAddress(), 1)
    ).to.be.revertedWithCustomError(feesManager, 'InvalidEpoch')
    await expect(
      feesManager.claimFeeByEpoch(pntHolder2.address, await pnt.getAddress(), 2)
    ).to.be.revertedWithCustomError(feesManager, 'InvalidEpoch')
  })

  it('should not be able to claim the fee twice in the same epoch by using the claim for many epochs (1)', async () => {
    const stakeAmount = ethers.parseEther('200000')
    const duration = EPOCH_DURATION * 4

    const signature1 = await getSentinelIdentity(pntHolder2.address, { actor: sentinel1, registrationManager })
    await pnt.connect(pntHolder2).approve(await registrationManager.getAddress(), stakeAmount)
    await registrationManager
      .connect(pntHolder2)
      .updateSentinelRegistrationByStaking(pntHolder2.address, stakeAmount, duration, signature1, 0)

    await time.increase(EPOCH_DURATION)

    const fee = ethers.parseEther('100')
    await pnt.connect(pntHolder1).approve(await feesManager.getAddress(), fee)
    await feesManager.connect(pntHolder1).depositFee(await pnt.getAddress(), fee)

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    await expect(feesManager.claimFeeByEpoch(pntHolder2.address, await pnt.getAddress(), 1))
      .to.emit(feesManager, 'FeeClaimed')
      .withArgs(pntHolder2.address, sentinel1.address, 1, await pnt.getAddress(), fee)

    await expect(
      feesManager.connect(pntHolder2).claimFeeByEpochsRange(pntHolder2.address, await pnt.getAddress(), 1, 1)
    ).to.be.revertedWithCustomError(feesManager, 'NothingToClaim')
  })

  it('should not be able to claim the fee twice in the same epoch by using the claim for many epochs (2)', async () => {
    const stakeAmount = ethers.parseEther('200000')
    const duration = EPOCH_DURATION * 4

    const signature1 = await getSentinelIdentity(pntHolder2.address, { actor: sentinel1, registrationManager })
    await pnt.connect(pntHolder2).approve(await registrationManager.getAddress(), stakeAmount)
    await registrationManager
      .connect(pntHolder2)
      .updateSentinelRegistrationByStaking(pntHolder2.address, stakeAmount, duration, signature1, 0)

    await time.increase(EPOCH_DURATION)

    const fee = ethers.parseEther('100')
    await pnt.connect(pntHolder1).approve(await feesManager.getAddress(), fee)
    await feesManager.connect(pntHolder1).depositFee(await pnt.getAddress(), fee)

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    await pnt.connect(pntHolder1).approve(await feesManager.getAddress(), fee)
    await feesManager.connect(pntHolder1).depositFee(await pnt.getAddress(), fee)

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(3)

    await expect(feesManager.claimFeeByEpochsRange(pntHolder2.address, await pnt.getAddress(), 1, 2))
      .to.emit(feesManager, 'FeeClaimed')
      .withArgs(pntHolder2.address, sentinel1.address, 1, await pnt.getAddress(), fee)
      .and.to.emit(feesManager, 'FeeClaimed')
      .withArgs(pntHolder2.address, sentinel1.address, 2, await pnt.getAddress(), fee)

    await expect(
      feesManager.claimFeeByEpochsRange(pntHolder2.address, await pnt.getAddress(), 1, 2)
    ).to.be.revertedWithCustomError(feesManager, 'NothingToClaim')
  })

  it('should not be able to claim many epochs using an end epoch grater than the current one', async () => {
    await time.increase(EPOCH_DURATION)
    await expect(
      feesManager.claimFeeByEpochsRange(pntHolder1.address, await pnt.getAddress(), 1, 2)
    ).to.be.revertedWithCustomError(lendingManager, 'InvalidEpoch')
  })

  it('borrower should not be able to earn anything if slashed', async () => {
    //   pntHolder1 - lend
    //                   400k       400k       400k
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
    //   sentinelBorrowerRegistrator1 - updateSentinelRegistrationByBorrowing
    //
    //                  200k      200k      200k
    //   |----------|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|
    //   0          1          2          3          4          5
    //
    //
    //
    //   claim(1): utilizationRatio = 50%, totalStaked = 400k, totalBorrowed = 200k -> staking sentinels keep 50% (200k / 400k)
    //   k = 0.3 + (0.5^2) = 0.55 (55%) -> lenders 55% and borrowers 45%
    //

    const stakeAmount = ethers.parseEther('200000')
    const duration = EPOCH_DURATION * 4

    const lendAmount = ethers.parseEther('400000')
    await pnt.connect(pntHolder1).approve(await lendingManager.getAddress(), lendAmount)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, lendAmount, EPOCH_DURATION * 10)

    const signature1 = await getSentinelIdentity(pntHolder2.address, { actor: sentinel1, registrationManager })
    await pnt.connect(pntHolder2).approve(await registrationManager.getAddress(), stakeAmount)
    await registrationManager
      .connect(pntHolder2)
      .updateSentinelRegistrationByStaking(pntHolder2.address, stakeAmount, duration, signature1, 0)

    const signature2 = await getSentinelIdentity(sentinelBorrowerRegistrator1.address, {
      actor: sentinel2,
      registrationManager
    })
    await registrationManager
      .connect(sentinelBorrowerRegistrator1)
      ['updateSentinelRegistrationByBorrowing(uint16,bytes,uint256)'](3, signature2, 0)

    await time.increase(EPOCH_DURATION)

    const fee = ethers.parseEther('100')
    await pnt.connect(pntHolder1).approve(await feesManager.getAddress(), fee)
    await feesManager.connect(pntHolder1).depositFee(await pnt.getAddress(), fee)

    // NOTE: slashing happens
    await expect(
      feesManager
        .connect(fakeRegistrationManager)
        .redirectClaimToChallengerByEpoch(sentinel2.address, challenger.address, 1)
    )
      .to.emit(feesManager, 'ClaimRedirectedToChallenger')
      .withArgs(sentinel2.address, challenger.address, 1)

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    await expect(feesManager.claimFeeByEpoch(pntHolder2.address, await pnt.getAddress(), 1))
      .to.emit(feesManager, 'FeeClaimed')
      .withArgs(pntHolder2.address, sentinel1.address, 1, await pnt.getAddress(), fee / 2n)

    // NOTE: even if the claim is made by sentinelBorrowerRegistrator1, the fees will be sent to the challenger
    await expect(feesManager.claimFeeByEpoch(sentinelBorrowerRegistrator1.address, await pnt.getAddress(), 1))
      .to.emit(feesManager, 'FeeClaimed')
      .withArgs(challenger.address, sentinel2.address, 1, await pnt.getAddress(), ethers.parseEther('22.5')) // (100 * 0.5) * 0.45
  })

  it('borrowers and lenders and guardians should earn when utilization ration is 66%', async () => {
    //   pntHolder1 - lend
    //                   600k       600k      600k
    //   |-----xxxxx|vvvvvvvvvv-|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3           4          5
    //
    //
    //   pntHolder2 - updateSentinelRegistrationByStaking
    //                   200k       200k        200k
    //   |-----xxxxx|vvvvvvvvvv-|vvvvvvvvvv|vvvvvvvvvv|xxxxx-----|
    //   0          1          2          3           4          5
    //
    //
    //   guardian1 - updateGuardianRegistration
    //
    //   |----------|vvvvvvvvvv-|vvvvvvvvvv|vvvvvvvvvv|----------|
    //   0          1          2          3           4          5
    //
    //
    //   guardian2 - updateGuardianRegistration
    //
    //   |----------|vvvvvvvvvv-|vvvvvvvvvv|vvvvvvvvvv|----------|
    //   0          1          2          3           4          5
    //
    //
    //   sentinelBorrowerRegistrator1 - updateSentinelRegistrationByBorrowing
    //
    //                  200k      200k      200k
    //   |----------|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|
    //   0          1          2          3          4          5
    //
    //
    //   sentinelBorrowerRegistrator2 - updateSentinelRegistrationByBorrowing
    //
    //                  200k      200k      200k
    //   |----------|vvvvvvvvvv|vvvvvvvvvv|vvvvvvvvvv|----------|
    //   0          1          2          3          4          5
    //
    //
    //
    //   claim(1): utilizationRatio = 66.6666%, totalStaked = 200k, totalBorrowed = 400k, totalGuardians = 20k (2 * 10k)
    //          -> staking sentinels keep 32.2% (200k / 620k)
    //          -> guardians keep 3.2% (20k / 620k)
    //          -> borrowers and lenders keep  100 - 32.3 - 3.2 = 64.5%
    //
    //   k = (400k / 600k)^2 + 0.3 = (0.6666)^2 + 0.3 = 0.4442 + 0.3 = 0.74444444 -> lenders 74.444444% and borrowers 25.555556%
    //
    //

    const stakeAmount = ethers.parseEther('200000')
    const duration = EPOCH_DURATION * 4

    const lendAmount = ethers.parseEther('600000')
    await pnt.connect(pntHolder1).approve(await lendingManager.getAddress(), lendAmount)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, lendAmount, EPOCH_DURATION * 10)

    const signature1 = await getSentinelIdentity(pntHolder2.address, { actor: sentinel1, registrationManager })
    await pnt.connect(pntHolder2).approve(await registrationManager.getAddress(), stakeAmount)
    await registrationManager
      .connect(pntHolder2)
      .updateSentinelRegistrationByStaking(pntHolder2.address, stakeAmount, duration, signature1, 0)

    const signature2 = await getSentinelIdentity(sentinelBorrowerRegistrator1.address, {
      actor: sentinel2,
      registrationManager
    })
    await registrationManager
      .connect(sentinelBorrowerRegistrator1)
      ['updateSentinelRegistrationByBorrowing(uint16,bytes,uint256)'](3, signature2, 0)

    const signature3 = await getSentinelIdentity(sentinelBorrowerRegistrator2.address, {
      actor: sentinel3,
      registrationManager
    })
    await registrationManager
      .connect(sentinelBorrowerRegistrator2)
      ['updateSentinelRegistrationByBorrowing(uint16,bytes,uint256)'](3, signature3, 0)

    await registrationManager
      .connect(fakeDandelionVoting)
      .updateGuardianRegistration(guardianOwner1.address, 3, guardian1.address)
    await registrationManager
      .connect(fakeDandelionVoting)
      .updateGuardianRegistration(guardianOwner2.address, 3, guardian2.address)

    await time.increase(EPOCH_DURATION)

    const fee = ethers.parseEther('100')
    await pnt.connect(pntHolder1).approve(await feesManager.getAddress(), fee)
    await feesManager.connect(pntHolder1).depositFee(await pnt.getAddress(), fee)

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    await expect(feesManager.claimFeeByEpoch(pntHolder2.address, await pnt.getAddress(), 1))
      .to.emit(feesManager, 'FeeClaimed')
      .withArgs(
        pntHolder2.address,
        sentinel1.address,
        1,
        await pnt.getAddress(),
        ethers.parseEther('32.258064516129032258')
      )

    await expect(feesManager.claimFeeByEpoch(sentinelBorrowerRegistrator1.address, await pnt.getAddress(), 1))
      .to.emit(feesManager, 'FeeClaimed')
      .withArgs(
        sentinelBorrowerRegistrator1.address,
        sentinel2.address,
        1,
        await pnt.getAddress(),
        ethers.parseEther('8.243774193548387097')
      ) // ~(100 * 0.645 * 0.2555555) / 2

    await expect(
      feesManager
        .connect(sentinelBorrowerRegistrator2)
        .claimFeeByEpoch(sentinelBorrowerRegistrator2.address, await pnt.getAddress(), 1)
    )
      .to.emit(feesManager, 'FeeClaimed')
      .withArgs(
        sentinelBorrowerRegistrator2.address,
        sentinel3.address,
        1,
        await pnt.getAddress(),
        ethers.parseEther('8.243774193548387097')
      ) // ~(100 * 0.645 * 0.2555555) / 2

    await expect(lendingManager.connect(pntHolder1).claimRewardByEpoch(await pnt.getAddress(), 1))
      .to.emit(lendingManager, 'RewardClaimed')
      .withArgs(pntHolder1.address, await pnt.getAddress(), 1, ethers.parseEther('48.028580645161290323')) // ~(100 * 0.645 * 0.74444444)

    await expect(feesManager.claimFeeByEpoch(guardianOwner1.address, await pnt.getAddress(), 1))
      .to.emit(feesManager, 'FeeClaimed')
      .withArgs(
        guardianOwner1.address,
        guardian1.address,
        1,
        await pnt.getAddress(),
        ethers.parseEther('1.612903225806451612')
      ) // ~(100 * 0.032) / 2

    await expect(feesManager.claimFeeByEpoch(guardianOwner2.address, await pnt.getAddress(), 1))
      .to.emit(feesManager, 'FeeClaimed')
      .withArgs(
        guardianOwner2.address,
        guardian2.address,
        1,
        await pnt.getAddress(),
        ethers.parseEther('1.612903225806451612')
      ) // ~(100 * 0.032) / 2
  })

  it('should earn only guardians', async () => {
    //   guardian1 - updateGuardianRegistration
    //
    //   |----------|vvvvvvvvvv-|vvvvvvvvvv|vvvvvvvvvv|----------|
    //   0          1          2          3           4          5
    //
    //
    //   guardian2 - updateGuardianRegistration
    //
    //   |----------|vvvvvvvvvv-|vvvvvvvvvv|vvvvvvvvvv|----------|
    //   0          1          2          3           4          5
    //
    //
    //

    await registrationManager
      .connect(fakeDandelionVoting)
      .updateGuardianRegistration(guardianOwner1.address, 3, guardian1.address)
    await registrationManager
      .connect(fakeDandelionVoting)
      .updateGuardianRegistration(guardianOwner2.address, 3, guardian2.address)

    await time.increase(EPOCH_DURATION)

    const fee = ethers.parseEther('100')
    await pnt.connect(pntHolder1).approve(await feesManager.getAddress(), fee)
    await feesManager.connect(pntHolder1).depositFee(await pnt.getAddress(), fee)

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)

    await expect(feesManager.claimFeeByEpoch(guardianOwner1.address, await pnt.getAddress(), 1))
      .to.emit(feesManager, 'FeeClaimed')
      .withArgs(guardianOwner1.address, guardian1.address, 1, await pnt.getAddress(), ethers.parseEther('50')) // 100 / 2

    await expect(feesManager.claimFeeByEpoch(guardianOwner2.address, await pnt.getAddress(), 1))
      .to.emit(feesManager, 'FeeClaimed')
      .withArgs(guardianOwner2.address, guardian2.address, 1, await pnt.getAddress(), ethers.parseEther('50')) // 100 / 2
  })
})
