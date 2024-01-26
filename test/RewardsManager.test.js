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
  PNT_MAX_TOTAL_SUPPLY
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

  beforeEach(async () => {
    const rpc = config.networks.hardhat.forking.url
    const blockToForkFrom = config.networks.hardhat.forking.blockNumber
    await hardhatReset(network.provider, rpc, blockToForkFrom)

    const RewardsManager = await ethers.getContractFactory('RewardsManager')
    const EpochsManager = await ethers.getContractFactory('EpochsManager')
    const TestToken = await ethers.getContractFactory('TestToken')
    const MockDandelionVotingContract = await ethers.getContractFactory('MockDandelionVotingContract')

    const signers = await ethers.getSigners()
    owner = signers[0]
    daoCreator = await ethers.getImpersonatedSigner(DAO_CREATOR)
    randomGuy = ethers.Wallet.createRandom().connect(ethers.provider)
    pntHolder1 = ethers.Wallet.createRandom().connect(ethers.provider)
    pntHolder2 = ethers.Wallet.createRandom().connect(ethers.provider)
    pntHolder3 = ethers.Wallet.createRandom().connect(ethers.provider)
    pntHolder4 = ethers.Wallet.createRandom().connect(ethers.provider)
    pntHolders = [pntHolder1, pntHolder2, pntHolder3, pntHolder4]

    await Promise.all([...pntHolders, randomGuy].map((_dest) => sendEthers(owner, _dest, '1')))

    acl = await ethers.getContractAt(AclAbi, ACL_ADDRESS)
    tokenManager = await ethers.getContractAt(TokenManagerAbi, TOKEN_MANAGER_ADDRESS)
    pnt = await TestToken.deploy('PNT', 'PNT')

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
    const amount = 100n
    expect(await epochsManager.currentEpoch()).to.be.eq(0)
    await rewardsManager.grantRole(DEPOSIT_REWARD_ROLE, owner.address)
    await pnt.approve(await rewardsManager.getAddress(), amount)
    const pntOwnerBalancePre = await pnt.balanceOf(owner.address)
    const pntRewardsManagerBalancePre = await pnt.balanceOf(await rewardsManager.getAddress())
    await rewardsManager.depositForEpoch(0, amount)
    const pntOwnerBalancePost = await pnt.balanceOf(owner.address)
    const pntRewardsManagerBalancePost = await pnt.balanceOf(await rewardsManager.getAddress())
    expect(pntOwnerBalancePost).to.be.eq(pntOwnerBalancePre - amount)
    expect(pntRewardsManagerBalancePost).to.be.eq(pntRewardsManagerBalancePre + amount)
    expect(await rewardsManager.depositedAmountByEpoch(0)).to.be.eq(amount)
  })

  it('should not be able to register for rewards without voting', async () => {
    const amount = (ethers.parseUnits('660000') * 10n) / 100n
    await setPermission(owner.address, await tokenManager.getAddress(), MINT_ROLE)
    await tokenManager.mint(pntHolder1.address, ethers.parseUnits('200000'))
    await tokenManager.mint(pntHolder2.address, ethers.parseUnits('400000'))
    await tokenManager.mint(pntHolder3.address, ethers.parseUnits('50000'))
    await tokenManager.mint(pntHolder4.address, ethers.parseUnits('10000'))
    expect(await epochsManager.currentEpoch()).to.be.eq(0)
    await rewardsManager.grantRole(DEPOSIT_REWARD_ROLE, owner.address)
    await pnt.approve(await rewardsManager.getAddress(), amount)
    const pntOwnerBalancePre = await pnt.balanceOf(owner.address)
    const pntRewardsManagerBalancePre = await pnt.balanceOf(await rewardsManager.getAddress())
    await rewardsManager.depositForEpoch(0, amount)
    const pntOwnerBalancePost = await pnt.balanceOf(owner.address)
    const pntRewardsManagerBalancePost = await pnt.balanceOf(await rewardsManager.getAddress())
    expect(pntOwnerBalancePost).to.be.eq(pntOwnerBalancePre - amount)
    expect(pntRewardsManagerBalancePost).to.be.eq(pntRewardsManagerBalancePre + amount)
    await time.increase(ONE_DAY)
    await dandelionVoting.setTestStartDate()
    await Promise.all(
      R.zip(pntHolders, [1, 1, 2, 0]).map(([holder, status]) =>
        dandelionVoting.setTestVoteState(holder.address, status)
      )
    )
    await time.increase(ONE_MONTH + ONE_DAY)
    await expect(
      rewardsManager
        .connect(randomGuy)
        .registerRewardsForEpoch(0, [pntHolder1.address, pntHolder2.address, pntHolder3.address])
    ).to.not.be.reverted
    await expect(rewardsManager.connect(randomGuy).registerRewardsForEpoch(0, [pntHolder3.address, pntHolder4.address]))
      .to.not.be.reverted
    expect(await rewardsManager.lockedRewardByEpoch(0, pntHolder1.address)).to.be.eq(ethers.parseUnits('20000'))
    expect(await rewardsManager.lockedRewardByEpoch(0, pntHolder2.address)).to.be.eq(ethers.parseUnits('40000'))
    expect(await rewardsManager.lockedRewardByEpoch(0, pntHolder3.address)).to.be.eq(ethers.parseUnits('5000'))
    expect(await rewardsManager.lockedRewardByEpoch(0, pntHolder4.address)).to.be.eq(ethers.parseUnits('0'))
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
    await time.increase(ONE_MONTH)
    await expect(rewardsManager.connect(pntHolder2).claimRewardByEpoch(0))
      .to.emit(pnt, 'Transfer')
      .withArgs(await rewardsManager.getAddress(), pntHolder2.address, ethers.parseUnits('40000'))
    await expect(rewardsManager.connect(randomGuy).claimRewardByEpoch(0)).to.be.revertedWithCustomError(
      rewardsManager,
      'NothingToClaim'
    )
  })
})
