const { mineUpTo, time } = require('@nomicfoundation/hardhat-network-helpers')
const { expect } = require('chai')
const { config, ethers, network, upgrades } = require('hardhat')

const AclAbi = require('../../lib/abi/ACL.json')
const DandelionVotingAbi = require('../../lib/abi/DandelionVoting.json')
const DaoPntAbi = require('../../lib/abi/daoPNT.json')
const ERC20VaultAbi = require('../../lib/abi/ERC20Vault.json')
const EthPntAbi = require('../../lib/abi/ethPNT.json')
const FinanceAbi = require('../../lib/abi/Finance.json')
const pntOnPolygonAbi = require('../../lib/abi/PNTonPolygon.json')
const VaultAbi = require('../../lib/abi/Vault.json')
const {
  ADDRESSES: {
    GNOSIS: {
      SAFE_ADDRESS,
      EPOCHS_MANAGER,
      STAKING_MANAGER,
      STAKING_MANAGER_LM,
      STAKING_MANAGER_RM,
      REGISTRATION_MANAGER,
      LENDING_MANAGER,
      FEES_MANAGER,
      REWARDS_MANAGER,
      ACL_ADDRESS,
      DANDELION_VOTING_ADDRESS,
      FINANCE_VAULT,
      FINANCE,
      DAOPNT_ON_GNOSIS_ADDRESS,
      PNT_ON_GNOSIS_MINTER,
      FORWARDER_ON_GNOSIS
    },
    MAINNET: {
      ERC20_VAULT,
      DANDELION_VOTING_ADDRESS: DANDELION_VOTING_V1_ADDRESS,
      PNT_ON_ETH_ADDRESS,
      ETHPNT_ADDRESS,
      PNETWORK_ADDRESS,
      ASSOCIATION_ON_ETH_ADDRESS
    },
    POLYGON: { PNT_ON_POLYGON_ADDRESS, FORWARDER_ON_POLYGON, PNT_ON_POLYGON_MINTER },
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

const { CREATE_VOTES_ROLE, CREATE_PAYMENTS_ROLE } = getAllRoles(ethers)

const USER_ADDRESS = '0xdDb5f4535123DAa5aE343c24006F4075aBAF5F7B'
const ADDRESS_PLACEHOLDER = '0x0123456789012345678901234567890123456789'

const FORWARDER_DELEGATE_VOTE_USER_DATA =
  // secretlint-disable-next-line
  '0x0000000000000000000000000000000000000000000000000000000000000040000000000000000000000000ddb5f4535123daa5ae343c24006f4075abaf5f7b00000000000000000000000000000000000000000000000000000000000001600000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000cf759bccfef5f322af58adae2d28885658b5e02000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000064571eed31000000000000000000000000ddb5f4535123daa5ae343c24006f4075abaf5f7b0000000000000000000000000000000000000000000000000000000000000025000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000'
const FORWARDER_STAKE_USER_DATA =
  // secretlint-disable-next-line
  '0x0000000000000000000000000000000000000000000000000000000000000040000000000000000000000000ddb5f4535123daa5ae343c24006f4075abaf5f7b0000000000000000000000000000000000000000000000000000000000000220000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000020000000000000000000000000123456789012345678901234567890123456789000000000000000000000000dee8ebe2b7152eccd935fd67134bf1bad55302bc0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000044095ea7b3000000000000000000000000dee8ebe2b7152eccd935fd67134bf1bad55302bc0000000000000000000000000000000000000000000000000162ea854d0fc0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000642b54f551000000000000000000000000ddb5f4535123daa5ae343c24006f4075abaf5f7b0000000000000000000000000000000000000000000000000162ea854d0fc0000000000000000000000000000000000000000000000000000000000000093a8000000000000000000000000000000000000000000000000000000000'
const WITHDRAW_INFLATION_FROM_GNOSIS_USER_DATA =
  // secretlint-disable-next-line
  '0x000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000003000000000000000000000000f4ea6b892853413bd9d9f1a5d3a620a0ba39c5b2000000000000000000000000f4ea6b892853413bd9d9f1a5d3a620a0ba39c5b2000000000000000000000000e396757ec7e6ac7c8e5abe7285dde47b98f22db80000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000016000000000000000000000000000000000000000000000000000000000000000443352d49b0000000000000000000000000123456789012345678901234567890123456789000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000044095ea7b3000000000000000000000000e396757ec7e6ac7c8e5abe7285dde47b98f22db8000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000124c322525d000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000f4ea6b892853413bd9d9f1a5d3a620a0ba39c5b200000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000010000f1918e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002a30783632333939363865363233313136343638374342343066383338396439333364443766376530413500000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'
const WITHDRAW_INFLATION_FROM_GNOSIS_USER_DATA_2 =
  // secretlint-disable-next-line
  '0x000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000003000000000000000000000000f4ea6b892853413bd9d9f1a5d3a620a0ba39c5b2000000000000000000000000f4ea6b892853413bd9d9f1a5d3a620a0ba39c5b2000000000000000000000000e396757ec7e6ac7c8e5abe7285dde47b98f22db80000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000016000000000000000000000000000000000000000000000000000000000000000443352d49b00000000000000000000000001234567890123456789012345678901234567890000000000000000000000000000000000000000000000056bc75e2d63100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000044095ea7b3000000000000000000000000e396757ec7e6ac7c8e5abe7285dde47b98f22db80000000000000000000000000000000000000000000000056bc75e2d63100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000124c322525d0000000000000000000000000000000000000000000000056bc75e2d63100000000000000000000000000000f4ea6b892853413bd9d9f1a5d3a620a0ba39c5b200000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000010000f1918e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002a30786631663635363861373635353964383563463638453635393766413538373534343138346444343600000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'

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
    EpochsManager,
    epochsManager,
    StakingManager,
    stakingManager,
    StakingManagerPermissioned,
    stakingManagerLm,
    stakingManagerRm,
    LendingManager,
    lendingManager,
    RegistrationManager,
    registrationManager,
    FeesManager,
    feesManager,
    RewardsManager,
    rewardsManager,
    ForwarderHost,
    forwarder,
    daoPNT,
    daoTreasury,
    finance

  const TOKEN_HOLDERS_ADDRESSES = [
    '0xc4442915B1FB44972eE4D8404cE05a8D2A1248dA',
    '0xe8b43e7d55337ab735f6e1932d4a1e98de70eabc',
    '0x9ad4550759389ca7f0488037daa4332b1f30cdac',
    '0x100a70b9e50e91367d571332e76cfa70e9307059'
  ]

  const missingSteps = async () => {
    const MockPToken = await ethers.getContractFactory('MockPTokenERC20')
    pntOnGnosis = await MockPToken.deploy('Host Token (pToken)', 'HTKN', pntMinter.address, PNETWORK_NETWORK_IDS.GNOSIS)
    await stakingManager.connect(daoOwner).changeToken(pntOnGnosis.target)
    await stakingManagerLm.connect(daoOwner).changeToken(pntOnGnosis.target)
    await stakingManagerRm.connect(daoOwner).changeToken(pntOnGnosis.target)
    await lendingManager.connect(daoOwner).changeToken(pntOnGnosis.target)
    await registrationManager.connect(daoOwner).changeToken(pntOnGnosis.target)
    await rewardsManager.connect(daoOwner).changeToken(pntOnGnosis.target)
    ForwarderHost = await ethers.getContractFactory('ForwarderHost')
    forwarder = await ForwarderHost.deploy(pntOnGnosis.target)
    await forwarder.whitelistOriginAddress(FORWARDER_ON_POLYGON)
    await daoVoting.connect(daoOwner).changeForwarder(forwarder.target)
    await mintPntOnGnosis(forwarder.target, ethers.parseUnits('1'))
    await mintPntOnGnosis(daoVoting.target, ethers.parseUnits('1'))
  }

  const checkInitialized = async () => {
    // check implementations cannot be initialized
    const _checkInitialized = async (_factory, _proxyAddress, _initArgs) => {
      const implAddress = await upgrades.erc1967.getImplementationAddress(_proxyAddress)
      const contract = _factory.attach(implAddress)
      await expect(contract.initialize(..._initArgs)).to.be.revertedWith(
        'Initializable: contract is already initialized'
      )
    }
    await _checkInitialized(EpochsManager, epochsManager.target, [0, 0])
    await _checkInitialized(StakingManager, stakingManager.target, [ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, 0])
    await _checkInitialized(StakingManagerPermissioned, stakingManagerLm.target, [
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      0
    ])
    await _checkInitialized(StakingManagerPermissioned, stakingManagerRm.target, [
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      0
    ])
    await _checkInitialized(LendingManager, lendingManager.target, [
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      0
    ])
    await _checkInitialized(RegistrationManager, registrationManager.target, [
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      ZERO_ADDRESS
    ])
    await _checkInitialized(FeesManager, feesManager.target, [
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      0
    ])
    await _checkInitialized(RewardsManager, rewardsManager.target, [
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      0
    ])
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

    EpochsManager = await ethers.getContractFactory('EpochsManager')
    StakingManager = await ethers.getContractFactory('StakingManager')
    StakingManagerPermissioned = await ethers.getContractFactory('StakingManagerPermissioned')
    LendingManager = await ethers.getContractFactory('LendingManager')
    RegistrationManager = await ethers.getContractFactory('RegistrationManager')
    FeesManager = await ethers.getContractFactory('FeesManager')
    RewardsManager = await ethers.getContractFactory('RewardsManager')

    acl = await ethers.getContractAt(AclAbi, ACL_ADDRESS)
    daoVoting = await ethers.getContractAt(DandelionVotingAbi, DANDELION_VOTING_ADDRESS)
    daoTreasury = await ethers.getContractAt(VaultAbi, FINANCE_VAULT)
    finance = await ethers.getContractAt(FinanceAbi, FINANCE)
    daoPNT = await ethers.getContractAt(DaoPntAbi, DAOPNT_ON_GNOSIS_ADDRESS)
    epochsManager = EpochsManager.attach(EPOCHS_MANAGER)
    stakingManager = StakingManager.attach(STAKING_MANAGER)
    stakingManagerLm = StakingManagerPermissioned.attach(STAKING_MANAGER_LM)
    stakingManagerRm = StakingManagerPermissioned.attach(STAKING_MANAGER_RM)
    lendingManager = LendingManager.attach(LENDING_MANAGER)
    registrationManager = RegistrationManager.attach(REGISTRATION_MANAGER)
    feesManager = EpochsManager.attach(FEES_MANAGER)
    rewardsManager = RewardsManager.attach(REWARDS_MANAGER)

    await missingSteps()

    await checkInitialized()

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
    const currentEpoch = await epochsManager.currentEpoch()
    await mintPntOnGnosis(faucet.address, ethers.parseEther('400000', await pntOnGnosis.decimals()))
    await pntOnGnosis.connect(faucet).approve(LENDING_MANAGER, amount)
    const balancePre = await pntOnGnosis.balanceOf(faucet.address)
    await expect(lendingManager.lend(faucet.address, amount, ONE_DAY * 90))
      .to.emit(lendingManager, 'Lended')
      .withArgs(faucet.address, currentEpoch + 1n, currentEpoch + 2n, amount)
      .and.to.emit(stakingManagerLm, 'Staked')
      .withArgs(faucet.address, amount, ONE_DAY * 90)
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
    const CROSS_EXECUTOR_ETH = ADDRESS_PLACEHOLDER
    const ETH_PTN_ADDRESS = ETHPNT_ADDRESS

    const amount = 10
    const metadata = 'Should we inflate more?'

    const userData = encode(
      ['address[]', 'bytes[]'],
      [
        [ETH_PTN_ADDRESS, ETH_PTN_ADDRESS, ERC20_VAULT],
        [
          new ethers.Interface(EthPntAbi).encodeFunctionData('withdrawInflation', [CROSS_EXECUTOR_ETH, amount]),
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
            CROSS_EXECUTOR_ETH,
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
        CROSS_EXECUTOR_ETH,
        // secretlint-disable-next-line
        WITHDRAW_INFLATION_FROM_GNOSIS_USER_DATA,
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
    const epoch = (await epochsManager.currentEpoch()) + 1n
    const epochDuration = await epochsManager.epochDuration()
    const startFirstEpochTimestamp = await epochsManager.startFirstEpochTimestamp()
    // goto the beginning of next epoch
    await time.increaseTo(startFirstEpochTimestamp + epoch * epochDuration + BigInt(ONE_DAY))
    expect(await epochsManager.currentEpoch()).to.be.eq(epoch)
    const executionScript = encodeCallScript(
      [
        [FINANCE_VAULT, encodeVaultTransfer(pntOnGnosis.target, DANDELION_VOTING_ADDRESS, 100)],
        [pntOnGnosis.target, pntOnGnosis.interface.encodeFunctionData('approve', [REWARDS_MANAGER, 100])],
        [REWARDS_MANAGER, rewardsManager.interface.encodeFunctionData('depositForEpoch', [epoch, 100])]
      ].map((_args) => encodeFunctionCall(..._args))
    )
    await grantCreateVotesPermission(acl, daoOwner, tokenHolders[0].address)
    const voteId = await openNewVoteAndReachQuorum(daoVoting, tokenHolders[0], tokenHolders, executionScript, metadata)
    await expect(daoVoting.executeVote(voteId)).to.emit(daoVoting, 'ExecuteVote').withArgs(voteId)
    await expect(rewardsManager.registerRewardsForEpoch(epoch, [tokenHolders[1].address])).to.be.reverted
    // goto next epoch
    await time.increase(35 * ONE_DAY)
    await expect(rewardsManager.registerRewardsForEpoch(epoch, [tokenHolders[1].address]))
      .to.emit(rewardsManager, 'RewardRegistered')
      .withArgs(epoch, tokenHolders[1].address, 25)
    await time.increase(130 * ONE_DAY)
    await expect(rewardsManager.registerRewardsForEpoch(epoch, [tokenHolders[0].address, tokenHolders[3].address]))
      .to.emit(rewardsManager, 'RewardRegistered')
      .withArgs(epoch, tokenHolders[0].address, 25)
      .and.to.emit(rewardsManager, 'RewardRegistered')
      .withArgs(epoch, tokenHolders[3].address, 25)
    await expect(rewardsManager.connect(tokenHolders[0]).claimRewardByEpoch(epoch)).to.be.revertedWithCustomError(
      rewardsManager,
      'TooEarly'
    )
    await expect(rewardsManager.connect(tokenHolders[1]).claimRewardByEpoch(epoch)).to.be.revertedWithCustomError(
      rewardsManager,
      'TooEarly'
    )
    await expect(rewardsManager.connect(tokenHolders[3]).claimRewardByEpoch(epoch)).to.be.revertedWithCustomError(
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

    await claimRewardsAndAssertTransfer(tokenHolders[0], epoch)
    await claimRewardsAndAssertTransfer(tokenHolders[1], epoch)
    await claimRewardsAndAssertTransfer(tokenHolders[3], epoch)

    await expect(rewardsManager.connect(tokenHolders[2]).claimRewardByEpoch(epoch)).to.be.revertedWithCustomError(
      rewardsManager,
      'NothingToClaim'
    )
    await expect(rewardsManager.connect(tokenHolders[2]).registerRewardsForEpoch(epoch, [tokenHolders[2]]))
      .to.emit(rewardsManager, 'RewardRegistered')
      .withArgs(epoch, tokenHolders[2].address, 25)
    await claimRewardsAndAssertTransfer(tokenHolders[2], epoch)
  })

  const approveAndStake = async () => {
    await mintPntOnGnosis(user.address, ethers.parseUnits('110'))

    // approve
    await expect(
      user.sendTransaction({
        to: pntOnGnosis.target,
        // secretlint-disable-next-line
        data: '0x095ea7b3000000000000000000000000dee8ebe2b7152eccd935fd67134bf1bad55302bc000000000000000000000000000000000000000000000005f68e8131ecf80000',
        value: 0
      })
    )
      .to.emit(pntOnGnosis, 'Approval')
      .withArgs(user.address, stakingManager.target, ethers.parseUnits('110'))

    // stake
    await expect(
      user.sendTransaction({
        to: '0xdEE8ebE2b7152ECCd935fd67134BF1bad55302BC',
        // secretlint-disable-next-line
        data: '0x2b54f551000000000000000000000000ddb5f4535123daa5ae343c24006f4075abaf5f7b0000000000000000000000000000000000000000000000008ac7230489e800000000000000000000000000000000000000000000000000000000000000093a80',
        value: 0
      })
    )
      .to.emit(stakingManager, 'Staked')
      .withArgs(user.address, ethers.parseUnits('10'), 604800)
  }

  it('[dapp] should propose correct approve transaction for staking, stake, and unstake to mainnet', async () => {
    await approveAndStake()

    // unstake to mainnet
    await expect(
      user.sendTransaction({
        to: '0xdEE8ebE2b7152ECCd935fd67134BF1bad55302BC',
        // secretlint-disable-next-line
        data: '0x810f30da0000000000000000000000000000000000000000000000008ac7230489e80000005fe7f900000000000000000000000000000000000000000000000000000000',
        value: 0
      })
    ).to.be.revertedWithCustomError(stakingManager, 'UnfinishedStakingPeriod')
    await time.increase(ONE_DAY * 8)
    await expect(
      user.sendTransaction({
        to: '0xdEE8ebE2b7152ECCd935fd67134BF1bad55302BC',
        // secretlint-disable-next-line
        data: '0x810f30da0000000000000000000000000000000000000000000000008ac7230489e80000005fe7f900000000000000000000000000000000000000000000000000000000',
        value: 0
      })
    )
      .to.emit(daoPNT, 'Transfer')
      .withArgs(user.address, ZERO_ADDRESS, ethers.parseUnits('10'))
      .to.emit(pntOnGnosis, 'Redeem')
      .withArgs(
        stakingManager.target,
        ethers.parseUnits('10'),
        user.address.slice(2).toLowerCase(),
        '0x',
        PNETWORK_NETWORK_IDS.GNOSIS,
        PNETWORK_NETWORK_IDS.MAINNET
      )
      .to.emit(stakingManager, 'Unstaked')
      .withArgs(user.address, ethers.parseUnits('10'))
  })

  it('[dapp] should propose correct approve transaction for staking, stake, and unstake to polygon', async () => {
    await approveAndStake()

    // unstake to polygon
    await expect(
      user.sendTransaction({
        to: '0xdEE8ebE2b7152ECCd935fd67134BF1bad55302BC',
        // secretlint-disable-next-line
        data: '0x810f30da0000000000000000000000000000000000000000000000008ac7230489e800000075dd4c00000000000000000000000000000000000000000000000000000000',
        value: 0
      })
    ).to.be.revertedWithCustomError(stakingManager, 'UnfinishedStakingPeriod')
    await time.increase(ONE_DAY * 8)
    await expect(
      user.sendTransaction({
        to: '0xdEE8ebE2b7152ECCd935fd67134BF1bad55302BC',
        // secretlint-disable-next-line
        data: '0x810f30da0000000000000000000000000000000000000000000000008ac7230489e800000075dd4c00000000000000000000000000000000000000000000000000000000',
        value: 0
      })
    )
      .to.emit(daoPNT, 'Transfer')
      .withArgs(user.address, ZERO_ADDRESS, ethers.parseUnits('10'))
      .to.emit(pntOnGnosis, 'Redeem')
      .withArgs(
        stakingManager.target,
        ethers.parseUnits('10'),
        user.address.slice(2).toLowerCase(),
        '0x',
        PNETWORK_NETWORK_IDS.GNOSIS,
        PNETWORK_NETWORK_IDS.POLYGON
      )
      .to.emit(stakingManager, 'Unstaked')
      .withArgs(user.address, ethers.parseUnits('10'))
  })

  it('[dapp] should propose correct approve transaction for staking, stake, and unstake to bsc', async () => {
    await approveAndStake()

    // unstake to bsc
    await expect(
      user.sendTransaction({
        to: '0xdEE8ebE2b7152ECCd935fd67134BF1bad55302BC',
        // secretlint-disable-next-line
        data: '0x810f30da0000000000000000000000000000000000000000000000008ac7230489e8000000e4b17000000000000000000000000000000000000000000000000000000000',
        value: 0
      })
    ).to.be.revertedWithCustomError(stakingManager, 'UnfinishedStakingPeriod')
    await time.increase(ONE_DAY * 8)
    await expect(
      user.sendTransaction({
        to: '0xdEE8ebE2b7152ECCd935fd67134BF1bad55302BC',
        // secretlint-disable-next-line
        data: '0x810f30da0000000000000000000000000000000000000000000000008ac7230489e8000000e4b17000000000000000000000000000000000000000000000000000000000',
        value: 0
      })
    )
      .to.emit(daoPNT, 'Transfer')
      .withArgs(user.address, ZERO_ADDRESS, ethers.parseUnits('10'))
      .to.emit(pntOnGnosis, 'Redeem')
      .withArgs(
        stakingManager.target,
        ethers.parseUnits('10'),
        user.address.slice(2).toLowerCase(),
        '0x',
        PNETWORK_NETWORK_IDS.GNOSIS,
        PNETWORK_NETWORK_IDS.BSC
      )
      .to.emit(stakingManager, 'Unstaked')
      .withArgs(user.address, ethers.parseUnits('10'))
  })

  it('[dapp] should propose correct approve transaction for staking, stake, and unstake to gnosis', async () => {
    await approveAndStake()

    // unstake to gnosis
    await expect(
      user.sendTransaction({
        to: '0xdEE8ebE2b7152ECCd935fd67134BF1bad55302BC',
        // secretlint-disable-next-line
        data: '0x810f30da0000000000000000000000000000000000000000000000008ac7230489e8000000f1918e00000000000000000000000000000000000000000000000000000000',
        value: 0
      })
    ).to.be.revertedWithCustomError(stakingManager, 'UnfinishedStakingPeriod')
    await time.increase(ONE_DAY * 8)
    await expect(
      user.sendTransaction({
        to: '0xdEE8ebE2b7152ECCd935fd67134BF1bad55302BC',
        // secretlint-disable-next-line
        data: '0x810f30da0000000000000000000000000000000000000000000000008ac7230489e8000000f1918e00000000000000000000000000000000000000000000000000000000',
        value: 0
      })
    )
      .to.emit(daoPNT, 'Transfer')
      .withArgs(user.address, ZERO_ADDRESS, ethers.parseUnits('10'))
      .to.emit(pntOnGnosis, 'Transfer')
      .withArgs(stakingManager.target, user.address, ethers.parseUnits('10'))
      .to.emit(stakingManager, 'Unstaked')
      .withArgs(user.address, ethers.parseUnits('10'))
  })

  it('[dapp] should stake from forwarder call', async () => {
    expect(await daoPNT.balanceOf(USER_ADDRESS)).to.be.eq(ethers.parseUnits('0'))
    const smBalance = await pntOnGnosis.balanceOf(STAKING_MANAGER)
    const metadata = encodeMetadata(ethers, {
      userData:
        // secretlint-disable-next-line
        FORWARDER_STAKE_USER_DATA.replaceAll(ADDRESS_PLACEHOLDER.slice(2), pntOnGnosis.target.slice(2)),
      sourceNetworkId: PNETWORK_NETWORK_IDS.POLYGON,
      senderAddress: FORWARDER_ON_POLYGON,
      destinationNetworkId: PNETWORK_NETWORK_IDS.GNOSIS,
      receiverAddress: forwarder.target
    })
    await expect(mintPToken(pntOnGnosis, pntMinter, forwarder.target, 100000000000000000n, metadata)).to.emit(
      stakingManager,
      'Staked'
    )
    expect(await daoPNT.balanceOf(USER_ADDRESS)).to.be.eq(ethers.parseUnits('0.0999'))
    expect(await pntOnGnosis.balanceOf(STAKING_MANAGER)).to.be.eq(smBalance + ethers.parseUnits('0.0999'))
  })

  it('[dapp] should delegateVote from forwarder call', async () => {
    const stakedAmount = ethers.parseUnits('10')
    await mintPntOnGnosis(user.address, stakedAmount)
    await stake(user, stakedAmount, ONE_DAY * 10)
    await grantCreateVotesPermission(acl, daoOwner, tokenHolders[0].address)
    await daoVoting.connect(tokenHolders[0]).newVote('0x', 'do something?', false)
    const voteId = await daoVoting.votesLength()
    const metadata = encodeMetadata(ethers, {
      userData:
        // secretlint-disable-next-line
        FORWARDER_DELEGATE_VOTE_USER_DATA.replace(
          '0000000000000000000000000000000000000000000000000000000000000025',
          ethers.zeroPadValue(ethers.toBeHex(voteId), 32).slice(2)
        ),
      sourceNetworkId: PNETWORK_NETWORK_IDS.POLYGON,
      senderAddress: FORWARDER_ON_POLYGON,
      destinationNetworkId: PNETWORK_NETWORK_IDS.GNOSIS,
      receiverAddress: forwarder.target
    })
    await expect(mintPToken(pntOnGnosis, pntMinter, forwarder.target, 1n, metadata))
      .to.emit(daoVoting, 'CastVote')
      .withArgs(voteId, user.address, true, stakedAmount)
    expect(await daoPNT.balanceOf(USER_ADDRESS)).to.be.eq(stakedAmount)
  })

  it('[dapp] should vote', async () => {
    const stakedAmount = ethers.parseUnits('10')
    await mintPntOnGnosis(user.address, stakedAmount)
    await stake(user, stakedAmount, ONE_DAY * 10)
    expect(await daoPNT.balanceOf(USER_ADDRESS)).to.be.eq(stakedAmount)
    await grantCreateVotesPermission(acl, daoOwner, tokenHolders[0].address)
    await daoVoting.connect(tokenHolders[0]).newVote('0x', 'do something?', false)
    const voteId = await daoVoting.votesLength()
    await expect(
      user.sendTransaction({
        to: DANDELION_VOTING_ADDRESS,
        // secretlint-disable-next-line
        data: '0xc9d27afe00000000000000000000000000000000000000000000000000000000000000250000000000000000000000000000000000000000000000000000000000000001'.replace(
          '0000000000000000000000000000000000000000000000000000000000000025',
          ethers.zeroPadValue(ethers.toBeHex(voteId), 32).slice(2)
        )
      })
    )
      .to.emit(daoVoting, 'CastVote')
      .withArgs(voteId, user.address, true, stakedAmount)
  })

  it('[dapp] should open a vote to transfer from vault', async () => {
    await mintPntOnGnosis(tokenHolders[0], ethers.parseUnits('200000'))
    await mintPntOnGnosis(daoTreasury.target, ethers.parseUnits('1000000'))
    await stake(tokenHolders[0], ethers.parseUnits('200000'))
    await daoVoting
      .connect(tokenHolders[0])
      .newVote(
        '0x000000016239968e6231164687cb40f8389d933dd7f7e0a500000064beabacc8000000000000000000000000f4ea6b892853413bd9d9f1a5d3a620a0ba39c5b2000000000000000000000000f1f6568a76559d85cf68e6597fa587544184dd4600000000000000000000000000000000000000000000000ad78ebc5ac6200000'.replace(
          'f4ea6b892853413bd9d9f1a5d3a620a0ba39c5b2',
          pntOnGnosis.target.slice(2)
        ),
        'A https://ipfs.io/ipfs/QmUmAhPhF7ABGZ7ypbDoqtbmqjSQDHL7p7y87rXAH5acvJ',
        false
      )
    const voteId = await daoVoting.votesLength()
    await Promise.all(tokenHolders.map((_holder) => daoVoting.connect(_holder).vote(voteId, true)))
    await time.increase(ONE_DAY * 4)
    await expect(daoVoting.executeVote(voteId))
      .to.emit(daoVoting, 'ExecuteVote')
      .withArgs(voteId)
      .and.to.emit(pntOnGnosis, 'Transfer')
      .withArgs(daoTreasury.target, ASSOCIATION_ON_ETH_ADDRESS, ethers.parseUnits('200'))
      .and.to.emit(daoTreasury, 'VaultTransfer')
      .withArgs(pntOnGnosis.target, ASSOCIATION_ON_ETH_ADDRESS, ethers.parseUnits('200'))
  })

  it('[dapp] should open a vote to withdraw inflation', async () => {
    await mintPntOnGnosis(tokenHolders[0], ethers.parseUnits('200000'))
    await mintPntOnGnosis(daoTreasury.target, ethers.parseUnits('1000000'))
    await stake(tokenHolders[0], ethers.parseUnits('200000'))
    await daoVoting.connect(tokenHolders[0]).newVote(
      // secretlint-disable-next-line
      '0x000000010259461eed4d76d4f0f900f9035f6c4dfb39159a000004a408e1e4d3000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000440005fe7f90000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003a0000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000003000000000000000000000000f4ea6b892853413bd9d9f1a5d3a620a0ba39c5b2000000000000000000000000f4ea6b892853413bd9d9f1a5d3a620a0ba39c5b2000000000000000000000000e396757ec7e6ac7c8e5abe7285dde47b98f22db80000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000016000000000000000000000000000000000000000000000000000000000000000443352d49b00000000000000000000000001234567890123456789012345678901234567890000000000000000000000000000000000000000000000056bc75e2d63100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000044095ea7b3000000000000000000000000e396757ec7e6ac7c8e5abe7285dde47b98f22db80000000000000000000000000000000000000000000000056bc75e2d63100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000124c322525d0000000000000000000000000000000000000000000000056bc75e2d63100000000000000000000000000000f4ea6b892853413bd9d9f1a5d3a620a0ba39c5b200000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000010000f1918e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002a30786631663635363861373635353964383563463638453635393766413538373534343138346444343600000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002a30783031323334353637383930313233343536373839303132333435363738393031323334353637383900000000000000000000000000000000000000000000'.replace(
        '0259461eed4d76d4f0f900f9035f6c4dfb39159a',
        pntOnGnosis.target.slice(2)
      ),
      'A https://ipfs.io/ipfs/QmUmAhPhF7ABGZ7ypbDoqtbmqjSQDHL7p7y87rXAH5acvJ',
      false
    )
    const voteId = await daoVoting.votesLength()
    await Promise.all(tokenHolders.map((_holder) => daoVoting.connect(_holder).vote(voteId, true)))
    await time.increase(ONE_DAY * 4)
    await expect(daoVoting.executeVote(voteId))
      .to.emit(daoVoting, 'ExecuteVote')
      .withArgs(voteId)
      .and.to.emit(pntOnGnosis, 'Transfer')
      .withArgs(daoVoting.target, ZERO_ADDRESS, 1)
      .and.to.emit(pntOnGnosis, 'Redeem')
      .withArgs(
        daoVoting.target,
        1,
        ADDRESS_PLACEHOLDER,
        WITHDRAW_INFLATION_FROM_GNOSIS_USER_DATA_2,
        PNETWORK_NETWORK_IDS.GNOSIS,
        PNETWORK_NETWORK_IDS.MAINNET
      )
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
        WITHDRAW_INFLATION_FROM_GNOSIS_USER_DATA.replaceAll(
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

  it('[dapp] should process pegOut, withdrawInflation, and pegIn to treasury (2)', async () => {
    const metadata = encodeMetadata(ethers, {
      userData:
        // secretlint-disable-next-line
        WITHDRAW_INFLATION_FROM_GNOSIS_USER_DATA_2.replaceAll(
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
      .withArgs(ZERO_ADDRESS, crossExecutor.target, ethers.parseUnits('100'))
      .and.to.emit(vault, 'PegIn')
      .withArgs(
        PNT_ON_ETH_ADDRESS,
        crossExecutor.target,
        ethers.parseUnits('100'),
        ASSOCIATION_ON_ETH_ADDRESS,
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
        WITHDRAW_INFLATION_FROM_GNOSIS_USER_DATA.replaceAll(ADDRESS_PLACEHOLDER, crossExecutor.target.slice(2)),
      sourceNetworkId: PNETWORK_NETWORK_IDS.GNOSIS,
      senderAddress: attacker.address,
      destinationNetworkId: PNETWORK_NETWORK_IDS.MAINNET,
      receiverAddress: crossExecutor.target
    })
    await expect(pegoutPntOnEth(crossExecutor.target, 1, metadata))
      .to.be.revertedWithCustomError(crossExecutor, 'InvalidOriginAddress')
      .withArgs(attacker.address)
  })

  it('should open a vote for whitelisting and changing inflation owner', async () => {
    expect(await ethPnt.inflationOwner()).to.be.eq(crossExecutor.target)
    const INFLATION_OWNER_SLOT = '0x131' // 305 (found brute forcing eth_getStorageAt())
    await ethers.provider.send('hardhat_setStorageAt', [
      ethPnt.target,
      INFLATION_OWNER_SLOT,
      ethers.zeroPadValue(daoVotingV1.target, 32)
    ])
    expect(await ethPnt.inflationOwner()).to.be.eq(daoVotingV1.target)
    await daoVotingV1.connect(association).newVote(
      // secretlint-disable-next-line
      '0x00000001f4ea6b892853413bd9d9f1a5d3a620a0ba39c5b20000002463d3e0f90000000000000000000000000123456789012345678901234567890123456789f4ea6b892853413bd9d9f1a5d3a620a0ba39c5b2000000246c5fbfa40000000000000000000000000123456789012345678901234567890123456789',
      'a https://ipfs.io/ipfs/QmUmAhPhF7ABGZ7ypbDoqtbmqjSQDHL7p7y87rXAH5acvJ',
      false
    )
    const voteId = await daoVotingV1.votesLength()
    await Promise.all(tokenHolders.map((_holder) => daoVotingV1.connect(_holder).vote(voteId, true)))
    const vote = await daoVotingV1.getVote(voteId)
    await mineUpTo(vote[3] + 1n)
    await expect(daoVotingV1.connect(association).executeVote(voteId))
      .to.emit(daoVotingV1, 'ExecuteVote')
      .withArgs(voteId)
      .and.to.emit(ethPnt, 'InflationRecipientWhitelisted')
      .withArgs(ADDRESS_PLACEHOLDER)
      .and.to.emit(ethPnt, 'NewInflationOwner')
      .withArgs(ADDRESS_PLACEHOLDER)
  })
})

describe('Integration tests on Polygon deployment', () => {
  let pntOnPolygon, faucet, minter, user, forwarder
  const missingSteps = async () => {
    await mintPToken(pntOnPolygon, minter, user.address, ethers.parseEther('1'))
    await pntOnPolygon.connect(user).transfer(FORWARDER_ON_POLYGON, ethers.parseUnits('1'))
  }

  beforeEach(async () => {
    const rpc = config.networks.polygon.url
    await hardhatReset(network.provider, rpc)
    pntOnPolygon = await ethers.getContractAt(pntOnPolygonAbi, PNT_ON_POLYGON_ADDRESS)
    forwarder = await ethers.getContractAt('IForwarder', FORWARDER_ON_POLYGON)
    minter = await ethers.getImpersonatedSigner(PNT_ON_POLYGON_MINTER)
    ;[faucet] = await ethers.getSigners()
    user = await ethers.getImpersonatedSigner(USER_ADDRESS)
    await sendEth(ethers, faucet, user.address, '100')
    await missingSteps()
  })

  it('[dapp] should call forwarder for staking', async () => {
    await expect(
      forwarder.connect(user).call(
        '100000000000000000',
        FORWARDER_ON_GNOSIS,
        // secretlint-disable-next-line
        '0x000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000020000000000000000000000000123456789012345678901234567890123456789000000000000000000000000dee8ebe2b7152eccd935fd67134bf1bad55302bc0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000044095ea7b3000000000000000000000000dee8ebe2b7152eccd935fd67134bf1bad55302bc0000000000000000000000000000000000000000000000000162ea854d0fc0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000642b54f551000000000000000000000000ddb5f4535123daa5ae343c24006f4075abaf5f7b0000000000000000000000000000000000000000000000000162ea854d0fc0000000000000000000000000000000000000000000000000000000000000093a8000000000000000000000000000000000000000000000000000000000',
        PNETWORK_NETWORK_IDS.GNOSIS
      )
    )
      .to.emit(pntOnPolygon, 'Redeem')
      .withArgs(
        forwarder.target,
        100000000000000000n,
        FORWARDER_ON_GNOSIS.toLowerCase().slice(2),
        // secretlint-disable-next-line
        FORWARDER_STAKE_USER_DATA,
        '0x00000000',
        PNETWORK_NETWORK_IDS.GNOSIS
      )
  })

  it('[dapp] should call forwarder for voting', async () => {
    await expect(
      forwarder.connect(user).call(
        '0',
        FORWARDER_ON_GNOSIS,
        // secretlint-disable-next-line
        '0x0000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000cf759bccfef5f322af58adae2d28885658b5e02000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000064571eed31000000000000000000000000ddb5f4535123daa5ae343c24006f4075abaf5f7b0000000000000000000000000000000000000000000000000000000000000025000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000',
        PNETWORK_NETWORK_IDS.GNOSIS
      )
    )
      .to.emit(pntOnPolygon, 'Redeem')
      .withArgs(
        forwarder.target,
        1n,
        FORWARDER_ON_GNOSIS.toLowerCase().slice(2),
        // secretlint-disable-next-line
        FORWARDER_DELEGATE_VOTE_USER_DATA,
        '0x00000000',
        PNETWORK_NETWORK_IDS.GNOSIS
      )
  })
})
