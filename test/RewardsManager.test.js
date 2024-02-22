const { time } = require('@nomicfoundation/hardhat-network-helpers')
const { expect } = require('chai')
const { ethers, upgrades, config, network } = require('hardhat')
const R = require('ramda')

const AclAbi = require('../lib/abi/ACL.json')
const TokenManagerAbi = require('../lib/abi/TokenManager.json')
const {
  ADDRESSES: {
    GNOSIS: { ACL_ADDRESS, TOKEN_MANAGER_ADDRESS, SAFE_ADDRESS }
  }
} = require('../lib/constants')
const { getAllRoles } = require('../lib/roles')

const { EPOCH_DURATION, ONE_DAY, ONE_MONTH, PNT_MAX_TOTAL_SUPPLY, VOTE_STATUS } = require('./constants')
const { hardhatReset } = require('./utils/hardhat-reset')
const { sendEth } = require('./utils/send-eth')

const { DEPOSIT_REWARD_ROLE, MINT_ROLE, BURN_ROLE, WITHDRAW_ROLE } = getAllRoles(ethers)

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
    daoRoot

  const setPermission = async (entity, app, role) => acl.connect(daoRoot).grantPermission(entity, app, role)

  const sendPnt = (_from, _to, _amount) => pnt.connect(_from).transfer(_to, ethers.parseEther(_amount))

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

  const mintDaoPnt = async (_amounts) =>
    Promise.all(
      R.zip(pntHolders, _amounts).map(([_holder, _amount]) =>
        tokenManager.mint(_holder.address, ethers.parseUnits(_amount))
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
    daoRoot = await ethers.getImpersonatedSigner(SAFE_ADDRESS)
    sendEth(ethers, owner, daoRoot.address, '1')

    randomGuy = ethers.Wallet.createRandom().connect(ethers.provider)
    pntHolder1 = ethers.Wallet.createRandom().connect(ethers.provider)
    pntHolder2 = ethers.Wallet.createRandom().connect(ethers.provider)
    pntHolder3 = ethers.Wallet.createRandom().connect(ethers.provider)
    pntHolder4 = ethers.Wallet.createRandom().connect(ethers.provider)
    pntHolders = [pntHolder1, pntHolder2, pntHolder3, pntHolder4]

    await Promise.all([...pntHolders, daoRoot, randomGuy].map((_dest) => sendEth(ethers, owner, _dest.address, '1001')))

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
    await setPermission(await rewardsManager.getAddress(), await tokenManager.getAddress(), MINT_ROLE)
    await setPermission(await rewardsManager.getAddress(), await tokenManager.getAddress(), BURN_ROLE)
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
    await depositRewardsForEpoch(300n, 0)
    await time.increase(ONE_MONTH)
    expect(await epochsManager.currentEpoch()).to.be.eq(1)
    await expect(depositRewardsForEpoch(300n, 0)).to.be.revertedWithCustomError(rewardsManager, 'InvalidEpoch')
  })

  it('should register and assign rewards correctly', async () => {
    const amount = (ethers.parseUnits('660000') * 10n) / 100n
    await setPermission(owner.address, await tokenManager.getAddress(), MINT_ROLE)

    await assertDaoPntBalances(['0', '0', '0', '0'])
    // mint daoPNT to simulate staking
    await mintDaoPnt(['200000', '400000', '50000', '10000'])
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
    expect(await rewardsManager.unclaimableAmountByEpoch(0)).to.be.eq(0)

    await expect(rewardsManager.connect(randomGuy).registerRewardsForEpoch(0, [pntHolder3.address, pntHolder4.address]))
      .to.not.be.reverted
    await assertLockedRewardForEpoch(0, ['20000', '40000', '5000', '0'])
    await assertDaoPntBalances(['220000', '440000', '55000', '10000'])
    expect(await rewardsManager.unclaimableAmountByEpoch(0)).to.be.eq(ethers.parseUnits('1000'))

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

    // withdraw unclaimable rewards
    await expect(rewardsManager.connect(randomGuy).withdrawUnclaimableRewardsForEpoch(0)).to.be.revertedWith(
      `AccessControl: account ${randomGuy.address.toLowerCase()} is missing role ${WITHDRAW_ROLE}`
    )
    await rewardsManager.grantRole(WITHDRAW_ROLE, owner.address)
    const ownerBalancePre = await pnt.balanceOf(owner.address)
    await rewardsManager.connect(owner).withdrawUnclaimableRewardsForEpoch(0)
    expect(await pnt.balanceOf(owner.address)).to.be.eq(ownerBalancePre + ethers.parseUnits('1000'))
    await expect(rewardsManager.connect(owner).withdrawUnclaimableRewardsForEpoch(0)).to.be.revertedWithCustomError(
      rewardsManager,
      'NothingToWithdraw'
    )
  })

  it('should not register anything if there is no vote in the epoch', async () => {
    const amount = (ethers.parseUnits('660000') * 10n) / 100n
    await setPermission(owner.address, await tokenManager.getAddress(), MINT_ROLE)

    await assertDaoPntBalances(['0', '0', '0', '0'])
    // mint daoPNT to simulate staking
    await mintDaoPnt(['200000', '400000', '50000', '10000'])
    await assertDaoPntBalances(['200000', '400000', '50000', '10000'])
    await assertPntBalances(['400000', '400000', '400000', '400000'])

    expect(await epochsManager.currentEpoch()).to.be.eq(0)
    await depositRewardsForEpoch(amount, 0)

    await time.increase(ONE_MONTH + ONE_DAY)
    await expect(
      rewardsManager
        .connect(randomGuy)
        .registerRewardsForEpoch(0, [pntHolder1.address, pntHolder2.address, pntHolder3.address])
    ).to.be.revertedWithCustomError(rewardsManager, 'NoVoteInEpoch')
    await assertLockedRewardForEpoch(0, ['0', '0', '0', '0'])
    await assertDaoPntBalances(['200000', '400000', '50000', '10000'])
    expect(await rewardsManager.unclaimableAmountByEpoch(0)).to.be.eq(0)
  })
})
