const { mineUpTo, time } = require('@nomicfoundation/hardhat-network-helpers')
const { expect } = require('chai')
const hre = require('hardhat')

const {
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
  ERC20_VAULT,
  PNT_ON_ETH_ADDRESS,
  DANDELION_VOTING_V1_ADDRESS,
  ETHPNT_ADDRESS
} = require('../../tasks/config')
const AclAbi = require('../abi/ACL.json')
const DandelionVotingAbi = require('../abi/DandelionVoting.json')
const DaoPntAbi = require('../abi/daoPNT.json')
const ERC20VaultAbi = require('../abi/ERC20Vault.json')
const EthPntAbi = require('../abi/ethPNT.json')
const FinanceAbi = require('../abi/Finance.json')
const VaultAbi = require('../abi/Vault.json')
const { PNETWORK_NETWORK_IDS, ZERO_ADDRESS, PNETWORK_ADDRESS } = require('../constants')
const { CHANGE_TOKEN_ROLE, CREATE_VOTES_ROLE, CREATE_PAYMENTS_ROLE, UPGRADE_ROLE } = require('../roles')
const { encode } = require('../utils')
const { hardhatReset } = require('../utils/hardhat-reset')
const { sendEth } = require('../utils/send-eth')

const PNT_ON_GNOSIS_MINTER = '0x53d51f8801f40657ca566a1ae25b27eada97413c'

const USER_ADDRESS = '0xdDb5f4535123DAa5aE343c24006F4075aBAF5F7B'

const getBytes = (_hexString) => Buffer.from(_hexString.slice(2), 'hex')

const parseEther = (_input) => hre.ethers.parseEther(_input)

const createExecutorId = (id) => `0x${String(id).padStart(8, '0')}`

