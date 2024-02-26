const { mineUpTo, time } = require('@nomicfoundation/hardhat-network-helpers')
const { expect } = require('chai')
const { config, ethers, network, upgrades } = require('hardhat')

const AclAbi = require('../../lib/abi/ACL.json')
const DandelionVotingAbi = require('../../lib/abi/DandelionVoting.json')
const DaoPntAbi = require('../../lib/abi/daoPNT.json')
const ERC20VaultAbi = require('../../lib/abi/ERC20Vault.json')
const EthPntAbi = require('../../lib/abi/ethPNT.json')
const FinanceAbi = require('../../lib/abi/Finance.json')
const VaultAbi = require('../../lib/abi/Vault.json')
const {
  ADDRESSES: {
    GNOSIS: {
      SAFE_ADDRESS,
      STAKING_MANAGER,
      STAKING_MANAGER_LM,
      STAKING_MANAGER_RM,
      LENDING_MANAGER,
      DANDELION_VOTING_ADDRESS,
      FINANCE_VAULT,
      FINANCE,
      REGISTRATION_MANAGER,
      DAOPNT_ON_GNOSIS_ADDRESS,
      ACL_ADDRESS,
      REWARDS_MANAGER,
      PNT_ON_GNOSIS_MINTER
    },
    MAINNET: {
      ERC20_VAULT,
      DANDELION_VOTING_ADDRESS: DANDELION_VOTING_V1_ADDRESS,
      PNT_ON_ETH_ADDRESS,
      ETHPNT_ADDRESS,
      PNETWORK_ADDRESS,
      ASSOCIATION_ON_ETH_ADDRESS
    },
    ZERO_ADDRESS
  },
  MISC: { ONE_DAY },
  PNETWORK_NETWORK_IDS
} = require('../../lib/constants')
const { encodeMetadata } = require('../../lib/metadata')
const { getAllRoles } = require('../../lib/roles')
const { encode } = require('../utils')
const { hardhatReset } = require('../utils/hardhat-reset')
const { mintPToken, pegoutToken } = require('../utils/pnetwork')
const { sendEth } = require('../utils/send-eth')

const { CHANGE_TOKEN_ROLE, CREATE_VOTES_ROLE, CREATE_PAYMENTS_ROLE, DEPOSIT_REWARD_ROLE, UPGRADE_ROLE } =
  getAllRoles(ethers)

const USER_ADDRESS = '0xdDb5f4535123DAa5aE343c24006F4075aBAF5F7B'
const ADDRESS_PLACEHOLDER = '0x0123456789012345678901234567890123456789'

const getBytes = (_hexString) => Buffer.from(_hexString.slice(2), 'hex')

const parseEther = (_input) => ethers.parseEther(_input)

const createExecutorId = (id) => `0x${String(id).padStart(8, '0')}`

const encodeCallScript = (actions, specId = 1) =>
  actions.reduce((script, { to, calldata }) => {
    const encoder = new ethers.AbiCoder()
    const addr = encoder.encode(['address'], [to])
    const length = encoder.encode(['uint256'], [(calldata.length - 2) / 2])
    // Remove 12 first 0s of padding for addr and 28 0s for uint32
    return script + addr.slice(26) + length.slice(58) + calldata.slice(2)
  }, createExecutorId(specId))

const encodeFunctionCall = (_to, _calldata) => ({
  to: _to,
  calldata: _calldata
})

const hasPermission = (acl, who, where, what) => acl['hasPermission(address,address,bytes32)'](who, where, what)

const setPermission = (acl, permissionManager, entity, app, role) =>
  acl.connect(permissionManager).grantPermission(entity, app, role)

const grantCreateVotesPermission = async (_acl, _permissionManager, _who) => {
  let hasPerm = await hasPermission(_acl, _who, DANDELION_VOTING_ADDRESS, CREATE_VOTES_ROLE)
  expect(hasPerm).to.be.false
  await setPermission(_acl, _permissionManager, _who, DANDELION_VOTING_ADDRESS, CREATE_VOTES_ROLE)
  hasPerm = await hasPermission(_acl, _who, DANDELION_VOTING_ADDRESS, CREATE_VOTES_ROLE)
  expect(hasPerm).to.be.true
}

