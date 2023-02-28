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
  TOKEN_MANAGER_ADDRESS
} = require('./constants')

const PNETWORK_CHAIN_IDS = {
  polygonMainnet: '0x0075dd4c',
  ethereumMainnet: '0x005fe7f9'
}

let forwarderNative, forwarderHost, stakingManager, owner, pToken, pnetwork, sentinel1, root

describe('Forwarders', () => {
  beforeEach(async () => {
    const ForwarderNative = await ethers.getContractFactory('ForwarderNative')
    const ForwarderHost = await ethers.getContractFactory('ForwarderHost')
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
    pnetwork = await ethers.getImpersonatedSigner(PNETWORK_ADDRESS)
    pntHolder1 = await ethers.getImpersonatedSigner(PNT_HOLDER_1_ADDRESS)
    root = await ethers.getImpersonatedSigner(DAO_ROOT_ADDRESS)

    acl = await ACL.attach(ACL_ADDRESS)
    pnt = await ERC20.attach(PNT_ADDRESS)
    vault = await MockPTokensVault.attach(ERC20_VAULT)
    pToken = await MockPToken.deploy('Host Token (pToken)', 'HTKN', [], pnetwork.address, PNETWORK_CHAIN_IDS.polygonMainnet)

    stakingManager = await upgrades.deployProxy(StakingManager, [pToken.address, TOKEN_MANAGER_ADDRESS], {
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

    forwarderNative = await upgrades.deployProxy(ForwarderNative, [pnt.address, vault.address], {
      initializer: 'initialize',
      kind: 'uups'
    })

    forwarderHost = await upgrades.deployProxy(
      ForwarderHost,
      [pToken.address, forwarderNative.address, stakingManager.address, borrowingManager.address, registrationManager.address],
      {
        initializer: 'initialize',
        kind: 'uups'
      }
    )

    await forwarderNative.grantRole(getRole('SET_FORWARDER_HOST_ROLE'), owner.address)
    await forwarderNative.setForwarderHost(forwarderHost.address)

    await stakingManager.grantRole(getRole('SET_FORWARDER_HOST_ROLE'), owner.address)
    await stakingManager.setForwarderHost(forwarderHost.address)

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

    const peginData = encode(
      ['bytes4', 'uint64', 'address'],
      [ethers.utils.solidityKeccak256(['string'], ['stake(uint256,uint64,address)']).slice(0, 10), duration, pntHolder1.address]
    )

    await pnt.connect(pntHolder1).approve(forwarderNative.address, stakeAmount)
    await forwarderNative.connect(pntHolder1).stake(stakeAmount, duration, pntHolder1.address)

    // NOTE: at this point let's suppose that a pNetwork node processes the pegin...

    const enclavePeginMetadata = encode(
      ['bytes1', 'bytes', 'bytes4', 'address'],
      ['0x01', peginData, PNETWORK_CHAIN_IDS.polygonMainnet, forwarderNative.address]
    )

    await expect(pToken.connect(pnetwork).mint(forwarderHost.address, stakeAmount, enclavePeginMetadata, '0x'))
      .to.emit(stakingManager, 'Staked')
      .withArgs(pntHolder1.address, stakeAmount, duration)
  })

  it('should be able to forward a lend request', async () => {
    const lendAmount = ethers.utils.parseEther('10000')
    const duration = EPOCH_DURATION * 13

    const peginData = encode(
      ['bytes4', 'uint64', 'address'],
      [ethers.utils.solidityKeccak256(['string'], ['lend(uint256,uint64,address)']).slice(0, 10), duration, pntHolder1.address]
    )

    await pnt.connect(pntHolder1).approve(forwarderNative.address, lendAmount)
    await forwarderNative.connect(pntHolder1).lend(lendAmount, duration, pntHolder1.address)

    // NOTE: at this point let's suppose that a pNetwork node processes the pegin...

    const enclavePeginMetadata = encode(
      ['bytes1', 'bytes', 'bytes4', 'address'],
      ['0x01', peginData, PNETWORK_CHAIN_IDS.polygonMainnet, forwarderNative.address]
    )

    await expect(pToken.connect(pnetwork).mint(forwarderHost.address, lendAmount, enclavePeginMetadata, '0x'))
      .to.emit(borrowingManager, 'Lended')
      .withArgs(pntHolder1.address, 1, 12, lendAmount)
  })

  it('should be able to forward a updateSentinelRegistrationByStaking request', async () => {
    const stakeAmount = ethers.utils.parseEther('200000')
    const duration = EPOCH_DURATION * 13
    const signature = await getSentinelIdentity(pntHolder1.address, { sentinel: sentinel1 })

    const peginData = encode(
      ['bytes4', 'uint64', 'bytes', 'address'],
      [
        ethers.utils.solidityKeccak256(['string'], ['updateSentinelRegistrationByStaking(uint256,uint64,bytes,address)']).slice(0, 10),
        duration,
        signature,
        pntHolder1.address
      ]
    )

    await pnt.connect(pntHolder1).approve(forwarderNative.address, stakeAmount)
    await forwarderNative.connect(pntHolder1).updateSentinelRegistrationByStaking(stakeAmount, duration, signature, pntHolder1.address)

    // NOTE: at this point let's suppose that a pNetwork node processes the pegin...

    const enclavePeginMetadata = encode(
      ['bytes1', 'bytes', 'bytes4', 'address'],
      ['0x01', peginData, PNETWORK_CHAIN_IDS.polygonMainnet, forwarderNative.address]
    )

    await expect(pToken.connect(pnetwork).mint(forwarderHost.address, stakeAmount, enclavePeginMetadata, '0x'))
      .to.emit(registrationManager, 'SentinelRegistrationUpdated')
      .withArgs(pntHolder1.address, 1, 12, sentinel1.address, REGISTRATION_SENTINEL_STAKING, stakeAmount)
  })

  it('should be able to forward an unstake request', async () => {
    const amount = ethers.utils.parseEther('10000')
    const duration = ONE_DAY * 7

    const peginData = encode(
      ['bytes4', 'uint64', 'address'],
      [ethers.utils.solidityKeccak256(['string'], ['stake(uint256,uint64,address)']).slice(0, 10), duration, pntHolder1.address]
    )

    await pnt.connect(pntHolder1).approve(forwarderNative.address, amount)
    await forwarderNative.connect(pntHolder1).stake(amount, duration, pntHolder1.address)

    const enclavePeginMetadata = encode(
      ['bytes1', 'bytes', 'bytes4', 'address'],
      ['0x01', peginData, PNETWORK_CHAIN_IDS.polygonMainnet, forwarderNative.address]
    )
    await pToken.connect(pnetwork).mint(forwarderHost.address, amount, enclavePeginMetadata, '0x')

    await time.increase(duration + 1)
    await stakingManager.connect(pntHolder1).unstake(amount)

    const balancePre = await pnt.balanceOf(pntHolder1.address)

    // NOTE: at this point let's suppose that a pNetwork node processes the pegout...

    const pegoutData = encode(
      ['bytes4', 'address'],
      [ethers.utils.solidityKeccak256(['string'], ['unstake(uint256,address)']).slice(0, 10), pntHolder1.address]
    )
    const enclavePegoutMetadata = encode(
      ['bytes1', 'bytes', 'bytes4', 'address'],
      ['0x01', pegoutData, PNETWORK_CHAIN_IDS.ethereumMainnet, forwarderHost.address]
    )
    await expect(vault.connect(pnetwork).pegOut(forwarderNative.address, pnt.address, amount, enclavePegoutMetadata))
      .to.emit(pnt, 'Transfer')
      .withArgs(forwarderNative.address, pntHolder1.address, amount)

    const balancePost = await pnt.balanceOf(pntHolder1.address)
    expect(balancePost).to.be.eq(balancePre.add(amount))
  })
})