const encodeCallScript = (actions, specId = 1) =>
  actions.reduce((script, { to, calldata }) => {
    const encoder = new hre.ethers.AbiCoder()
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

const openNewVoteAndReachQuorum = async (_votingContract, _voteCreator, _voters, _executionScript, _metadata) => {
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
  const executionBlock = vote[3]
  await mineUpTo(executionBlock + 1n)
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
    finance

  const TOKEN_HOLDERS_ADDRESSES = [
    '0xc4442915B1FB44972eE4D8404cE05a8D2A1248dA',
    '0xe8b43e7d55337ab735f6e1932d4a1e98de70eabc',
    '0x9ad4550759389ca7f0488037daa4332b1f30cdac',
    '0x100a70b9e50e91367d571332e76cfa70e9307059'
  ]

  const missingSteps = async () => {
    await upgradeContracts()
    const MockPToken = await hre.ethers.getContractFactory('MockPTokenERC20')
    pntOnGnosis = await MockPToken.deploy(
      'Host Token (pToken)',
      'HTKN',
      pntMinter.address,
      PNETWORK_NETWORK_IDS.gnosisMainnet
    )
    await stakingManager.connect(daoOwner).grantRole(CHANGE_TOKEN_ROLE, SAFE_ADDRESS)
    await stakingManagerLm.connect(daoOwner).grantRole(CHANGE_TOKEN_ROLE, SAFE_ADDRESS)
    await stakingManagerRm.connect(daoOwner).grantRole(CHANGE_TOKEN_ROLE, SAFE_ADDRESS)
    await lendingManager.connect(daoOwner).grantRole(CHANGE_TOKEN_ROLE, SAFE_ADDRESS)
    await registrationManager.connect(daoOwner).grantRole(CHANGE_TOKEN_ROLE, SAFE_ADDRESS)
    await stakingManager.connect(daoOwner).changeToken(await pntOnGnosis.getAddress())
    await stakingManagerLm.connect(daoOwner).changeToken(await pntOnGnosis.getAddress())
    await stakingManagerRm.connect(daoOwner).changeToken(await pntOnGnosis.getAddress())
    await lendingManager.connect(daoOwner).changeToken(await pntOnGnosis.getAddress())
    await registrationManager.connect(daoOwner).changeToken(await pntOnGnosis.getAddress())
  }

  const upgradeContracts = async () => {
    await stakingManager.connect(daoOwner).grantRole(UPGRADE_ROLE, faucet.address)
    await stakingManagerLm.connect(daoOwner).grantRole(UPGRADE_ROLE, faucet.address)
    await stakingManagerRm.connect(daoOwner).grantRole(UPGRADE_ROLE, faucet.address)
    await lendingManager.connect(daoOwner).grantRole(UPGRADE_ROLE, faucet.address)
    await registrationManager.connect(daoOwner).grantRole(UPGRADE_ROLE, faucet.address)
    await hre.upgrades.upgradeProxy(stakingManager, StakingManager)
    await hre.upgrades.upgradeProxy(stakingManagerLm, StakingManagerPermissioned)
    await hre.upgrades.upgradeProxy(stakingManagerRm, StakingManagerPermissioned)
    await hre.upgrades.upgradeProxy(lendingManager, LendingManager)
    await hre.upgrades.upgradeProxy(registrationManager, RegistrationManager)
  }

  beforeEach(async () => {
    const rpc = hre.config.networks.hardhat.forking.url
    const blockToForkFrom = hre.config.networks.hardhat.forking.blockNumber
    await hardhatReset(hre.network.provider, rpc, blockToForkFrom)
    ;[faucet] = await hre.ethers.getSigners()
    tokenHolders = await Promise.all(TOKEN_HOLDERS_ADDRESSES.map(hre.ethers.getImpersonatedSigner))
    user = await hre.ethers.getImpersonatedSigner(USER_ADDRESS)
    daoOwner = await hre.ethers.getImpersonatedSigner(SAFE_ADDRESS)
    await sendEth(hre.ethers, faucet, daoOwner.address, '5')
    pntMinter = await hre.ethers.getImpersonatedSigner(PNT_ON_GNOSIS_MINTER)

    StakingManager = await hre.ethers.getContractFactory('StakingManager')
    StakingManagerPermissioned = await hre.ethers.getContractFactory('StakingManagerPermissioned')
    RegistrationManager = await hre.ethers.getContractFactory('RegistrationManager')
    LendingManager = await hre.ethers.getContractFactory('LendingManager')

    acl = await hre.ethers.getContractAt(AclAbi, ACL_ADDRESS)
    daoVoting = await hre.ethers.getContractAt(DandelionVotingAbi, DANDELION_VOTING_ADDRESS)
    daoTreasury = await hre.ethers.getContractAt(VaultAbi, FINANCE_VAULT)
    finance = await hre.ethers.getContractAt(FinanceAbi, FINANCE)
    daoPNT = await hre.ethers.getContractAt(DaoPntAbi, DAOPNT_ON_GNOSIS_ADDRESS)
    stakingManager = StakingManager.attach(STAKING_MANAGER)
    stakingManagerLm = StakingManagerPermissioned.attach(STAKING_MANAGER_LM)
    stakingManagerRm = StakingManagerPermissioned.attach(STAKING_MANAGER_RM)
    registrationManager = RegistrationManager.attach(REGISTRATION_MANAGER)
    lendingManager = LendingManager.attach(LENDING_MANAGER)

    await missingSteps()

    await Promise.all(tokenHolders.map((_holder) => sendEth(hre.ethers, faucet, _holder.address, '5')))
    await Promise.all(tokenHolders.map((_holder) => mintPntOnGnosis(_holder.address, 10000n)))
    await Promise.all(tokenHolders.map((_holder) => stake(_holder, 5000)))
  })

  const mintPntOnGnosis = async (receiver, amount, userData = '0x') => {
    const balance = await pntOnGnosis.balanceOf(receiver)
    await expect(pntOnGnosis.connect(pntMinter).mint(receiver, amount, userData, '0x')).to.emit(pntOnGnosis, 'Transfer')
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
    const voteId = 1
    const metadata = 'Should we register a new guardian?'
    const executionScript = encodeCallScript(
      [[REGISTRATION_MANAGER, encodeUpdateGuardianRegistrationFunctionData(faucet.address, 10, faucet.address)]].map(
        (_args) => encodeFunctionCall(..._args)
      )
    )
    let currentBlock = await hre.ethers.provider.getBlockNumber()
    expect(await daoPNT.totalSupplyAt(currentBlock)).to.be.eq(20000)
    await mintPntOnGnosis(faucet.address, 10000n)
    await stake(faucet, 10000)
    currentBlock = await hre.ethers.provider.getBlockNumber()
    expect(await daoPNT.totalSupplyAt(currentBlock)).to.be.eq(30000)

    await grantCreateVotesPermission(acl, daoOwner, tokenHolders[0].address)
    await openNewVoteAndReachQuorum(daoVoting, tokenHolders[0], tokenHolders, executionScript, metadata)
    await expect(daoVoting.executeVote(voteId))
      .to.emit(daoVoting, 'ExecuteVote')
      .withArgs(voteId)
      .and.to.emit(registrationManager, 'GuardianRegistrationUpdated')
  })

  it('should lend PNTs and register a borrowing sentinel', async () => {
    const amount = hre.ethers.parseEther('200000', await pntOnGnosis.decimals())
    await mintPntOnGnosis(faucet.address, hre.ethers.parseEther('400000', await pntOnGnosis.decimals()))
    await pntOnGnosis.connect(faucet).approve(LENDING_MANAGER, amount)
    const balancePre = await pntOnGnosis.balanceOf(faucet.address)
    await expect(lendingManager.lend(faucet.address, amount, 86400 * 90))
      .to.emit(lendingManager, 'Lended')
      .withArgs(faucet.address, 3, 4, amount)
      .and.to.emit(stakingManagerLm, 'Staked')
      .withArgs(faucet.address, amount, 86400 * 90)
    const balancePost = await pntOnGnosis.balanceOf(faucet.address)
    expect(balancePre - amount).to.be.eq(balancePost)

    const sentinel = hre.ethers.Wallet.createRandom()
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
    const amount = hre.ethers.parseEther('200000', await pntOnGnosis.decimals())
    await mintPntOnGnosis(user.address, hre.ethers.parseEther('400000', await pntOnGnosis.decimals()))
    const sentinel = hre.ethers.Wallet.createRandom()
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
      const ERC20Factory = await hre.ethers.getContractFactory(_pTokenContract)
      const newToken = await ERC20Factory.deploy('new PNT', 'nPNT', faucet.address, '0x00112233')

      await pntOnGnosis.connect(faucet).approve(await stakingManager.getAddress(), 10000)
      await mintPntOnGnosis(faucet.address, 10000n)
      await stakingManager.connect(faucet).stake(faucet.address, 10000, 86400 * 7)
      await expect(stakingManager.connect(daoOwner).changeToken(await newToken.getAddress()))
        .to.emit(stakingManager, 'TokenChanged')
        .withArgs(await pntOnGnosis.getAddress(), await newToken.getAddress())
      await newToken.connect(faucet).mint(faucet.address, hre.ethers.parseEther('200000'), '0x', '0x')
      await newToken.connect(faucet).approve(await stakingManager.getAddress(), 10000)
      await expect(stakingManager.connect(faucet).stake(faucet.address, 10000, 86400 * 7))
        .to.be.revertedWithCustomError(stakingManager, 'InvalidToken')
        .withArgs(await newToken.getAddress(), await pntOnGnosis.getAddress())
    })
  )

  it('should stake and unstake', async () => {
    await pntOnGnosis.connect(faucet).approve(await stakingManager.getAddress(), 10000)
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
    await mintPntOnGnosis(await daoTreasury.getAddress(), parseEther('200000'))
    expect(await pntOnGnosis.balanceOf(await daoTreasury.getAddress())).to.be.eq(parseEther('200000'))
    expect(await pntOnGnosis.balanceOf(user.address)).to.be.eq(parseEther('0'))

    const voteId = 1
    const metadata = 'Should we transfer from vault to user?'
    const executionScript = encodeCallScript(
      [[FINANCE_VAULT, encodeVaultTransfer(await pntOnGnosis.getAddress(), user.address, parseEther('1'))]].map(
        (_args) => encodeFunctionCall(..._args)
      )
    )
    await grantCreateVotesPermission(acl, daoOwner, tokenHolders[0].address)
    await openNewVoteAndReachQuorum(daoVoting, tokenHolders[0], tokenHolders, executionScript, metadata)

    await expect(daoVoting.executeVote(voteId))
      .to.emit(daoVoting, 'ExecuteVote')
      .withArgs(voteId)
      .and.to.emit(daoTreasury, 'VaultTransfer')
      .withArgs(await pntOnGnosis.getAddress(), user.address, parseEther('1'))
      .and.to.emit(pntOnGnosis, 'Transfer')
      .withArgs(await daoTreasury.getAddress(), user.address, parseEther('1'))

    expect(await pntOnGnosis.balanceOf(user.address)).to.be.eq(parseEther('1'))
  })

  it('should create an immediate payment via finance app', async () => {
    await setPermission(acl, daoOwner, faucet.address, await finance.getAddress(), CREATE_PAYMENTS_ROLE)
    const amount = parseEther('1.5')
    await mintPntOnGnosis(await daoTreasury.getAddress(), parseEther('200000'))
    expect(await pntOnGnosis.balanceOf(await daoTreasury.getAddress())).to.be.eq(parseEther('200000'))
    expect(await pntOnGnosis.balanceOf(user.address)).to.be.eq(parseEther('0'))
    await expect(
      finance.connect(faucet).newImmediatePayment(await pntOnGnosis.getAddress(), user.address, amount, 'test')
    )
      .to.emit(daoTreasury, 'VaultTransfer')
      .withArgs(await pntOnGnosis.getAddress(), user.address, amount)
      .and.to.emit(pntOnGnosis, 'Transfer')
      .withArgs(await daoTreasury.getAddress(), user.address, amount)
    expect(await pntOnGnosis.balanceOf(await daoTreasury.getAddress())).to.be.eq(parseEther('200000') - amount)
    expect(await pntOnGnosis.balanceOf(user.address)).to.be.eq(amount)
  })

  it('should open a vote (1)', async () => {
    await setPermission(acl, daoOwner, user.address, await daoVoting.getAddress(), CREATE_VOTES_ROLE)
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

  it('should call withdrawInflation from Gnosis', async () => {
    const FORWARDER_ETH = '0x0123456789012345678901234567890123456789'
    const RECEIVER = FORWARDER_ETH
    const ETH_PTN_ADDRESS = ETHPNT_ADDRESS

    const voteId = 1
    const metadata = 'Should we inflate more?'

    const userData = encode(
      ['address[]', 'bytes[]'],
      [
        [ETH_PTN_ADDRESS, ETH_PTN_ADDRESS, ERC20_VAULT],
        [
          new hre.ethers.Interface(EthPntAbi).encodeFunctionData('withdrawInflation', [RECEIVER, 10]),
          new hre.ethers.Interface(EthPntAbi).encodeFunctionData('approve', [ERC20_VAULT, 10]),
          new hre.ethers.Interface(ERC20VaultAbi).encodeFunctionData('pegIn(uint256,address,string,bytes,bytes4)', [
            10,
            ETHPNT_ADDRESS,
            FINANCE_VAULT,
            '0x',
            PNETWORK_NETWORK_IDS.gnosisMainnet
          ])
        ]
      ]
    )
    const executionScript = encodeCallScript(
      [
        [
          await pntOnGnosis.getAddress(),
          pntOnGnosis.interface.encodeFunctionData('redeem(uint256,bytes,string,bytes4)', [
            1,
            userData,
            FORWARDER_ETH,
            PNETWORK_NETWORK_IDS.ethereumMainnet
          ])
        ]
      ].map((_args) => encodeFunctionCall(..._args))
    )
    let currentBlock = await hre.ethers.provider.getBlockNumber()
    expect(await daoPNT.totalSupplyAt(currentBlock)).to.be.eq(20000)
    await mintPntOnGnosis(faucet.address, 10000n)
    await mintPntOnGnosis(DANDELION_VOTING_ADDRESS, 10000n)
    await stake(faucet, 10000)
    currentBlock = await hre.ethers.provider.getBlockNumber()
    expect(await daoPNT.totalSupplyAt(currentBlock)).to.be.eq(30000)
    await grantCreateVotesPermission(acl, daoOwner, tokenHolders[0].address)
    await openNewVoteAndReachQuorum(daoVoting, tokenHolders[0], tokenHolders, executionScript, metadata)
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
        PNETWORK_NETWORK_IDS.gnosisMainnet,
        PNETWORK_NETWORK_IDS.ethereumMainnet
      )
  })

  it('should be possible to pegin to finance vault', async () => {
    await mintPntOnGnosis(FINANCE_VAULT, '10', '0xc0ffee')
  })
})

