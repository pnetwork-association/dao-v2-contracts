const { expect } = require('chai')
const { ethers, upgrades } = require('hardhat')
const { getRole, encode } = require('./utils')

const { ERC20_VAULT, ONE_DAY, PNETWORK_ADDRESS, PNT_ADDRESS, PNT_HOLDER_1_ADDRESS, TOKEN_MANAGER_ADDRESS } = require('./constants')

const PNETWORK_CHAIN_IDS = {
  polygonMainnet: '0x0075dd4c'
}

let forwarderNative, forwarderHost, stakingManager, owner, pToken, pnetwork

describe('Forwarders', () => {
  beforeEach(async () => {
    const ForwarderNative = await ethers.getContractFactory('ForwarderNative')
    const ForwarderHost = await ethers.getContractFactory('ForwarderHost')
    const StakingManager = await ethers.getContractFactory('StakingManager')
    const MockPToken = await ethers.getContractFactory('MockPToken')
    const ERC20 = await ethers.getContractFactory('ERC20')

    const signers = await ethers.getSigners()
    owner = signers[0]
    pnetwork = await ethers.getImpersonatedSigner(PNETWORK_ADDRESS)
    pntHolder1 = await ethers.getImpersonatedSigner(PNT_HOLDER_1_ADDRESS)

    pnt = await ERC20.attach(PNT_ADDRESS)
    pToken = await MockPToken.deploy('Host Token (pToken)', 'HTKN', [], pnetwork.address)

    stakingManager = await upgrades.deployProxy(StakingManager, [pToken.address, TOKEN_MANAGER_ADDRESS], {
      initializer: 'initialize',
      kind: 'uups'
    })

    forwarderNative = await upgrades.deployProxy(ForwarderNative, [pnt.address, ERC20_VAULT], {
      initializer: 'initialize',
      kind: 'uups'
    })

    forwarderHost = await upgrades.deployProxy(ForwarderHost, [pToken.address, forwarderNative.address, stakingManager.address], {
      initializer: 'initialize',
      kind: 'uups'
    })

    await forwarderNative.grantRole(getRole('SET_FORWARDER_HOST_ROLE'), owner.address)
    await forwarderNative.setForwarderHost(forwarderHost.address)

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
})
