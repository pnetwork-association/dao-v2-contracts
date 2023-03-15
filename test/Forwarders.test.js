const { expect } = require('chai')
const { ethers, upgrades } = require('hardhat')
const { getRole, encode, getSentinelIdentity, getUserDataGeneratedByForwarder } = require('./utils')
const { time } = require('@nomicfoundation/hardhat-network-helpers')

const {
  ACL_ADDRESS,
  BORROW_AMOUNT_FOR_SENTINEL_REGISTRATION,
  DAO_ROOT_ADDRESS,
  EPOCH_DURATION,
  ERC20_VAULT,
  LEND_MAX_EPOCHS,
  ONE_DAY,
  PNETWORK_ADDRESS,
  PNETWORK_CHAIN_IDS,
  PNT_ADDRESS,
  PNT_HOLDER_1_ADDRESS,
  PNT_HOLDER_2_ADDRESS,
  PNT_MAX_TOTAL_SUPPLY,
  REGISTRATION_SENTINEL_BORROWING,
  REGISTRATION_SENTINEL_STAKING,
  TOKEN_MANAGER_ADDRESS,
  ZERO_ADDRESS
} = require('./constants')

let forwarderNative,
  forwarderHost,
  stakingManager,
  borrowingManager,
  registrationManager,
  owner,
  pToken,
  pnetwork,
  sentinel1,
  root,
  router,
  pntHolder1,
  pntHolder2,
  fakeForwarder,
  forwarderRecipientUpgradeableTestData

