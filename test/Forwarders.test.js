const { expect } = require('chai')
const { ethers, upgrades } = require('hardhat')
const { getRole, encode, getSentinelIdentity } = require('./utils')
const { time } = require('@nomicfoundation/hardhat-network-helpers')

const {
  ACL_ADDRESS,
  DAO_ROOT_ADDRESS,
  EPOCH_DURATION,
  ERC20_VAULT,
  LEND_MAX_EPOCHS,
  ONE_DAY,
  PNETWORK_ADDRESS,
  PNT_ADDRESS,
  PNT_HOLDER_1_ADDRESS,
  REGISTRATION_SENTINEL_STAKING,
  TOKEN_MANAGER_ADDRESS,
  ZERO_ADDRESS
} = require('./constants')

const PNETWORK_CHAIN_IDS = {
  polygonMainnet: '0x0075dd4c',
  ethereumMainnet: '0x005fe7f9',
  interim: '0xffffffff'
}

let forwarderNative, forwarderHost, stakingManager, owner, pToken, pnetwork, sentinel1, root, router

describe('Forwarders', () => {
  beforeEach(async () => {
    const Forwarder = await ethers.getContractFactory('Forwarder')
    const StakingManager = await ethers.getContractFactory('StakingManagerF')
    const BorrowingManager = await ethers.getContractFactory('BorrowingManager')
    const RegistrationManager = await ethers.getContractFactory('RegistrationManager')
    const EpochsManager = await ethers.getContractFactory('EpochsManager')
    const MockPToken = await ethers.getContractFactory('MockPToken')
    const MockPTokensVault = await ethers.getContractFactory('MockPTokensVault')
    const ERC20 = await ethers.getContractFactory('ERC20')
    const ACL = await ethers.getContractFactory('ACL')

    const signers = await ethers.getSigners()
    owner = signers[0]
    sentinel1 = signers[1]
    router = signers[2]
    pnetwork = await ethers.getImpersonatedSigner(PNETWORK_ADDRESS)
    pntHolder1 = await ethers.getImpersonatedSigner(PNT_HOLDER_1_ADDRESS)
    root = await ethers.getImpersonatedSigner(DAO_ROOT_ADDRESS)

    acl = await ACL.attach(ACL_ADDRESS)
    pnt = await ERC20.attach(PNT_ADDRESS)
    vault = await MockPTokensVault.attach(ERC20_VAULT)
    pToken = await MockPToken.deploy('Host Token (pToken)', 'HTKN', [], pnetwork.address, PNETWORK_CHAIN_IDS.polygonMainnet)

    stakingManager = await upgrades.deployProxy(StakingManager, [pToken.address, pnt.address, TOKEN_MANAGER_ADDRESS], {
      initializer: 'initialize',
      kind: 'uups'
    })

    epochsManager = await upgrades.deployProxy(EpochsManager, [EPOCH_DURATION], {
      initializer: 'initialize',
      kind: 'uups'
    })

    borrowingManager = await upgrades.deployProxy(
      BorrowingManager,
      [pToken.address, stakingManager.address, epochsManager.address, LEND_MAX_EPOCHS],
      {
        initializer: 'initialize',
        kind: 'uups'
      }
    )

    registrationManager = await upgrades.deployProxy(
      RegistrationManager,
      [pToken.address, stakingManager.address, epochsManager.address, borrowingManager.address],
      {
        initializer: 'initialize',
        kind: 'uups'
      }
    )

    forwarderNative = await upgrades.deployProxy(Forwarder, [pnt.address, vault.address], {
      initializer: 'initialize',
      kind: 'uups'
    })

    forwarderHost = await upgrades.deployProxy(Forwarder, [pToken.address, ZERO_ADDRESS], {
      initializer: 'initialize',
      kind: 'uups'
    })

    await acl.connect(root).grantPermission(stakingManager.address, TOKEN_MANAGER_ADDRESS, getRole('MINT_ROLE'))
    await acl.connect(root).grantPermission(stakingManager.address, TOKEN_MANAGER_ADDRESS, getRole('BURN_ROLE'))

    await owner.sendTransaction({
      to: pntHolder1.address,
      value: ethers.utils.parseEther('10')
    })
    await owner.sendTransaction({
      to: pnetwork.address,
      value: ethers.utils.parseEther('10')
    })
  })

  it('should be able to forward a stake request', async () => {
    const stakeAmount = ethers.utils.parseEther('10000')
    const duration = ONE_DAY * 7

    const erc20Interface = new ethers.utils.Interface(['function approve(address spender, uint256 amount)'])
    const stakingManagerInterface = new ethers.utils.Interface(['function stake(uint256 amount, uint64 duration, address receiver)'])
    const peginData = encode(
      ['address[]', 'bytes[]'],
      [
        [pToken.address, stakingManager.address],
        [
          erc20Interface.encodeFunctionData('approve', [stakingManager.address, stakeAmount]),
          stakingManagerInterface.encodeFunctionData('stake', [stakeAmount, duration, pntHolder1.address])
        ]
      ]
    )

    await pnt.connect(pntHolder1).approve(vault.address, stakeAmount)
    await vault.connect(pntHolder1).pegIn(stakeAmount, pnt.address, forwarderHost.address, peginData, PNETWORK_CHAIN_IDS.polygonMainnet)

    // NOTE: at this point let's suppose that a pNetwork node processes the pegin...

    const enclavePeginMetadata = encode(
      ['bytes1', 'bytes', 'bytes4', 'address', 'bytes4', 'address', 'bytes', 'bytes'],
      ['0x02', peginData, PNETWORK_CHAIN_IDS.interim, router.address, PNETWORK_CHAIN_IDS.polygonMainnet, forwarderHost.address, '0x', '0x']
    )

    await expect(pToken.connect(pnetwork).mint(forwarderHost.address, stakeAmount, enclavePeginMetadata, '0x'))
      .to.emit(stakingManager, 'Staked')
      .withArgs(pntHolder1.address, stakeAmount, duration)
  })

  it('should be able to forward a lend request', async () => {
    const lendAmount = ethers.utils.parseEther('10000')
    const duration = EPOCH_DURATION * 13

    const erc20Interface = new ethers.utils.Interface(['function approve(address spender, uint256 amount)'])
    const stakingManagerInterface = new ethers.utils.Interface(['function lend(uint256 amount, uint64 duration, address receiver)'])
    const peginData = encode(
      ['address[]', 'bytes[]'],
      [
        [pToken.address, borrowingManager.address],
        [
          erc20Interface.encodeFunctionData('approve', [borrowingManager.address, lendAmount]),
          stakingManagerInterface.encodeFunctionData('lend', [lendAmount, duration, pntHolder1.address])
        ]
      ]
    )

    await pnt.connect(pntHolder1).approve(vault.address, lendAmount)
    await vault.connect(pntHolder1).pegIn(lendAmount, pnt.address, forwarderHost.address, peginData, PNETWORK_CHAIN_IDS.polygonMainnet)

    // NOTE: at this point let's suppose that a pNetwork node processes the pegin...

    const enclavePeginMetadata = encode(
      ['bytes1', 'bytes', 'bytes4', 'address', 'bytes4', 'address', 'bytes', 'bytes'],
      ['0x02', peginData, PNETWORK_CHAIN_IDS.interim, router.address, PNETWORK_CHAIN_IDS.polygonMainnet, forwarderHost.address, '0x', '0x']
    )

    await expect(pToken.connect(pnetwork).mint(forwarderHost.address, lendAmount, enclavePeginMetadata, '0x'))
      .to.emit(borrowingManager, 'Lended')
      .withArgs(pntHolder1.address, 1, 12, lendAmount)
  })

  it('should be able to forward a updateSentinelRegistrationByStaking request', async () => {
    const stakeAmount = ethers.utils.parseEther('200000')
    const duration = EPOCH_DURATION * 13
    const signature = await getSentinelIdentity(pntHolder1.address, { sentinel: sentinel1 })

    const erc20Interface = new ethers.utils.Interface(['function approve(address spender, uint256 amount)'])
    const stakingManagerInterface = new ethers.utils.Interface([
      'function updateSentinelRegistrationByStaking(uint256 amount, uint64 duration, bytes signature, address receiver)'
    ])
    const peginData = encode(
      ['address[]', 'bytes[]'],
      [
        [pToken.address, registrationManager.address],
        [
          erc20Interface.encodeFunctionData('approve', [registrationManager.address, stakeAmount]),
          stakingManagerInterface.encodeFunctionData('updateSentinelRegistrationByStaking', [stakeAmount, duration, signature, pntHolder1.address])
        ]
      ]
    )

    await pnt.connect(pntHolder1).approve(vault.address, stakeAmount)
    await vault.connect(pntHolder1).pegIn(stakeAmount, pnt.address, forwarderHost.address, peginData, PNETWORK_CHAIN_IDS.polygonMainnet)

    // NOTE: at this point let's suppose that a pNetwork node processes the pegin...

    const enclavePeginMetadata = encode(
      ['bytes1', 'bytes', 'bytes4', 'address', 'bytes4', 'address', 'bytes', 'bytes'],
      ['0x02', peginData, PNETWORK_CHAIN_IDS.interim, router.address, PNETWORK_CHAIN_IDS.polygonMainnet, forwarderHost.address, '0x', '0x']
    )

    await expect(pToken.connect(pnetwork).mint(forwarderHost.address, stakeAmount, enclavePeginMetadata, '0x'))
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(pntHolder1.address, 1, 12, sentinel1.address, REGISTRATION_SENTINEL_STAKING, stakeAmount)
  })

  it('should be able to forward an unstake request', async () => {
    const amount = ethers.utils.parseEther('10000')
    const duration = ONE_DAY * 7

    const erc20Interface = new ethers.utils.Interface([
      'function approve(address spender, uint256 amount)',
      'function transfer(address recipient, uint256 amount)'
    ])
    const stakingManagerInterface = new ethers.utils.Interface(['function stake(uint256 amount, uint64 duration, address receiver)'])
    const peginData = encode(
      ['address[]', 'bytes[]'],
      [
        [pToken.address, stakingManager.address],
        [
          erc20Interface.encodeFunctionData('approve', [stakingManager.address, amount]),
          stakingManagerInterface.encodeFunctionData('stake', [amount, duration, pntHolder1.address])
        ]
      ]
    )

    await pnt.connect(pntHolder1).approve(vault.address, amount)
    await vault.connect(pntHolder1).pegIn(amount, pnt.address, forwarderHost.address, peginData, PNETWORK_CHAIN_IDS.polygonMainnet)

    const enclavePeginMetadata = encode(
      ['bytes1', 'bytes', 'bytes4', 'address', 'bytes4', 'address', 'bytes', 'bytes'],
      ['0x02', peginData, PNETWORK_CHAIN_IDS.interim, router.address, PNETWORK_CHAIN_IDS.polygonMainnet, forwarderHost.address, '0x', '0x']
    )
    await pToken.connect(pnetwork).mint(forwarderHost.address, amount, enclavePeginMetadata, '0x')

    await time.increase(duration + 1)
    await stakingManager.connect(pntHolder1).unstake(amount)

    const balancePre = await pnt.balanceOf(pntHolder1.address)

    // NOTE: at this point let's suppose that a pNetwork node processes the pegout...

    const pegoutData = encode(
      ['address[]', 'bytes[]'],
      [[pnt.address], [erc20Interface.encodeFunctionData('transfer', [pntHolder1.address, amount])]]
    )
    const enclavePegoutMetadata = encode(
      ['bytes1', 'bytes', 'bytes4', 'address', 'bytes4', 'address', 'bytes', 'bytes'],
      ['0x02', pegoutData, PNETWORK_CHAIN_IDS.interim, router.address, PNETWORK_CHAIN_IDS.ethereumMainnet, forwarderNative.address, '0x', '0x']
    )
    await expect(vault.connect(pnetwork).pegOut(forwarderNative.address, pnt.address, amount, enclavePegoutMetadata))
      .to.emit(pnt, 'Transfer')
      .withArgs(forwarderNative.address, pntHolder1.address, amount)

    const balancePost = await pnt.balanceOf(pntHolder1.address)
    expect(balancePost).to.be.eq(balancePre.add(amount))
  })
})