const openNewVoteAndReachQuorum = async (
  _votingContract,
  _voteCreator,
  _voters,
  _executionScript,
  _metadata,
  _durationBlocks = false
) => {
  const supports = true
  const executionScriptBytes = getBytes(_executionScript)

  const voteId = (await _votingContract.votesLength()) + 1n
  await expect(_votingContract.connect(_voteCreator).newVote(executionScriptBytes, _metadata, supports))
    .to.emit(_votingContract, 'StartVote')
    .withArgs(voteId, _voteCreator.address, _metadata)

  for (const voter of _voters) {
    if (voter === _voteCreator) {
      await expect(_votingContract.connect(voter).vote(voteId, supports)).to.be.revertedWith(
        'DANDELION_VOTING_CAN_NOT_VOTE'
      )
    } else {
      await expect(_votingContract.connect(voter).vote(voteId, supports)).to.emit(_votingContract, 'CastVote')
    }
  }
  const vote = await _votingContract.getVote(voteId)
  const executionTs = vote[3]
  if (_durationBlocks) await mineUpTo(executionTs + 1n)
  else await time.increaseTo(executionTs + 1n)
  return voteId
}

describe('Integration tests on Gnosis deployment', () => {
  let faucet,
    acl,
    daoVoting,
    tokenHolders,
    user,
    daoOwner,
    pntOnGnosis,
    pntMinter,
    StakingManager,
    StakingManagerPermissioned,
    stakingManager,
    stakingManagerLm,
    stakingManagerRm,
    LendingManager,
    lendingManager,
    daoPNT,
    registrationManager,
    RegistrationManager,
    daoTreasury,
    finance,
    rewardsManager,
    RewardsManager

  const TOKEN_HOLDERS_ADDRESSES = [
    '0xc4442915B1FB44972eE4D8404cE05a8D2A1248dA',
    '0xe8b43e7d55337ab735f6e1932d4a1e98de70eabc',
    '0x9ad4550759389ca7f0488037daa4332b1f30cdac',
    '0x100a70b9e50e91367d571332e76cfa70e9307059'
  ]

  const missingSteps = async () => {
    await upgradeContracts()
    const MockPToken = await ethers.getContractFactory('MockPTokenERC20')
    pntOnGnosis = await MockPToken.deploy('Host Token (pToken)', 'HTKN', pntMinter.address, PNETWORK_NETWORK_IDS.GNOSIS)
    await stakingManager.connect(daoOwner).grantRole(CHANGE_TOKEN_ROLE, SAFE_ADDRESS)
    await stakingManagerLm.connect(daoOwner).grantRole(CHANGE_TOKEN_ROLE, SAFE_ADDRESS)
    await stakingManagerRm.connect(daoOwner).grantRole(CHANGE_TOKEN_ROLE, SAFE_ADDRESS)
    await lendingManager.connect(daoOwner).grantRole(CHANGE_TOKEN_ROLE, SAFE_ADDRESS)
    await registrationManager.connect(daoOwner).grantRole(CHANGE_TOKEN_ROLE, SAFE_ADDRESS)
    await rewardsManager.connect(daoOwner).grantRole(CHANGE_TOKEN_ROLE, SAFE_ADDRESS)
    await stakingManager.connect(daoOwner).changeToken(pntOnGnosis.target)
    await stakingManagerLm.connect(daoOwner).changeToken(pntOnGnosis.target)
    await stakingManagerRm.connect(daoOwner).changeToken(pntOnGnosis.target)
    await lendingManager.connect(daoOwner).changeToken(pntOnGnosis.target)
    await registrationManager.connect(daoOwner).changeToken(pntOnGnosis.target)
    await rewardsManager.connect(daoOwner).changeToken(pntOnGnosis.target)
    await rewardsManager.connect(daoOwner).grantRole(DEPOSIT_REWARD_ROLE, DANDELION_VOTING_ADDRESS)
  }

  const upgradeContracts = async () => {
    await stakingManager.connect(daoOwner).grantRole(UPGRADE_ROLE, faucet.address)
    await stakingManagerLm.connect(daoOwner).grantRole(UPGRADE_ROLE, faucet.address)
    await stakingManagerRm.connect(daoOwner).grantRole(UPGRADE_ROLE, faucet.address)
    await lendingManager.connect(daoOwner).grantRole(UPGRADE_ROLE, faucet.address)
    await registrationManager.connect(daoOwner).grantRole(UPGRADE_ROLE, faucet.address)
    await rewardsManager.connect(daoOwner).grantRole(UPGRADE_ROLE, faucet.address)
    await upgrades.upgradeProxy(stakingManager, StakingManager)
    await upgrades.upgradeProxy(stakingManagerLm, StakingManagerPermissioned)
    await upgrades.upgradeProxy(stakingManagerRm, StakingManagerPermissioned)
    await upgrades.upgradeProxy(lendingManager, LendingManager)
    await upgrades.upgradeProxy(registrationManager, RegistrationManager)
    await upgrades.upgradeProxy(rewardsManager, RewardsManager)
  }

  beforeEach(async () => {
    const rpc = config.networks.hardhat.forking.url
    const blockToForkFrom = config.networks.hardhat.forking.blockNumber
    await hardhatReset(network.provider, rpc, blockToForkFrom)
    ;[faucet] = await ethers.getSigners()
    tokenHolders = await Promise.all(TOKEN_HOLDERS_ADDRESSES.map(ethers.getImpersonatedSigner))
    user = await ethers.getImpersonatedSigner(USER_ADDRESS)
    daoOwner = await ethers.getImpersonatedSigner(SAFE_ADDRESS)
    await sendEth(ethers, faucet, daoOwner.address, '5')
    pntMinter = await ethers.getImpersonatedSigner(PNT_ON_GNOSIS_MINTER)

    StakingManager = await ethers.getContractFactory('StakingManager')
    StakingManagerPermissioned = await ethers.getContractFactory('StakingManagerPermissioned')
    RegistrationManager = await ethers.getContractFactory('RegistrationManager')
    LendingManager = await ethers.getContractFactory('LendingManager')
    RewardsManager = await ethers.getContractFactory('RewardsManager')

    acl = await ethers.getContractAt(AclAbi, ACL_ADDRESS)
    daoVoting = await ethers.getContractAt(DandelionVotingAbi, DANDELION_VOTING_ADDRESS)
    daoTreasury = await ethers.getContractAt(VaultAbi, FINANCE_VAULT)
    finance = await ethers.getContractAt(FinanceAbi, FINANCE)
    daoPNT = await ethers.getContractAt(DaoPntAbi, DAOPNT_ON_GNOSIS_ADDRESS)
    stakingManager = StakingManager.attach(STAKING_MANAGER)
    stakingManagerLm = StakingManagerPermissioned.attach(STAKING_MANAGER_LM)
    stakingManagerRm = StakingManagerPermissioned.attach(STAKING_MANAGER_RM)
    registrationManager = RegistrationManager.attach(REGISTRATION_MANAGER)
    lendingManager = LendingManager.attach(LENDING_MANAGER)
    rewardsManager = RewardsManager.attach(REWARDS_MANAGER)

    await missingSteps()

    await Promise.all(tokenHolders.map((_holder) => sendEth(ethers, faucet, _holder.address, '5')))
    await Promise.all(tokenHolders.map((_holder) => mintPntOnGnosis(_holder.address, 10000n)))
    await Promise.all(tokenHolders.map((_holder) => stake(_holder, 5000)))
  })

  const mintPntOnGnosis = async (receiver, amount, userData = '0x') => {
    const balance = await pntOnGnosis.balanceOf(receiver)
    await expect(mintPToken(pntOnGnosis, pntMinter, receiver, amount, userData)).to.emit(pntOnGnosis, 'Transfer')
    expect(await pntOnGnosis.balanceOf(receiver)).to.be.eq(balance + amount)
  }

  const stake = async (pntOwner, amount, duration = 604800) => {
    await pntOnGnosis.connect(pntOwner).approve(STAKING_MANAGER, amount)
    await stakingManager.connect(pntOwner).stake(pntOwner.address, amount, duration)
  }

  const encodeUpdateGuardianRegistrationFunctionData = (owner, duration, guardian) =>
    registrationManager.interface.encodeFunctionData('updateGuardianRegistration', [owner, duration, guardian])

  const encodeVaultTransfer = (token, to, value) =>
    daoTreasury.interface.encodeFunctionData('transfer', [token, to, value])

  it('should open a vote for registering a guardian and execute it', async () => {
    const metadata = 'Should we register a new guardian?'
    const executionScript = encodeCallScript(
      [[REGISTRATION_MANAGER, encodeUpdateGuardianRegistrationFunctionData(faucet.address, 10, faucet.address)]].map(
        (_args) => encodeFunctionCall(..._args)
      )
    )
    let currentBlock = await ethers.provider.getBlockNumber()
    expect(await daoPNT.totalSupplyAt(currentBlock)).to.be.eq(20000)
    await mintPntOnGnosis(faucet.address, 10000n)
    await stake(faucet, 10000)
    currentBlock = await ethers.provider.getBlockNumber()
    expect(await daoPNT.totalSupplyAt(currentBlock)).to.be.eq(30000)

    await grantCreateVotesPermission(acl, daoOwner, tokenHolders[0].address)
    const voteId = await openNewVoteAndReachQuorum(daoVoting, tokenHolders[0], tokenHolders, executionScript, metadata)
    await expect(daoVoting.executeVote(voteId))
      .to.emit(daoVoting, 'ExecuteVote')
      .withArgs(voteId)
      .and.to.emit(registrationManager, 'GuardianRegistrationUpdated')
  })

  it('should lend PNTs and register a borrowing sentinel', async () => {
    const amount = ethers.parseEther('200000', await pntOnGnosis.decimals())
    await mintPntOnGnosis(faucet.address, ethers.parseEther('400000', await pntOnGnosis.decimals()))
    await pntOnGnosis.connect(faucet).approve(LENDING_MANAGER, amount)
    const balancePre = await pntOnGnosis.balanceOf(faucet.address)
    await expect(lendingManager.lend(faucet.address, amount, 86400 * 90))
      .to.emit(lendingManager, 'Lended')
      .withArgs(faucet.address, 3, 4, amount)
      .and.to.emit(stakingManagerLm, 'Staked')
      .withArgs(faucet.address, amount, 86400 * 90)
    const balancePost = await pntOnGnosis.balanceOf(faucet.address)
    expect(balancePre - amount).to.be.eq(balancePost)

    const sentinel = ethers.Wallet.createRandom()
    const signature = await sentinel.signMessage('test')
    expect(
      await registrationManager
        .connect(user)
        ['updateSentinelRegistrationByBorrowing(uint16,bytes,uint256)'](1, signature, 0)
    )
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(USER_ADDRESS, 2, 2, '0xB48299F9704a2A268a09f5d47F56e662624E882f', 2, 200000000000000000000000n)
  })

  it('should register a staking sentinel', async () => {
    const amount = ethers.parseEther('200000', await pntOnGnosis.decimals())
    await mintPntOnGnosis(user.address, ethers.parseEther('400000', await pntOnGnosis.decimals()))
    const sentinel = ethers.Wallet.createRandom()
    const signature = await sentinel.signMessage('test')
    await pntOnGnosis.connect(user).approve(REGISTRATION_MANAGER, amount)
    expect(
      await registrationManager
        .connect(user)
        .updateSentinelRegistrationByStaking(user.address, amount, 86400 * 30, signature, 0)
    )
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(USER_ADDRESS, 2, 2, '0xB48299F9704a2A268a09f5d47F56e662624E882f', 2, 200000000000000000000000n)
  })
  ;['MockPTokenERC777', 'MockPTokenERC20'].map((_pTokenContract) =>
    it('should correctly stake after token has been changed', async () => {
      const ERC20Factory = await ethers.getContractFactory(_pTokenContract)
      const newToken = await ERC20Factory.deploy('new PNT', 'nPNT', faucet.address, '0x00112233')

      await pntOnGnosis.connect(faucet).approve(stakingManager.target, 10000)
      await mintPntOnGnosis(faucet.address, 10000n)
      await stakingManager.connect(faucet).stake(faucet.address, 10000, 86400 * 7)
      await expect(stakingManager.connect(daoOwner).changeToken(newToken.target))
        .to.emit(stakingManager, 'TokenChanged')
        .withArgs(pntOnGnosis.target, newToken.target)
      await mintPToken(newToken, faucet, faucet.address, ethers.parseEther('200000'), '0x', '0x')
      await newToken.connect(faucet).approve(stakingManager.target, 10000)
      await expect(stakingManager.connect(faucet).stake(faucet.address, 10000, 86400 * 7))
        .to.be.revertedWithCustomError(stakingManager, 'InvalidToken')
        .withArgs(newToken.target, pntOnGnosis.target)
    })
  )

  it('should stake and unstake', async () => {
    await pntOnGnosis.connect(faucet).approve(stakingManager.target, 10000)
    await mintPntOnGnosis(faucet.address, 10000n)
    expect(await pntOnGnosis.balanceOf(faucet.address)).to.be.eq(10000)
    expect(await daoPNT.balanceOf(faucet.address)).to.be.eq(0)
    await stakingManager.connect(faucet).stake(faucet.address, 10000, 86400 * 7)
    expect(await pntOnGnosis.balanceOf(faucet.address)).to.be.eq(0)
    expect(await daoPNT.balanceOf(faucet.address)).to.be.eq(10000)
    await time.increase(86400 * 4)
    await expect(
      stakingManager.connect(faucet)['unstake(uint256,bytes4)'](10000, '0x0075dd4c')
    ).to.be.revertedWithCustomError(stakingManager, 'UnfinishedStakingPeriod')
    expect(await pntOnGnosis.balanceOf(faucet.address)).to.be.eq(0)
    expect(await daoPNT.balanceOf(faucet.address)).to.be.eq(10000)
    await time.increase(86400 * 4)
    await expect(stakingManager.connect(faucet)['unstake(uint256,bytes4)'](5000, '0x00f1918e')).to.emit(
      stakingManager,
      'Unstaked'
    )
    expect(await pntOnGnosis.balanceOf(faucet.address)).to.be.eq(5000)
    expect(await daoPNT.balanceOf(faucet.address)).to.be.eq(5000)
  })

  it('should move tokens to treasury and transfer from it following a vote', async () => {
    await mintPntOnGnosis(daoTreasury.target, parseEther('200000'))
    expect(await pntOnGnosis.balanceOf(daoTreasury.target)).to.be.eq(parseEther('200000'))
    expect(await pntOnGnosis.balanceOf(user.address)).to.be.eq(parseEther('0'))

    const metadata = 'Should we transfer from vault to user?'
    const executionScript = encodeCallScript(
      [[FINANCE_VAULT, encodeVaultTransfer(pntOnGnosis.target, user.address, parseEther('1'))]].map((_args) =>
        encodeFunctionCall(..._args)
      )
    )
    await grantCreateVotesPermission(acl, daoOwner, tokenHolders[0].address)
    const voteId = await openNewVoteAndReachQuorum(daoVoting, tokenHolders[0], tokenHolders, executionScript, metadata)

    await expect(daoVoting.executeVote(voteId))
      .to.emit(daoVoting, 'ExecuteVote')
      .withArgs(voteId)
      .and.to.emit(daoTreasury, 'VaultTransfer')
      .withArgs(pntOnGnosis.target, user.address, parseEther('1'))
      .and.to.emit(pntOnGnosis, 'Transfer')
      .withArgs(daoTreasury.target, user.address, parseEther('1'))

    expect(await pntOnGnosis.balanceOf(user.address)).to.be.eq(parseEther('1'))
  })

  it('should create an immediate payment via finance app', async () => {
    await setPermission(acl, daoOwner, faucet.address, finance.target, CREATE_PAYMENTS_ROLE)
    const amount = parseEther('1.5')
    await mintPntOnGnosis(daoTreasury.target, parseEther('200000'))
    expect(await pntOnGnosis.balanceOf(daoTreasury.target)).to.be.eq(parseEther('200000'))
    expect(await pntOnGnosis.balanceOf(user.address)).to.be.eq(parseEther('0'))
    await expect(finance.connect(faucet).newImmediatePayment(pntOnGnosis.target, user.address, amount, 'test'))
      .to.emit(daoTreasury, 'VaultTransfer')
      .withArgs(pntOnGnosis.target, user.address, amount)
      .and.to.emit(pntOnGnosis, 'Transfer')
      .withArgs(daoTreasury.target, user.address, amount)
    expect(await pntOnGnosis.balanceOf(daoTreasury.target)).to.be.eq(parseEther('200000') - amount)
    expect(await pntOnGnosis.balanceOf(user.address)).to.be.eq(amount)
  })

  it('should open a vote (1)', async () => {
    await setPermission(acl, daoOwner, user.address, daoVoting.target, CREATE_VOTES_ROLE)
    await expect(
      user.sendTransaction({
        to: '0x0cf759bcCfEf5f322af58ADaE2D28885658B5e02',
        // secretlint-disable-next-line
        data: '0x24160baa00000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000048746573742068747470733a2f2f697066732e696f2f697066732f516d536e75576d7870744a5a644c4a704b52617278424d53324a75326f414e567267627232785762696539623244000000000000000000000000000000000000000000000000',
        value: 0
      })
    )
      .to.emit(daoVoting, 'StartVote')
      .withArgs(1, USER_ADDRESS, 'test https://ipfs.io/ipfs/QmSnuWmxptJZdLJpKRarxBMS2Ju2oANVrgbr2xWbie9b2D')
  })

  it('should open a vote (2)', async () => {
    const from = await ethers.getImpersonatedSigner('0xa41657bf225F8Ec7E2010C89c3F084172948264D')
    await setPermission(acl, daoOwner, from.address, daoVoting.target, CREATE_VOTES_ROLE)
    await expect(
      from.sendTransaction({
        to: '0x0cf759bcCfEf5f322af58ADaE2D28885658B5e02',
        // secretlint-disable-next-line
        data: '0x24160baa000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008000000001139ad01cacbbe51b4a2b099e52c47693ba87351b00000064beabacc8000000000000000000000000f4ea6b892853413bd9d9f1a5d3a620a0ba39c5b2000000000000000000000000f1f6568a76559d85cf68e6597fa587544184dd460000000000000000000000000000000000000000000000000de0b6b3a7640000000000000000000000000000000000000000000000000000000000000000004948656c6c6f2068747470733a2f2f697066732e696f2f697066732f516d52534a31335a79387731785570794b454469795a455763545856633461726a623161674a6b757631476872690000000000000000000000000000000000000000000000',
        value: 0
      })
    )
      .to.emit(daoVoting, 'StartVote')
      .withArgs(1, from.address, 'Hello https://ipfs.io/ipfs/QmRSJ13Zy8w1xUpyKEDiyZEWcTXVc4arjb1agJkuv1Ghri')
  })

  // this test is coupled with Integration tests on Ethereum deployment -> should process pegOut, withdrawInflation, and pegIn to treasury
  it('should call withdrawInflation from Gnosis', async () => {
    const FORWARDER_ETH = ADDRESS_PLACEHOLDER
    const ETH_PTN_ADDRESS = ETHPNT_ADDRESS

    const amount = 10
    const metadata = 'Should we inflate more?'

    const userData = encode(
      ['address[]', 'bytes[]'],
      [
        [ETH_PTN_ADDRESS, ETH_PTN_ADDRESS, ERC20_VAULT],
        [
          new ethers.Interface(EthPntAbi).encodeFunctionData('withdrawInflation', [FORWARDER_ETH, amount]),
          new ethers.Interface(EthPntAbi).encodeFunctionData('approve', [ERC20_VAULT, amount]),
          new ethers.Interface(ERC20VaultAbi).encodeFunctionData('pegIn(uint256,address,string,bytes,bytes4)', [
            amount,
            ETHPNT_ADDRESS,
            FINANCE_VAULT,
            '0x',
            PNETWORK_NETWORK_IDS.GNOSIS
          ])
        ]
      ]
    )
    const executionScript = encodeCallScript(
      [
        [
          pntOnGnosis.target,
          pntOnGnosis.interface.encodeFunctionData('redeem(uint256,bytes,string,bytes4)', [
            1,
            userData,
            FORWARDER_ETH,
            PNETWORK_NETWORK_IDS.MAINNET
          ])
        ]
      ].map((_args) => encodeFunctionCall(..._args))
    )
    let currentBlock = await ethers.provider.getBlockNumber()
    expect(await daoPNT.totalSupplyAt(currentBlock)).to.be.eq(20000)
    await mintPntOnGnosis(faucet.address, 10000n)
    await mintPntOnGnosis(DANDELION_VOTING_ADDRESS, 10000n)
    await stake(faucet, 10000)
    currentBlock = await ethers.provider.getBlockNumber()
    expect(await daoPNT.totalSupplyAt(currentBlock)).to.be.eq(30000)
    await grantCreateVotesPermission(acl, daoOwner, tokenHolders[0].address)
    const voteId = await openNewVoteAndReachQuorum(daoVoting, tokenHolders[0], tokenHolders, executionScript, metadata)
    await expect(daoVoting.executeVote(voteId))
      .to.emit(daoVoting, 'ExecuteVote')
      .withArgs(voteId)
      .and.to.emit(pntOnGnosis, 'Redeem')
      .withArgs(
        DANDELION_VOTING_ADDRESS,
        1,
        FORWARDER_ETH,
        // secretlint-disable-next-line
        '0x000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000003000000000000000000000000f4ea6b892853413bd9d9f1a5d3a620a0ba39c5b2000000000000000000000000f4ea6b892853413bd9d9f1a5d3a620a0ba39c5b2000000000000000000000000e396757ec7e6ac7c8e5abe7285dde47b98f22db80000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000016000000000000000000000000000000000000000000000000000000000000000443352d49b0000000000000000000000000123456789012345678901234567890123456789000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000044095ea7b3000000000000000000000000e396757ec7e6ac7c8e5abe7285dde47b98f22db8000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000124c322525d000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000f4ea6b892853413bd9d9f1a5d3a620a0ba39c5b200000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000010000f1918e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002a30783632333939363865363233313136343638374342343066383338396439333364443766376530413500000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
        PNETWORK_NETWORK_IDS.GNOSIS,
        PNETWORK_NETWORK_IDS.MAINNET
      )
  })

  it('should be possible to pegin to finance vault', async () => {
    await mintPntOnGnosis(FINANCE_VAULT, '10', '0xc0ffee')
  })

  it('should be possible to deposit rewards from a vote', async () => {
    const metadata = 'Should we deposit rewards?'
    await mintPntOnGnosis(daoTreasury.target, parseEther('200000'))
    const executionScript = encodeCallScript(
      [
        [FINANCE_VAULT, encodeVaultTransfer(pntOnGnosis.target, DANDELION_VOTING_ADDRESS, 100)],
        [pntOnGnosis.target, pntOnGnosis.interface.encodeFunctionData('approve', [REWARDS_MANAGER, 100])],
        [REWARDS_MANAGER, rewardsManager.interface.encodeFunctionData('depositForEpoch', [2, 100])]
      ].map((_args) => encodeFunctionCall(..._args))
    )
    await grantCreateVotesPermission(acl, daoOwner, tokenHolders[0].address)
    const voteId = await openNewVoteAndReachQuorum(daoVoting, tokenHolders[0], tokenHolders, executionScript, metadata)
    await expect(daoVoting.executeVote(voteId)).to.emit(daoVoting, 'ExecuteVote').withArgs(voteId)
    await expect(rewardsManager.registerRewardsForEpoch(2, [tokenHolders[1].address])).to.be.reverted
    await time.increase(35 * ONE_DAY)
    await expect(rewardsManager.registerRewardsForEpoch(2, [tokenHolders[1].address]))
      .to.emit(rewardsManager, 'RewardRegistered')
      .withArgs(2, tokenHolders[1].address, 25)
    await time.increase(130 * ONE_DAY)
    await expect(rewardsManager.registerRewardsForEpoch(2, [tokenHolders[0].address, tokenHolders[3].address]))
      .to.emit(rewardsManager, 'RewardRegistered')
      .withArgs(2, tokenHolders[0].address, 25)
      .and.to.emit(rewardsManager, 'RewardRegistered')
      .withArgs(2, tokenHolders[3].address, 25)
    await expect(rewardsManager.connect(tokenHolders[0]).claimRewardByEpoch(2)).to.be.revertedWithCustomError(
      rewardsManager,
      'TooEarly'
    )
    await expect(rewardsManager.connect(tokenHolders[1]).claimRewardByEpoch(2)).to.be.revertedWithCustomError(
      rewardsManager,
      'TooEarly'
    )
    await expect(rewardsManager.connect(tokenHolders[3]).claimRewardByEpoch(2)).to.be.revertedWithCustomError(
      rewardsManager,
      'TooEarly'
    )

    await time.increase(200 * ONE_DAY)

    const claimRewardsAndAssertTransfer = (_holder, _epoch) =>
      expect(rewardsManager.connect(_holder).claimRewardByEpoch(_epoch))
        .to.emit(pntOnGnosis, 'Transfer')
        .withArgs(REWARDS_MANAGER, _holder.address, 25)
        .and.to.emit(daoPNT, 'Transfer')
        .withArgs(_holder, ZERO_ADDRESS, 25)

    await claimRewardsAndAssertTransfer(tokenHolders[0], 2)
    await claimRewardsAndAssertTransfer(tokenHolders[1], 2)
    await claimRewardsAndAssertTransfer(tokenHolders[3], 2)

    await expect(rewardsManager.connect(tokenHolders[2]).claimRewardByEpoch(2)).to.be.revertedWithCustomError(
      rewardsManager,
      'NothingToClaim'
    )
    await expect(rewardsManager.connect(tokenHolders[2]).registerRewardsForEpoch(2, [tokenHolders[2]]))
      .to.emit(rewardsManager, 'RewardRegistered')
      .withArgs(2, tokenHolders[2].address, 25)
    await claimRewardsAndAssertTransfer(tokenHolders[2], 2)
  })
})