describe('Forwarders', () => {
  beforeEach(async () => {
    const Forwarder = await ethers.getContractFactory('Forwarder')
    const StakingManager = await ethers.getContractFactory('StakingManager')
    const StakingManagerPermissioned = await ethers.getContractFactory('StakingManagerPermissioned')
    const BorrowingManager = await ethers.getContractFactory('BorrowingManager')
    const RegistrationManager = await ethers.getContractFactory('RegistrationManager')
    const EpochsManager = await ethers.getContractFactory('EpochsManager')
    const MockPToken = await ethers.getContractFactory('MockPToken')
    const MockPTokensVault = await ethers.getContractFactory('MockPTokensVault')
    const ERC20 = await ethers.getContractFactory('ERC20')
    const ACL = await ethers.getContractFactory('ACL')
    const DandelionVoting = await ethers.getContractFactory('DandelionVoting')

    const signers = await ethers.getSigners()
    owner = signers[0]
    sentinel1 = signers[1]
    router = signers[2]
    fakeForwarder = signers[3]
    pnetwork = await ethers.getImpersonatedSigner(PNETWORK_ADDRESS)
    pntHolder1 = await ethers.getImpersonatedSigner(PNT_HOLDER_1_ADDRESS)
    pntHolder2 = await ethers.getImpersonatedSigner(PNT_HOLDER_2_ADDRESS)
    root = await ethers.getImpersonatedSigner(DAO_ROOT_ADDRESS)

    acl = await ACL.attach(ACL_ADDRESS)
    pnt = await ERC20.attach(PNT_ADDRESS)
    vault = await MockPTokensVault.attach(ERC20_VAULT)
    pToken = await MockPToken.deploy('Host Token (pToken)', 'HTKN', [], pnetwork.address, PNETWORK_CHAIN_IDS.polygonMainnet)

    forwarderNative = await Forwarder.deploy(pnt.address, vault.address, vault.address)
    forwarderHost = await Forwarder.deploy(pToken.address, ZERO_ADDRESS, ZERO_ADDRESS)
    await forwarderNative.whitelistOriginAddress(forwarderHost.address)
    await forwarderHost.whitelistOriginAddress(forwarderNative.address)

    stakingManager = await upgrades.deployProxy(
      StakingManager,
      [pToken.address, TOKEN_MANAGER_ADDRESS, forwarderHost.address, PNT_MAX_TOTAL_SUPPLY],
      {
        initializer: 'initialize',
        kind: 'uups'
      }
    )

    stakingManagerBM = await upgrades.deployProxy(
      StakingManagerPermissioned,
      [pToken.address, TOKEN_MANAGER_ADDRESS, forwarderHost.address, PNT_MAX_TOTAL_SUPPLY],
      {
        initializer: 'initialize',
        kind: 'uups'
      }
    )

    stakingManagerRM = await upgrades.deployProxy(
      StakingManagerPermissioned,
      [pToken.address, TOKEN_MANAGER_ADDRESS, forwarderHost.address, PNT_MAX_TOTAL_SUPPLY],
      {
        initializer: 'initialize',
        kind: 'uups'
      }
    )

    epochsManager = await upgrades.deployProxy(EpochsManager, [EPOCH_DURATION], {
      initializer: 'initialize',
      kind: 'uups'
    })

    borrowingManager = await upgrades.deployProxy(
      BorrowingManager,
      [pToken.address, stakingManagerBM.address, epochsManager.address, forwarderHost.address, LEND_MAX_EPOCHS],
      {
        initializer: 'initialize',
        kind: 'uups'
      }
    )

    registrationManager = await upgrades.deployProxy(
      RegistrationManager,
      [pToken.address, stakingManagerRM.address, epochsManager.address, borrowingManager.address, forwarderHost.address],
      {
        initializer: 'initialize',
        kind: 'uups'
      }
    )

    voting = await DandelionVoting.deploy(forwarderHost.address)
    await voting.setForwarder(forwarderHost.address)

    await acl.connect(root).grantPermission(stakingManager.address, TOKEN_MANAGER_ADDRESS, getRole('MINT_ROLE'))
    await acl.connect(root).grantPermission(stakingManager.address, TOKEN_MANAGER_ADDRESS, getRole('BURN_ROLE'))
    await acl.connect(root).grantPermission(stakingManagerRM.address, TOKEN_MANAGER_ADDRESS, getRole('MINT_ROLE'))
    await acl.connect(root).grantPermission(stakingManagerRM.address, TOKEN_MANAGER_ADDRESS, getRole('BURN_ROLE'))
    await acl.connect(root).grantPermission(stakingManagerBM.address, TOKEN_MANAGER_ADDRESS, getRole('MINT_ROLE'))
    await acl.connect(root).grantPermission(stakingManagerBM.address, TOKEN_MANAGER_ADDRESS, getRole('BURN_ROLE'))
    await borrowingManager.grantRole(getRole('BORROW_ROLE'), registrationManager.address)
    await stakingManagerBM.grantRole(getRole('STAKE_ROLE'), borrowingManager.address)
    await stakingManagerBM.grantRole(getRole('INCREASE_DURATION_ROLE'), borrowingManager.address)
    await stakingManagerRM.grantRole(getRole('STAKE_ROLE'), registrationManager.address)
    await stakingManagerRM.grantRole(getRole('INCREASE_DURATION_ROLE'), registrationManager.address)
    await registrationManager.grantRole(getRole('RELEASE_SENTINEL_ROLE'), owner.address)
    await stakingManager.grantRole(getRole('UPGRADE_ROLE'), owner.address)
    await borrowingManager.grantRole(getRole('UPGRADE_ROLE'), owner.address)
    await registrationManager.grantRole(getRole('UPGRADE_ROLE'), owner.address)

    await stakingManager.setForwarder(forwarderHost.address)
    await borrowingManager.setForwarder(forwarderHost.address)
    await registrationManager.setForwarder(forwarderHost.address)

    await owner.sendTransaction({
      to: pntHolder1.address,
      value: ethers.utils.parseEther('10')
    })
    await owner.sendTransaction({
      to: pntHolder2.address,
      value: ethers.utils.parseEther('10')
    })
    await owner.sendTransaction({
      to: pnetwork.address,
      value: ethers.utils.parseEther('10')
    })
    await pnt.connect(pntHolder1).transfer(forwarderNative.address, ethers.utils.parseEther('1'))

    forwarderRecipientUpgradeableTestData = [
      {
        artifact: StakingManager,
        contract: stakingManager
      },
      {
        artifact: BorrowingManager,
        contract: borrowingManager
      },
      {
        artifact: RegistrationManager,
        contract: registrationManager
      }
    ]
  })

  describe('ForwarderRecipientUpgradeable', () => {
    it('should not be able to change the forwarder without the correspondig role', async () => {
      for (const { contract } of forwarderRecipientUpgradeableTestData) {
        const expectedError = `AccessControl: account ${pntHolder1.address.toLowerCase()} is missing role ${getRole('SET_FORWARDER_ROLE')}`
        await expect(contract.connect(pntHolder1).setForwarder(fakeForwarder.address)).to.be.revertedWith(expectedError)
      }
    })

    it('should be able to change the forwarder', async () => {
      for (const { contract } of forwarderRecipientUpgradeableTestData) {
        await contract.grantRole(getRole('SET_FORWARDER_ROLE'), pntHolder1.address)
        await contract.connect(pntHolder1).setForwarder(fakeForwarder.address)
        expect(await contract.forwarder()).to.be.eq(fakeForwarder.address)
      }
    })

    it('should be able to change the forwarder after a contract upgrade', async () => {
      for (const { artifact, contract } of forwarderRecipientUpgradeableTestData) {
        await contract.grantRole(getRole('SET_FORWARDER_ROLE'), pntHolder1.address)
        await contract.connect(pntHolder1).setForwarder(fakeForwarder.address)
        expect(await contract.forwarder()).to.be.eq(fakeForwarder.address)
        await upgrades.upgradeProxy(contract.address, artifact, {
          kind: 'uups'
        })
        await contract.connect(pntHolder1).setForwarder(forwarderHost.address)
        expect(await contract.forwarder()).to.be.eq(forwarderHost.address)
      }
    })
  })

  it('should be able to forward a vote', async () => {
    const voteId = 1
    const dandelionVotingInterface = new ethers.utils.Interface(['function delegateVote(address voter, uint256 _voteId, bool _supports)'])
    const userData = encode(
      ['address[]', 'bytes[]'],
      [[voting.address], [dandelionVotingInterface.encodeFunctionData('delegateVote', [pntHolder1.address, voteId, true])]]
    )

    await forwarderNative.connect(pntHolder1).call(0, forwarderHost.address, userData, PNETWORK_CHAIN_IDS.polygonMainnet)

    // NOTE: at this point let's suppose that a pNetwork node processes the pegin ...

    const metadata = encode(
      ['bytes1', 'bytes', 'bytes4', 'address', 'bytes4', 'address', 'bytes', 'bytes'],
      [
        '0x02',
        getUserDataGeneratedByForwarder(userData, forwarderNative.address, pntHolder1.address),
        PNETWORK_CHAIN_IDS.interim,
        forwarderNative.address,
        PNETWORK_CHAIN_IDS.polygonMainnet,
        forwarderHost.address,
        '0x',
        '0x'
      ]
    )

    await expect(pToken.connect(pnetwork).mint(forwarderHost.address, 0, metadata, '0x'))
      .to.emit(voting, 'CastVote')
      .withArgs(voteId, pntHolder1.address, true)
  })

  it('should be able to forward a stake request', async () => {
    const stakeAmount = ethers.utils.parseEther('10000')
    const duration = ONE_DAY * 7

    const erc20Interface = new ethers.utils.Interface(['function approve(address spender, uint256 amount)'])
    const stakingManagerInterface = new ethers.utils.Interface(['function stake(address receiver, uint256 amount, uint64 duration)'])
    const userData = encode(
      ['address[]', 'bytes[]'],
      [
        [pToken.address, stakingManager.address],
        [
          erc20Interface.encodeFunctionData('approve', [stakingManager.address, stakeAmount]),
          stakingManagerInterface.encodeFunctionData('stake', [pntHolder1.address, stakeAmount, duration])
        ]
      ]
    )

    await pnt.connect(pntHolder1).approve(forwarderNative.address, stakeAmount)
    await forwarderNative.connect(pntHolder1).call(stakeAmount, forwarderHost.address, userData, PNETWORK_CHAIN_IDS.polygonMainnet)

    // NOTE: at this point let's suppose that a pNetwork node processes the pegin...

    const metadata = encode(
      ['bytes1', 'bytes', 'bytes4', 'address', 'bytes4', 'address', 'bytes', 'bytes'],
      [
        '0x02',
        getUserDataGeneratedByForwarder(userData, forwarderNative.address, pntHolder1.address),
        PNETWORK_CHAIN_IDS.interim,
        router.address,
        PNETWORK_CHAIN_IDS.polygonMainnet,
        forwarderHost.address,
        '0x',
        '0x'
      ]
    )

    await expect(pToken.connect(pnetwork).mint(forwarderHost.address, stakeAmount, metadata, '0x'))
      .to.emit(stakingManager, 'Staked')
      .withArgs(pntHolder1.address, stakeAmount, duration)
  })

  it('should be able to forward a lend request', async () => {
    const lendAmount = ethers.utils.parseEther('10000')
    const duration = EPOCH_DURATION * 13

    const erc20Interface = new ethers.utils.Interface(['function approve(address spender, uint256 amount)'])
    const stakingManagerInterface = new ethers.utils.Interface(['function lend(address receiver, uint256 amount, uint64 duration)'])
    const userData = encode(
      ['address[]', 'bytes[]'],
      [
        [pToken.address, borrowingManager.address],
        [
          erc20Interface.encodeFunctionData('approve', [borrowingManager.address, lendAmount]),
          stakingManagerInterface.encodeFunctionData('lend', [pntHolder1.address, lendAmount, duration])
        ]
      ]
    )

    await pnt.connect(pntHolder1).approve(forwarderNative.address, lendAmount)
    await forwarderNative.connect(pntHolder1).call(lendAmount, forwarderHost.address, userData, PNETWORK_CHAIN_IDS.polygonMainnet)

    // NOTE: at this point let's suppose that a pNetwork node processes the pegin...

    const metadata = encode(
      ['bytes1', 'bytes', 'bytes4', 'address', 'bytes4', 'address', 'bytes', 'bytes'],
      [
        '0x02',
        getUserDataGeneratedByForwarder(userData, forwarderNative.address, pntHolder1.address),
        PNETWORK_CHAIN_IDS.interim,
        router.address,
        PNETWORK_CHAIN_IDS.polygonMainnet,
        forwarderHost.address,
        '0x',
        '0x'
      ]
    )

    await expect(pToken.connect(pnetwork).mint(forwarderHost.address, lendAmount, metadata, '0x'))
      .to.emit(borrowingManager, 'Lended')
      .withArgs(pntHolder1.address, 1, 12, lendAmount)
  })

  it('should be able to forward a updateSentinelRegistrationByStaking request', async () => {
    const stakeAmount = ethers.utils.parseEther('200000')
    const duration = EPOCH_DURATION * 13
    const signature = await getSentinelIdentity(pntHolder1.address, { sentinel: sentinel1 })

    const erc20Interface = new ethers.utils.Interface(['function approve(address spender, uint256 amount)'])
    const registrationManagerInterface = new ethers.utils.Interface([
      'function updateSentinelRegistrationByStaking(address receiver, uint256 amount, uint64 duration, bytes signature)'
    ])
    const userData = encode(
      ['address[]', 'bytes[]'],
      [
        [pToken.address, registrationManager.address],
        [
          erc20Interface.encodeFunctionData('approve', [registrationManager.address, stakeAmount]),
          registrationManagerInterface.encodeFunctionData('updateSentinelRegistrationByStaking', [
            pntHolder1.address,
            stakeAmount,
            duration,
            signature
          ])
        ]
      ]
    )

    await pnt.connect(pntHolder1).approve(forwarderNative.address, stakeAmount)
    await forwarderNative.connect(pntHolder1).call(stakeAmount, forwarderHost.address, userData, PNETWORK_CHAIN_IDS.polygonMainnet)

    // NOTE: at this point let's suppose that a pNetwork node processes the pegin...

    const metadata = encode(
      ['bytes1', 'bytes', 'bytes4', 'address', 'bytes4', 'address', 'bytes', 'bytes'],
      [
        '0x02',
        getUserDataGeneratedByForwarder(userData, forwarderNative.address, pntHolder1.address),
        PNETWORK_CHAIN_IDS.interim,
        router.address,
        PNETWORK_CHAIN_IDS.polygonMainnet,
        forwarderHost.address,
        '0x',
        '0x'
      ]
    )

    await expect(pToken.connect(pnetwork).mint(forwarderHost.address, stakeAmount, metadata, '0x'))
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(pntHolder1.address, 1, 12, sentinel1.address, REGISTRATION_SENTINEL_STAKING, stakeAmount)
  })

  it('should be able to forward a updateSentinelRegistrationByBorrowing request after a lending one', async () => {
    // L E N D
    const lendAmount = ethers.utils.parseEther('400000')
    const duration = EPOCH_DURATION * 15

    const erc20Interface = new ethers.utils.Interface(['function approve(address spender, uint256 amount)'])
    const stakingManagerInterface = new ethers.utils.Interface(['function lend(address receiver, uint256 amount, uint64 duration)'])
    let userData = encode(
      ['address[]', 'bytes[]'],
      [
        [pToken.address, borrowingManager.address],
        [
          erc20Interface.encodeFunctionData('approve', [borrowingManager.address, lendAmount]),
          stakingManagerInterface.encodeFunctionData('lend', [pntHolder2.address, lendAmount, duration])
        ]
      ]
    )

    await pnt.connect(pntHolder2).approve(forwarderNative.address, lendAmount)
    await forwarderNative.connect(pntHolder2).call(lendAmount, forwarderHost.address, userData, PNETWORK_CHAIN_IDS.polygonMainnet)

    let metadata = encode(
      ['bytes1', 'bytes', 'bytes4', 'address', 'bytes4', 'address', 'bytes', 'bytes'],
      [
        '0x02',
        getUserDataGeneratedByForwarder(userData, forwarderNative.address, pntHolder2.address),
        PNETWORK_CHAIN_IDS.interim,
        router.address,
        PNETWORK_CHAIN_IDS.polygonMainnet,
        forwarderHost.address,
        '0x',
        '0x'
      ]
    )
    await expect(pToken.connect(pnetwork).mint(forwarderHost.address, lendAmount, metadata, '0x'))
      .to.emit(borrowingManager, 'Lended')
      .withArgs(pntHolder2.address, 1, 14, lendAmount)

    // B O R R O W
    const numberOfEpochs = 12
    const signature = await getSentinelIdentity(pntHolder1.address, { sentinel: sentinel1 })

    const registrationManagerInterface = new ethers.utils.Interface([
      'function updateSentinelRegistrationByBorrowing(address receiver, uint16 numberOfEpochs, bytes signature)'
    ])
    userData = encode(
      ['address[]', 'bytes[]'],
      [
        [registrationManager.address],
        [registrationManagerInterface.encodeFunctionData('updateSentinelRegistrationByBorrowing', [pntHolder1.address, numberOfEpochs, signature])]
      ]
    )

    await forwarderNative.connect(pntHolder1).call(0, forwarderHost.address, userData, PNETWORK_CHAIN_IDS.polygonMainnet)

    metadata = encode(
      ['bytes1', 'bytes', 'bytes4', 'address', 'bytes4', 'address', 'bytes', 'bytes'],
      [
        '0x02',
        getUserDataGeneratedByForwarder(userData, forwarderNative.address, pntHolder1.address),
        PNETWORK_CHAIN_IDS.interim,
        router.address,
        PNETWORK_CHAIN_IDS.polygonMainnet,
        forwarderHost.address,
        '0x',
        '0x'
      ]
    )

    await expect(pToken.connect(pnetwork).mint(forwarderHost.address, 0, metadata, '0x'))
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(pntHolder1.address, 1, 12, sentinel1.address, REGISTRATION_SENTINEL_BORROWING, BORROW_AMOUNT_FOR_SENTINEL_REGISTRATION)
  })

  it('should be able to forward an unstake request', async () => {
    // S T A K E
    const amount = ethers.utils.parseEther('10000')
    const duration = ONE_DAY * 7

    const erc20Interface = new ethers.utils.Interface(['function approve(address spender, uint256 amount)'])
    const stakingManagerInterface = new ethers.utils.Interface([
      'function stake(address receiver, uint256 amount, uint64 duration)',
      'function unstake(address owner, uint256 amount, bytes4 chainId)'
    ])
    let userData = encode(
      ['address[]', 'bytes[]'],
      [
        [pToken.address, stakingManager.address],
        [
          erc20Interface.encodeFunctionData('approve', [stakingManager.address, amount]),
          stakingManagerInterface.encodeFunctionData('stake', [pntHolder1.address, amount, duration])
        ]
      ]
    )

    await pnt.connect(pntHolder1).approve(forwarderNative.address, amount)
    await forwarderNative.connect(pntHolder1).call(amount, forwarderHost.address, userData, PNETWORK_CHAIN_IDS.polygonMainnet)

    let metadata = encode(
      ['bytes1', 'bytes', 'bytes4', 'address', 'bytes4', 'address', 'bytes', 'bytes'],
      [
        '0x02',
        getUserDataGeneratedByForwarder(userData, forwarderNative.address, pntHolder1.address),
        PNETWORK_CHAIN_IDS.interim,
        router.address,
        PNETWORK_CHAIN_IDS.polygonMainnet,
        forwarderHost.address,
        '0x',
        '0x'
      ]
    )
    await pToken.connect(pnetwork).mint(forwarderHost.address, amount, metadata, '0x')

    // U N S T A K E (from eth to polygon and tokens should come back to ethereum)
    await time.increase(duration + 1)

    userData = encode(
      ['address[]', 'bytes[]'],
      [
        [stakingManager.address],
        [stakingManagerInterface.encodeFunctionData('unstake', [pntHolder1.address, amount, PNETWORK_CHAIN_IDS.ethereumMainnet])]
      ]
    )

    await forwarderNative.connect(pntHolder1).call(0, forwarderHost.address, userData, PNETWORK_CHAIN_IDS.polygonMainnet)

    metadata = encode(
      ['bytes1', 'bytes', 'bytes4', 'address', 'bytes4', 'address', 'bytes', 'bytes'],
      [
        '0x02',
        getUserDataGeneratedByForwarder(userData, forwarderNative.address, pntHolder1.address),
        PNETWORK_CHAIN_IDS.interim,
        router.address,
        PNETWORK_CHAIN_IDS.polygonMainnet,
        forwarderHost.address,
        '0x',
        '0x'
      ]
    )

    await expect(pToken.connect(pnetwork).mint(forwarderHost.address, amount, metadata, '0x'))
      .to.emit(stakingManager, 'Unstaked')
      .withArgs(pntHolder1.address, amount)
  })

  it('should not be able to updateSentinelRegistrationByBorrowing for a third party', async () => {
    await expect(
      registrationManager['updateSentinelRegistrationByBorrowing(address,uint16,bytes)'](pntHolder2.address, 2, '0x')
    ).to.be.revertedWithCustomError(registrationManager, 'InvalidForwarder')
  })
})
