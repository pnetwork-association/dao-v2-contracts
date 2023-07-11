const { expect } = require('chai')
const { ethers, upgrades, config } = require('hardhat')
const { time } = require('@nomicfoundation/hardhat-network-helpers')
const { getRole, getSentinelIdentity } = require('./utils')

const {
  ACL_ADDRESS,
  DAO_ROOT_ADDRESS,
  EPOCH_DURATION,
  LEND_MAX_EPOCHS,
  MINIMUM_BORROWING_FEE,
  PBTC_ADDRESS,
  PNT_ADDRESS,
  PNT_HOLDER_1_ADDRESS,
  PNT_HOLDER_2_ADDRESS,
  PNT_MAX_TOTAL_SUPPLY,
  TOKEN_MANAGER_ADDRESS
} = require('./constants')

let stakingManagerLM,
  stakingManagerRM,
  epochsManager,
  registrationManager,
  feesManager,
  lendingManager,
  pnt,
  owner,
  pntHolder1,
  sentinel1,
  sentinel2,
  sentinel3,
  FeesManager,
  sentinelBorrowerRegistrator1,
  sentinelBorrowerRegistrator2,
  daoRoot

let BORROW_ROLE, RELEASE_SENTINEL_ROLE

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
    const ERC20 = await ethers.getContractFactory('ERC20')
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
    pntHolder1 = await ethers.getImpersonatedSigner(PNT_HOLDER_1_ADDRESS)
    pntHolder2 = await ethers.getImpersonatedSigner(PNT_HOLDER_2_ADDRESS)
    daoRoot = await ethers.getImpersonatedSigner(DAO_ROOT_ADDRESS)

    pnt = await ERC20.attach(PNT_ADDRESS)
    pbtc = await ERC20.attach(PBTC_ADDRESS)
    acl = await ACL.attach(ACL_ADDRESS)
    dandelionVoting = await MockDandelionVotingContract.deploy()
    await dandelionVoting.setTestStartDate(EPOCH_DURATION * 1000) // this is needed to don't break normal tests

    stakingManagerLM = await upgrades.deployProxy(StakingManager, [PNT_ADDRESS, TOKEN_MANAGER_ADDRESS, fakeForwarder.address, PNT_MAX_TOTAL_SUPPLY], {
      initializer: 'initialize',
      kind: 'uups'
    })

    stakingManagerRM = await upgrades.deployProxy(StakingManager, [PNT_ADDRESS, TOKEN_MANAGER_ADDRESS, fakeForwarder.address, PNT_MAX_TOTAL_SUPPLY], {
      initializer: 'initialize',
      kind: 'uups'
    })

    epochsManager = await upgrades.deployProxy(EpochsManager, [EPOCH_DURATION], {
      initializer: 'initialize',
      kind: 'uups'
    })

    lendingManager = await upgrades.deployProxy(
      LendingManager,
      [pnt.address, stakingManagerLM.address, epochsManager.address, fakeForwarder.address, dandelionVoting.address, LEND_MAX_EPOCHS],
      {
        initializer: 'initialize',
        kind: 'uups'
      }
    )

    registrationManager = await upgrades.deployProxy(
      RegistrationManager,
      [pnt.address, stakingManagerRM.address, epochsManager.address, lendingManager.address, fakeForwarder.address],
      {
        initializer: 'initialize',
        kind: 'uups'
      }
    )

    feesManager = await upgrades.deployProxy(
      FeesManager,
      [epochsManager.address, lendingManager.address, registrationManager.address, fakeForwarder.address, MINIMUM_BORROWING_FEE],
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

    // grant roles
    await lendingManager.grantRole(BORROW_ROLE, registrationManager.address)
    await lendingManager.grantRole(RELEASE_ROLE, registrationManager.address)
    await registrationManager.grantRole(RELEASE_SENTINEL_ROLE, owner.address)
    await stakingManagerLM.grantRole(STAKE_ROLE, lendingManager.address)
    await stakingManagerLM.grantRole(INCREASE_DURATION_ROLE, lendingManager.address)
    await stakingManagerRM.grantRole(STAKE_ROLE, registrationManager.address)
    await stakingManagerRM.grantRole(INCREASE_DURATION_ROLE, registrationManager.address)
    await registrationManager.grantRole(RELEASE_SENTINEL_ROLE, owner.address)
    await acl.connect(daoRoot).grantPermission(stakingManagerRM.address, TOKEN_MANAGER_ADDRESS, getRole('MINT_ROLE'))
    await acl.connect(daoRoot).grantPermission(stakingManagerRM.address, TOKEN_MANAGER_ADDRESS, getRole('BURN_ROLE'))
    await acl.connect(daoRoot).grantPermission(stakingManagerLM.address, TOKEN_MANAGER_ADDRESS, getRole('MINT_ROLE'))
    await acl.connect(daoRoot).grantPermission(stakingManagerLM.address, TOKEN_MANAGER_ADDRESS, getRole('BURN_ROLE'))

    await owner.sendTransaction({
      to: pntHolder1.address,
      value: ethers.utils.parseEther('10')
    })
    await owner.sendTransaction({
      to: pntHolder2.address,
      value: ethers.utils.parseEther('10')
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

    const stakeAmount = ethers.utils.parseEther('200000')
    const duration = EPOCH_DURATION * 4

    const lendAmount = ethers.utils.parseEther('200000')
    await pnt.connect(pntHolder1).approve(lendingManager.address, lendAmount)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, lendAmount, EPOCH_DURATION * 10)

    const signature1 = await getSentinelIdentity(pntHolder2.address, { sentinel: sentinel1 })
    await pnt.connect(pntHolder2).approve(registrationManager.address, stakeAmount)
    await registrationManager.connect(pntHolder2).updateSentinelRegistrationByStaking(pntHolder2.address, stakeAmount, duration, signature1)

    const signature2 = await getSentinelIdentity(sentinelBorrowerRegistrator1.address, { sentinel: sentinel2 })
    await registrationManager.connect(sentinelBorrowerRegistrator1)['updateSentinelRegistrationByBorrowing(uint16,bytes)'](3, signature2)

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)
    const fee = ethers.utils.parseEther('100')
    await pnt.connect(pntHolder1).approve(feesManager.address, fee)
    await feesManager.connect(pntHolder1).depositFeeForPreviousEpoch(pnt.address, fee)

    await expect(feesManager.connect(pntHolder2).claimFeeByEpoch(pnt.address, 1))
      .to.emit(feesManager, 'FeeClaimed')
      .withArgs(pntHolder2.address, sentinel1.address, 1, pnt.address, fee.div(2))

    await expect(feesManager.connect(sentinelBorrowerRegistrator1).claimFeeByEpoch(pnt.address, 1)).to.be.revertedWithCustomError(
      feesManager,
      'NothingToClaim'
    )

    await expect(lendingManager.connect(pntHolder1).claimRewardByEpoch(pnt.address, 1))
      .to.emit(lendingManager, 'RewardClaimed')
      .withArgs(pntHolder1.address, pnt.address, 1, fee.div(2))
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

    const stakeAmount = ethers.utils.parseEther('200000')
    const duration = EPOCH_DURATION * 4

    const lendAmount = ethers.utils.parseEther('200000')
    await pnt.connect(pntHolder1).approve(lendingManager.address, lendAmount)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, lendAmount, EPOCH_DURATION * 10)

    const signature1 = await getSentinelIdentity(pntHolder2.address, { sentinel: sentinel1 })
    await pnt.connect(pntHolder2).approve(registrationManager.address, stakeAmount)
    await registrationManager.connect(pntHolder2).updateSentinelRegistrationByStaking(pntHolder2.address, stakeAmount, duration, signature1)

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)
    const fee = ethers.utils.parseEther('100')
    await pnt.connect(pntHolder1).approve(feesManager.address, fee)
    await feesManager.connect(pntHolder1).depositFeeForPreviousEpoch(pnt.address, fee)

    await expect(feesManager.connect(pntHolder2).claimFeeByEpoch(pnt.address, 1))
      .to.emit(feesManager, 'FeeClaimed')
      .withArgs(pntHolder2.address, sentinel1.address, 1, pnt.address, fee)

    await expect(lendingManager.connect(pntHolder1).claimRewardByEpoch(pnt.address, 1)).to.be.revertedWithCustomError(
      lendingManager,
      'NothingToClaim'
    )
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

    const stakeAmount = ethers.utils.parseEther('200000')
    const duration = EPOCH_DURATION * 4

    const lendAmount = ethers.utils.parseEther('400000')
    await pnt.connect(pntHolder1).approve(lendingManager.address, lendAmount)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, lendAmount, EPOCH_DURATION * 10)

    const signature1 = await getSentinelIdentity(pntHolder2.address, { sentinel: sentinel1 })
    await pnt.connect(pntHolder2).approve(registrationManager.address, stakeAmount)
    await registrationManager.connect(pntHolder2).updateSentinelRegistrationByStaking(pntHolder2.address, stakeAmount, duration, signature1)

    const signature2 = await getSentinelIdentity(sentinelBorrowerRegistrator1.address, { sentinel: sentinel2 })
    await registrationManager.connect(sentinelBorrowerRegistrator1)['updateSentinelRegistrationByBorrowing(uint16,bytes)'](3, signature2)

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)
    const fee = ethers.utils.parseEther('100')
    await pnt.connect(pntHolder1).approve(feesManager.address, fee)
    await feesManager.connect(pntHolder1).depositFeeForPreviousEpoch(pnt.address, fee)

    await expect(feesManager.connect(pntHolder2).claimFeeByEpoch(pnt.address, 1))
      .to.emit(feesManager, 'FeeClaimed')
      .withArgs(pntHolder2.address, sentinel1.address, 1, pnt.address, fee.div(2))

    await expect(feesManager.connect(sentinelBorrowerRegistrator1).claimFeeByEpoch(pnt.address, 1))
      .to.emit(feesManager, 'FeeClaimed')
      .withArgs(sentinelBorrowerRegistrator1.address, sentinel2.address, 1, pnt.address, ethers.utils.parseEther('22.5')) // (100 * 0.5) * 0.45

    await expect(lendingManager.connect(pntHolder1).claimRewardByEpoch(pnt.address, 1))
      .to.emit(lendingManager, 'RewardClaimed')
      .withArgs(pntHolder1.address, pnt.address, 1, ethers.utils.parseEther('27.5')) // (100 * 0.5) * 0.55
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

    const stakeAmount = ethers.utils.parseEther('200000')
    const duration = EPOCH_DURATION * 4

    const lendAmount = ethers.utils.parseEther('600000')
    await pnt.connect(pntHolder1).approve(lendingManager.address, lendAmount)
    await lendingManager.connect(pntHolder1).lend(pntHolder1.address, lendAmount, EPOCH_DURATION * 10)

    const signature1 = await getSentinelIdentity(pntHolder2.address, { sentinel: sentinel1 })
    await pnt.connect(pntHolder2).approve(registrationManager.address, stakeAmount)
    await registrationManager.connect(pntHolder2).updateSentinelRegistrationByStaking(pntHolder2.address, stakeAmount, duration, signature1)

    const signature2 = await getSentinelIdentity(sentinelBorrowerRegistrator1.address, { sentinel: sentinel2 })
    await registrationManager.connect(sentinelBorrowerRegistrator1)['updateSentinelRegistrationByBorrowing(uint16,bytes)'](3, signature2)

    const signature3 = await getSentinelIdentity(sentinelBorrowerRegistrator2.address, { sentinel: sentinel3 })
    await registrationManager.connect(sentinelBorrowerRegistrator2)['updateSentinelRegistrationByBorrowing(uint16,bytes)'](3, signature3)

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)
    const fee = ethers.utils.parseEther('100')
    await pnt.connect(pntHolder1).approve(feesManager.address, fee)
    await feesManager.connect(pntHolder1).depositFeeForPreviousEpoch(pnt.address, fee)

    await expect(feesManager.connect(pntHolder2).claimFeeByEpoch(pnt.address, 1))
      .to.emit(feesManager, 'FeeClaimed')
      .withArgs(pntHolder2.address, sentinel1.address, 1, pnt.address, ethers.utils.parseEther('33.333333333333333333'))

    await expect(feesManager.connect(sentinelBorrowerRegistrator1).claimFeeByEpoch(pnt.address, 1))
      .to.emit(feesManager, 'FeeClaimed')
      .withArgs(sentinelBorrowerRegistrator1.address, sentinel2.address, 1, pnt.address, ethers.utils.parseEther('8.518566666666666667')) // more or less (100 * 0.6666 * 0.2555555) / 2

    await expect(feesManager.connect(sentinelBorrowerRegistrator2).claimFeeByEpoch(pnt.address, 1))
      .to.emit(feesManager, 'FeeClaimed')
      .withArgs(sentinelBorrowerRegistrator2.address, sentinel3.address, 1, pnt.address, ethers.utils.parseEther('8.518566666666666667')) // more or less (100 * 0.6666 * 0.2555555) / 2

    await expect(lendingManager.connect(pntHolder1).claimRewardByEpoch(pnt.address, 1))
      .to.emit(lendingManager, 'RewardClaimed')
      .withArgs(pntHolder1.address, pnt.address, 1, ethers.utils.parseEther('49.629533333333333333')) // more or less (100 * 0.6666 * 0.74444444)
  })

  it('should not be able to claim the fee twice in the same epoch', async () => {
    const stakeAmount = ethers.utils.parseEther('200000')
    const duration = EPOCH_DURATION * 4

    const signature1 = await getSentinelIdentity(pntHolder2.address, { sentinel: sentinel1 })
    await pnt.connect(pntHolder2).approve(registrationManager.address, stakeAmount)
    await registrationManager.connect(pntHolder2).updateSentinelRegistrationByStaking(pntHolder2.address, stakeAmount, duration, signature1)

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)
    const fee = ethers.utils.parseEther('100')
    await pnt.connect(pntHolder1).approve(feesManager.address, fee)
    await feesManager.connect(pntHolder1).depositFeeForPreviousEpoch(pnt.address, fee)

    await expect(feesManager.connect(pntHolder2).claimFeeByEpoch(pnt.address, 1))
      .to.emit(feesManager, 'FeeClaimed')
      .withArgs(pntHolder2.address, sentinel1.address, 1, pnt.address, fee)

    await expect(feesManager.connect(pntHolder2).claimFeeByEpoch(pnt.address, 1)).to.be.revertedWithCustomError(feesManager, 'NothingToClaim')
  })

  it('should not be able to claim the fee in the current or the next epoch', async () => {
    const stakeAmount = ethers.utils.parseEther('200000')
    const duration = EPOCH_DURATION * 4

    const signature1 = await getSentinelIdentity(pntHolder2.address, { sentinel: sentinel1 })
    await pnt.connect(pntHolder2).approve(registrationManager.address, stakeAmount)
    await registrationManager.connect(pntHolder2).updateSentinelRegistrationByStaking(pntHolder2.address, stakeAmount, duration, signature1)

    await time.increase(EPOCH_DURATION * 2)
    const fee = ethers.utils.parseEther('100')
    await pnt.connect(pntHolder1).approve(feesManager.address, fee)
    await feesManager.connect(pntHolder1).depositFeeForPreviousEpoch(pnt.address, fee)

    await expect(feesManager.connect(pntHolder2).claimFeeByEpoch(pnt.address, 2)).to.be.revertedWithCustomError(feesManager, 'InvalidEpoch')
    await expect(feesManager.connect(pntHolder2).claimFeeByEpoch(pnt.address, 3)).to.be.revertedWithCustomError(feesManager, 'InvalidEpoch')
  })

  it('should not be able to claim the fee twice in the same epoch by using the claim for many epochs (1)', async () => {
    const stakeAmount = ethers.utils.parseEther('200000')
    const duration = EPOCH_DURATION * 4

    const signature1 = await getSentinelIdentity(pntHolder2.address, { sentinel: sentinel1 })
    await pnt.connect(pntHolder2).approve(registrationManager.address, stakeAmount)
    await registrationManager.connect(pntHolder2).updateSentinelRegistrationByStaking(pntHolder2.address, stakeAmount, duration, signature1)

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)
    const fee = ethers.utils.parseEther('100')
    await pnt.connect(pntHolder1).approve(feesManager.address, fee)
    await feesManager.connect(pntHolder1).depositFeeForPreviousEpoch(pnt.address, fee)

    await expect(feesManager.connect(pntHolder2).claimFeeByEpoch(pnt.address, 1))
      .to.emit(feesManager, 'FeeClaimed')
      .withArgs(pntHolder2.address, sentinel1.address, 1, pnt.address, fee)

    await expect(feesManager.connect(pntHolder2).claimFeeByEpochsRange(pnt.address, 1, 1)).to.be.revertedWithCustomError(
      feesManager,
      'NothingToClaim'
    )
  })

  it('should not be able to claim the fee twice in the same epoch by using the claim for many epochs (2)', async () => {
    const stakeAmount = ethers.utils.parseEther('200000')
    const duration = EPOCH_DURATION * 4

    const signature1 = await getSentinelIdentity(pntHolder2.address, { sentinel: sentinel1 })
    await pnt.connect(pntHolder2).approve(registrationManager.address, stakeAmount)
    await registrationManager.connect(pntHolder2).updateSentinelRegistrationByStaking(pntHolder2.address, stakeAmount, duration, signature1)

    await time.increase(EPOCH_DURATION * 2)
    expect(await epochsManager.currentEpoch()).to.be.equal(2)
    const fee = ethers.utils.parseEther('100')
    await pnt.connect(pntHolder1).approve(feesManager.address, fee)
    await feesManager.connect(pntHolder1).depositFeeForPreviousEpoch(pnt.address, fee)

    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.equal(3)
    await pnt.connect(pntHolder1).approve(feesManager.address, fee)
    await feesManager.connect(pntHolder1).depositFeeForPreviousEpoch(pnt.address, fee)

    await expect(feesManager.connect(pntHolder2).claimFeeByEpochsRange(pnt.address, 1, 2))
      .to.emit(feesManager, 'FeeClaimed')
      .withArgs(pntHolder2.address, sentinel1.address, 1, pnt.address, fee)
      .and.to.emit(feesManager, 'FeeClaimed')
      .withArgs(pntHolder2.address, sentinel1.address, 2, pnt.address, fee)

    await expect(feesManager.connect(pntHolder2).claimFeeByEpochsRange(pnt.address, 1, 2)).to.be.revertedWithCustomError(
      feesManager,
      'NothingToClaim'
    )
  })

  it('should not be able to claim many epochs using an end epoch grater than the current one', async () => {
    await time.increase(EPOCH_DURATION)
    await expect(feesManager.connect(pntHolder1).claimFeeByEpochsRange(pnt.address, 1, 2)).to.be.revertedWithCustomError(
      lendingManager,
      'InvalidEpoch'
    )
  })
})