describe('Integration tests on Ethereum deployment', () => {
  let vault, crossExecutor, pnetwork, faucet, daoVotingV1, tokenHolders, association, ethPnt

  const TOKEN_HOLDERS_ADDRESSES = [
    '0x100a70b9e50e91367d571332E76cFa70e9307059',
    '0xc4442915B1FB44972eE4D8404cE05a8D2A1248dA',
    '0xF03f2303cC57bC5Cd63255749e86Ed8886Ca68Fc',
    '0xe0EDF3bAee2eE71903FbD43D93ce54420e5933F2'
  ]

  const pegoutPntOnEth = (_recipient, _value, _metadata) =>
    pegoutToken(vault, pnetwork, _recipient, PNT_ON_ETH_ADDRESS, _value, _metadata)

  const missingSteps = async () => {
    const CrossExecutor = await ethers.getContractFactory('CrossExecutor')
    crossExecutor = await CrossExecutor.deploy(PNT_ON_ETH_ADDRESS, ERC20_VAULT)
    await crossExecutor.whitelistOriginAddress(DANDELION_VOTING_ADDRESS)
    daoVotingV1 = await ethers.getContractAt(DandelionVotingAbi, DANDELION_VOTING_V1_ADDRESS)
    // open vote to change inflationOwner
    const executionScript = encodeCallScript(
      [
        [ETHPNT_ADDRESS, ethPnt.interface.encodeFunctionData('whitelistInflationRecipient', [crossExecutor.target])],
        [ETHPNT_ADDRESS, ethPnt.interface.encodeFunctionData('setInflationOwner', [crossExecutor.target])]
      ].map((_args) => encodeFunctionCall(..._args))
    )
    const voteId = await openNewVoteAndReachQuorum(
      daoVotingV1,
      association,
      tokenHolders,
      executionScript,
      'change inflation owner?',
      true
    )
    expect(await ethPnt.inflationRecipientsWhitelist(crossExecutor.target)).to.be.false
    await expect(daoVotingV1.executeVote(voteId))
      .to.emit(daoVotingV1, 'ExecuteVote')
      .withArgs(voteId)
      .and.to.emit(ethPnt, 'InflationRecipientWhitelisted')
      .and.to.emit(ethPnt, 'NewInflationOwner')
    expect(await ethPnt.inflationRecipientsWhitelist(crossExecutor.target)).to.be.true
    expect(await ethPnt.inflationOwner()).to.be.eq(crossExecutor.target)
  }

  beforeEach(async () => {
    const rpc = config.networks.mainnet.url
    await hardhatReset(network.provider, rpc)
    ;[faucet] = await ethers.getSigners()
    tokenHolders = await Promise.all(TOKEN_HOLDERS_ADDRESSES.map(ethers.getImpersonatedSigner))
    pnetwork = await ethers.getImpersonatedSigner(PNETWORK_ADDRESS)
    association = await ethers.getImpersonatedSigner(ASSOCIATION_ON_ETH_ADDRESS)
    ethPnt = await ethers.getContractAt(EthPntAbi, ETHPNT_ADDRESS)
    vault = await ethers.getContractAt('IErc20Vault', ERC20_VAULT)
    await sendEth(ethers, faucet, pnetwork.address, '10')
    await sendEth(ethers, faucet, association.address, '10')
    await Promise.all(TOKEN_HOLDERS_ADDRESSES.map((_address) => sendEth(ethers, faucet, _address, '10')))
    await missingSteps()
  })

  // this test is coupled with Integration tests on Gnosis deployment -> should call withdrawInflation from Gnosis
  it('should process pegOut, withdrawInflation, and pegIn to treasury', async () => {
    const metadata = encodeMetadata(ethers, {
      userData:
        // secretlint-disable-next-line
        '0x000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000003000000000000000000000000f4ea6b892853413bd9d9f1a5d3a620a0ba39c5b2000000000000000000000000f4ea6b892853413bd9d9f1a5d3a620a0ba39c5b2000000000000000000000000e396757ec7e6ac7c8e5abe7285dde47b98f22db80000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000016000000000000000000000000000000000000000000000000000000000000000443352d49b0000000000000000000000000123456789012345678901234567890123456789000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000044095ea7b3000000000000000000000000e396757ec7e6ac7c8e5abe7285dde47b98f22db8000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000124c322525d000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000f4ea6b892853413bd9d9f1a5d3a620a0ba39c5b200000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000010000f1918e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002a30783632333939363865363233313136343638374342343066383338396439333364443766376530413500000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'.replaceAll(
          ADDRESS_PLACEHOLDER.slice(2),
          crossExecutor.target.slice(2)
        ),
      sourceNetworkId: PNETWORK_NETWORK_IDS.GNOSIS,
      senderAddress: DANDELION_VOTING_ADDRESS,
      destinationNetworkId: PNETWORK_NETWORK_IDS.MAINNET,
      receiverAddress: crossExecutor.target
    })
    await expect(pegoutPntOnEth(crossExecutor.target, 1, metadata))
      .to.emit(ethPnt, 'Transfer')
      .withArgs(ZERO_ADDRESS, crossExecutor.target, 10)
      .and.to.emit(vault, 'PegIn')
      .withArgs(
        PNT_ON_ETH_ADDRESS,
        crossExecutor.target,
        10,
        FINANCE_VAULT,
        '0x',
        PNETWORK_NETWORK_IDS.MAINNET,
        PNETWORK_NETWORK_IDS.GNOSIS
      )
  })

  it('should not process pegout if not required by dandelion voting', async () => {
    const attacker = ethers.Wallet.createRandom().connect(ethers.provider)
    const metadata = encodeMetadata(ethers, {
      userData:
        // secretlint-disable-next-line
        '0x000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000003000000000000000000000000f4ea6b892853413bd9d9f1a5d3a620a0ba39c5b2000000000000000000000000f4ea6b892853413bd9d9f1a5d3a620a0ba39c5b2000000000000000000000000e396757ec7e6ac7c8e5abe7285dde47b98f22db80000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000016000000000000000000000000000000000000000000000000000000000000000443352d49b0000000000000000000000000123456789012345678901234567890123456789000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000044095ea7b3000000000000000000000000e396757ec7e6ac7c8e5abe7285dde47b98f22db8000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000124c322525d000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000f4ea6b892853413bd9d9f1a5d3a620a0ba39c5b200000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000010000f1918e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002a30783632333939363865363233313136343638374342343066383338396439333364443766376530413500000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'.replaceAll(
          ADDRESS_PLACEHOLDER,
          crossExecutor.target.slice(2)
        ),
      sourceNetworkId: PNETWORK_NETWORK_IDS.GNOSIS,
      senderAddress: attacker.address,
      destinationNetworkId: PNETWORK_NETWORK_IDS.MAINNET,
      receiverAddress: crossExecutor.target
    })
    await expect(pegoutPntOnEth(crossExecutor.target, 1, metadata))
      .to.be.revertedWithCustomError(crossExecutor, 'InvalidOriginAddress')
      .withArgs(attacker.address)
  })
})