describe('Integration tests on Ethereum deployment', () => {
  let vault, forwarderNativePermissioned, pnetwork, faucet, daoVotingV1, tokenHolders, association, ethPnt

  const TOKEN_HOLDERS_ADDRESSES = [
    '0x100a70b9e50e91367d571332E76cFa70e9307059',
    '0xc4442915B1FB44972eE4D8404cE05a8D2A1248dA',
    '0xF03f2303cC57bC5Cd63255749e86Ed8886Ca68Fc',
    '0xe0EDF3bAee2eE71903FbD43D93ce54420e5933F2'
  ]

  const missingSteps = async () => {
    const ForwarderNativePermissioned = await hre.ethers.getContractFactory('ForwarderNativePermissioned')
    forwarderNativePermissioned = await ForwarderNativePermissioned.deploy(PNT_ON_ETH_ADDRESS, ERC20_VAULT)
    await forwarderNativePermissioned.whitelistOriginAddress(DANDELION_VOTING_ADDRESS)
    daoVotingV1 = await hre.ethers.getContractAt(DandelionVotingAbi, DANDELION_VOTING_V1_ADDRESS)
    // open vote to change inflationOwner
    const executionScript = encodeCallScript(
      [
        [
          ETHPNT_ADDRESS,
          ethPnt.interface.encodeFunctionData('whitelistInflationRecipient', [
            await forwarderNativePermissioned.getAddress()
          ])
        ],
        [
          ETHPNT_ADDRESS,
          ethPnt.interface.encodeFunctionData('setInflationOwner', [await forwarderNativePermissioned.getAddress()])
        ]
      ].map((_args) => encodeFunctionCall(..._args))
    )
    const voteId = await openNewVoteAndReachQuorum(
      daoVotingV1,
      association,
      tokenHolders,
      executionScript,
      'change inflation owner?'
    )
    expect(await ethPnt.inflationRecipientsWhitelist(await forwarderNativePermissioned.getAddress())).to.be.false
    await expect(daoVotingV1.executeVote(voteId))
      .to.emit(daoVotingV1, 'ExecuteVote')
      .withArgs(voteId)
      .and.to.emit(ethPnt, 'InflationRecipientWhitelisted')
      .and.to.emit(ethPnt, 'NewInflationOwner')
    expect(await ethPnt.inflationRecipientsWhitelist(await forwarderNativePermissioned.getAddress())).to.be.true
    expect(await ethPnt.inflationOwner()).to.be.eq(await forwarderNativePermissioned.getAddress())
  }

  beforeEach(async () => {
    const rpc = hre.config.networks.mainnet.url
    await hardhatReset(hre.network.provider, rpc)
    ;[faucet] = await hre.ethers.getSigners()
    tokenHolders = await Promise.all(TOKEN_HOLDERS_ADDRESSES.map(hre.ethers.getImpersonatedSigner))
    pnetwork = await hre.ethers.getImpersonatedSigner(PNETWORK_ADDRESS)
    association = await hre.ethers.getImpersonatedSigner('0xf1f6568a76559d85cF68E6597fA587544184dD46')
    ethPnt = await hre.ethers.getContractAt(EthPntAbi, ETHPNT_ADDRESS)
    vault = await hre.ethers.getContractAt('IErc20Vault', ERC20_VAULT)
    await sendEth(hre.ethers, faucet, pnetwork.address, '10')
    await sendEth(hre.ethers, faucet, association.address, '10')
    await Promise.all(TOKEN_HOLDERS_ADDRESSES.map((_address) => sendEth(hre.ethers, faucet, _address, '10')))
    await missingSteps()
  })

  it('should process pegout and withdrawInflation', async () => {
    const metadata = encode(
      ['bytes1', 'bytes', 'bytes4', 'address', 'bytes4', 'address', 'bytes', 'bytes'],
      [
        '0x02',
        // secretlint-disable-next-line
        '0x000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000003000000000000000000000000f4ea6b892853413bd9d9f1a5d3a620a0ba39c5b2000000000000000000000000f4ea6b892853413bd9d9f1a5d3a620a0ba39c5b2000000000000000000000000e396757ec7e6ac7c8e5abe7285dde47b98f22db80000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000016000000000000000000000000000000000000000000000000000000000000000443352d49b0000000000000000000000000123456789012345678901234567890123456789000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000044095ea7b3000000000000000000000000e396757ec7e6ac7c8e5abe7285dde47b98f22db8000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000124c322525d000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000f4ea6b892853413bd9d9f1a5d3a620a0ba39c5b200000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000010000f1918e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002a30783632333939363865363233313136343638374342343066383338396439333364443766376530413500000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'.replaceAll(
          '0123456789012345678901234567890123456789',
          (await forwarderNativePermissioned.getAddress()).slice(2)
        ),
        PNETWORK_NETWORK_IDS.gnosisMainnet,
        DANDELION_VOTING_ADDRESS,
        PNETWORK_NETWORK_IDS.ethereumMainnet,
        await forwarderNativePermissioned.getAddress(),
        '0x',
        '0x'
      ]
    )
    await expect(
      vault.connect(pnetwork).pegOut(await forwarderNativePermissioned.getAddress(), PNT_ON_ETH_ADDRESS, 1, metadata)
    )
      .to.emit(ethPnt, 'Transfer')
      .withArgs(ZERO_ADDRESS, await forwarderNativePermissioned.getAddress(), 10)
      .and.to.emit(vault, 'PegIn')
      .withArgs(
        PNT_ON_ETH_ADDRESS,
        await forwarderNativePermissioned.getAddress(),
        10,
        FINANCE_VAULT,
        '0x',
        PNETWORK_NETWORK_IDS.ethereumMainnet,
        PNETWORK_NETWORK_IDS.gnosisMainnet
      )
  })
})
