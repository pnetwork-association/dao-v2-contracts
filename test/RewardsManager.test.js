const { time } = require('@nomicfoundation/hardhat-network-helpers')
const { expect } = require('chai')
const { ethers, upgrades, config, network } = require('hardhat')
const R = require('ramda')

const AclAbi = require('./abi/ACL.json')
const TokenManagerAbi = require('./abi/TokenManager.json')
const {
  EPOCH_DURATION,
  TOKEN_MANAGER_ADDRESS,
  ONE_DAY,
  ONE_MONTH,
  DAO_CREATOR,
  ACL_ADDRESS,
  PNT_MAX_TOTAL_SUPPLY,
  VOTE_STATUS
} = require('./constants')
const { DEPOSIT_REWARD_ROLE, MINT_ROLE, BURN_ROLE } = require('./roles')
const { hardhatReset } = require('./utils/hardhat-reset')

describe('RewardsManager', () => {
  let epochsManager,
    pnt,
    owner,
    pntHolder1,
    pntHolder2,
    pntHolder3,
    pntHolder4,
    pntHolders,
    randomGuy,
    dandelionVoting,
    rewardsManager,
    acl,
    tokenManager,
    daoPnt,
    daoCreator

  const setPermission = async (entity, app, role) => acl.connect(daoCreator).grantPermission(entity, app, role)

  const sendEthers = (_from, _dest, _amount) =>
    _from.sendTransaction({
      to: _dest.address,
      value: ethers.parseEther(_amount)
    })

  const sendPnt = (_from, _to, _amount) => pnt.connect(_from).transfer(_to, ethers.parseEther(_amount))

  const missingSteps = async () => {
    await setPermission(await rewardsManager.getAddress(), await tokenManager.getAddress(), MINT_ROLE)
    await setPermission(await rewardsManager.getAddress(), await tokenManager.getAddress(), BURN_ROLE)
  }

  const depositRewardsForEpoch = async (_amount, _epoch) => {
    await rewardsManager.grantRole(DEPOSIT_REWARD_ROLE, owner.address)
    await pnt.approve(await rewardsManager.getAddress(), _amount)
    const pntOwnerBalancePre = await pnt.balanceOf(owner.address)
    const pntRewardsManagerBalancePre = await pnt.balanceOf(await rewardsManager.getAddress())
    const depositedRewards = await rewardsManager.depositedAmountByEpoch(_epoch)
    await rewardsManager.depositForEpoch(_epoch, _amount)
    const pntOwnerBalancePost = await pnt.balanceOf(owner.address)
    const pntRewardsManagerBalancePost = await pnt.balanceOf(await rewardsManager.getAddress())
    expect(pntOwnerBalancePost).to.be.eq(pntOwnerBalancePre - _amount)
    expect(pntRewardsManagerBalancePost).to.be.eq(pntRewardsManagerBalancePre + _amount)
    expect(await rewardsManager.depositedAmountByEpoch(_epoch)).to.be.eq(depositedRewards + _amount)
  }

  const assertDaoPntBalances = async (_expected) =>
    expect(await Promise.all(pntHolders.map((_staker) => daoPnt.balanceOf(_staker.address)))).to.be.eql(
      _expected.map((_val) => ethers.parseUnits(_val))
    )

  const assertPntBalances = async (_expected) =>
    expect(await Promise.all(pntHolders.map((_staker) => pnt.balanceOf(_staker.address)))).to.be.eql(
      _expected.map((_val) => ethers.parseUnits(_val))
    )

  const assertLockedRewardForEpoch = async (_epoch, _expected) =>
    expect(
      await Promise.all(pntHolders.map((_staker) => rewardsManager.lockedRewardByEpoch(_epoch, _staker.address)))
    ).to.be.eql(_expected.map((_val) => ethers.parseUnits(_val)))

  const setStakersVoteState = async (_voteId, _states) =>
    Promise.all(
      R.zip(pntHolders, _states).map(([holder, status]) =>
        dandelionVoting.setTestVoteState(_voteId, holder.address, status)
      )
    )

  beforeEach(async () => {
    const rpc = config.networks.hardhat.forking.url
    const blockToForkFrom = config.networks.hardhat.forking.blockNumber
    await hardhatReset(network.provider, rpc, blockToForkFrom)

    const RewardsManager = await ethers.getContractFactory('RewardsManager')
    const EpochsManager = await ethers.getContractFactory('EpochsManager')
    const TestToken = await ethers.getContractFactory('TestToken')
    const MockDandelionVotingContract = await ethers.getContractFactory('MockDandelionVotingContract')
    const ERC20 = await ethers.getContractFactory('ERC20')

    const signers = await ethers.getSigners()
    owner = signers[0]
    daoCreator = await ethers.getImpersonatedSigner(DAO_CREATOR)
    randomGuy = ethers.Wallet.createRandom().connect(ethers.provider)
    pntHolder1 = ethers.Wallet.createRandom().connect(ethers.provider)
    pntHolder2 = ethers.Wallet.createRandom().connect(ethers.provider)
    pntHolder3 = ethers.Wallet.createRandom().connect(ethers.provider)
    pntHolder4 = ethers.Wallet.createRandom().connect(ethers.provider)
    pntHolders = [pntHolder1, pntHolder2, pntHolder3, pntHolder4]

    await Promise.all([...pntHolders, daoCreator, randomGuy].map((_dest) => sendEthers(owner, _dest, '1001')))

    acl = await ethers.getContractAt(AclAbi, ACL_ADDRESS)
    tokenManager = await ethers.getContractAt(TokenManagerAbi, TOKEN_MANAGER_ADDRESS)
    pnt = await TestToken.deploy('PNT', 'PNT')
    daoPnt = ERC20.attach(await tokenManager.token())

    await Promise.all(pntHolders.map((_holder) => sendPnt(owner, _holder.address, '400000')))

    dandelionVoting = await MockDandelionVotingContract.deploy()

    epochsManager = await upgrades.deployProxy(EpochsManager, [EPOCH_DURATION, 0], {
      initializer: 'initialize',
      kind: 'uups'
    })

    rewardsManager = await upgrades.deployProxy(
      RewardsManager,
      [
        await epochsManager.getAddress(),
        await dandelionVoting.getAddress(),
        await pnt.getAddress(),
        await tokenManager.getAddress(),
        PNT_MAX_TOTAL_SUPPLY
      ],
      {
        initializer: 'initialize',
        kind: 'uups'
      }
    )

    await missingSteps()
  })

  it('should deploy correctly', async () => {
    expect(await rewardsManager.token()).to.eq(await pnt.getAddress())
    expect(await rewardsManager.tokenManager()).to.eq(await tokenManager.getAddress())
  })

  it('should be possible to deposit tokens', async () => {
    expect(await epochsManager.currentEpoch()).to.be.eq(0)
    await depositRewardsForEpoch(100n, 0)
    await time.increase(ONE_DAY)
    await depositRewardsForEpoch(200n, 0)
    await time.increase(ONE_DAY)
    await depositRewardsForEpoch(300n, 1)
  })

  it('should not be possible to deposit rewards for a previous epoch', async () => {
    expect(await epochsManager.currentEpoch()).to.be.eq(0)
    await time.increase(ONE_MONTH)
    expect(await epochsManager.currentEpoch()).to.be.eq(1)
    await expect(depositRewardsForEpoch(300n, 0)).to.be.revertedWithCustomError(rewardsManager, 'InvalidEpoch')
  })

  it('should register and assign rewards correctly', async () => {
    const amount = (ethers.parseUnits('660000') * 10n) / 100n
    await setPermission(owner.address, await tokenManager.getAddress(), MINT_ROLE)

    await assertDaoPntBalances(['0', '0', '0', '0'])
    await tokenManager.mint(pntHolder1.address, ethers.parseUnits('200000'))
    await tokenManager.mint(pntHolder2.address, ethers.parseUnits('400000'))
    await tokenManager.mint(pntHolder3.address, ethers.parseUnits('50000'))
    await tokenManager.mint(pntHolder4.address, ethers.parseUnits('10000'))
    await assertDaoPntBalances(['200000', '400000', '50000', '10000'])
    await assertPntBalances(['400000', '400000', '400000', '400000'])

    expect(await epochsManager.currentEpoch()).to.be.eq(0)
    await depositRewardsForEpoch(amount, 0)

    await time.increase(ONE_DAY)
    await dandelionVoting.newVote()
    await setStakersVoteState(1, [VOTE_STATUS.YES, VOTE_STATUS.YES, VOTE_STATUS.ABSENT, VOTE_STATUS.ABSENT])
    await time.increase(ONE_DAY * 4)
    await dandelionVoting.newVote()
    await setStakersVoteState(2, [VOTE_STATUS.YES, VOTE_STATUS.ABSENT, VOTE_STATUS.YES, VOTE_STATUS.ABSENT])
    await time.increase(ONE_DAY * 4)
    await dandelionVoting.newVote()
    await setStakersVoteState(3, [VOTE_STATUS.ABSENT, VOTE_STATUS.ABSENT, VOTE_STATUS.YES, VOTE_STATUS.ABSENT])

    await time.increase(ONE_MONTH + ONE_DAY)
    await expect(
      rewardsManager
        .connect(randomGuy)
        .registerRewardsForEpoch(0, [pntHolder1.address, pntHolder2.address, pntHolder3.address])
    ).to.not.be.reverted
    await assertLockedRewardForEpoch(0, ['20000', '40000', '5000', '0'])
    await assertDaoPntBalances(['220000', '440000', '55000', '10000'])

    await expect(rewardsManager.connect(randomGuy).registerRewardsForEpoch(0, [pntHolder3.address, pntHolder4.address]))
      .to.not.be.reverted
    await assertLockedRewardForEpoch(0, ['20000', '40000', '5000', '0'])
    await assertDaoPntBalances(['220000', '440000', '55000', '10000'])

    await expect(rewardsManager.connect(pntHolder1).claimRewardByEpoch(0)).to.be.revertedWithCustomError(
      rewardsManager,
      'TooEarly'
    )
    await time.increase(ONE_MONTH * 12 + ONE_DAY)
    await expect(rewardsManager.connect(pntHolder1).claimRewardByEpoch(0))
      .to.emit(pnt, 'Transfer')
      .withArgs(await rewardsManager.getAddress(), pntHolder1.address, ethers.parseUnits('20000'))
    await expect(rewardsManager.connect(pntHolder1).claimRewardByEpoch(0)).to.be.revertedWithCustomError(
      rewardsManager,
      'NothingToClaim'
    )
    await assertLockedRewardForEpoch(0, ['0', '40000', '5000', '0'])
    await assertDaoPntBalances(['200000', '440000', '55000', '10000'])
    await assertPntBalances(['420000', '400000', '400000', '400000'])

    await time.increase(ONE_MONTH)
    await expect(rewardsManager.connect(pntHolder2).claimRewardByEpoch(0))
      .to.emit(pnt, 'Transfer')
      .withArgs(await rewardsManager.getAddress(), pntHolder2.address, ethers.parseUnits('40000'))
    await expect(rewardsManager.connect(randomGuy).claimRewardByEpoch(0)).to.be.revertedWithCustomError(
      rewardsManager,
      'NothingToClaim'
    )
    await assertLockedRewardForEpoch(0, ['0', '0', '5000', '0'])
    await assertDaoPntBalances(['200000', '400000', '55000', '10000'])
    await assertPntBalances(['420000', '440000', '400000', '400000'])
  })
})