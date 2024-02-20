const { expect } = require('chai')
const hre = require('hardhat')

const {
  PNT_ON_GNOSIS_ADDRESS,
  PNT_ON_POLYGON_ADDRESS,
  FORWARDER_ON_GNOSIS,
  FORWARDER_ON_POLYGON,
  STAKING_MANAGER,
  DAOPNT_ON_GNOSIS_ADDRESS
} = require('../../tasks/config')
const pntOnGnosisAbi = require('../abi/PNTonGnosis.json')
const pntOnPolygonAbi = require('../abi/PNTonPolygon.json')
const { PNETWORK_NETWORK_IDS } = require('../constants')
const { encode } = require('../utils')
const { hardhatReset } = require('../utils/hardhat-reset')
const { sendEth } = require('../utils/send-eth')

describe('Polygon Forwarder', () => {
  beforeEach(async () => {
    const rpc = hre.config.networks.polygon.url
    await hardhatReset(hre.network.provider, rpc)
  })

  it('should call forwarder for staking', async () => {
    const [owner] = await hre.ethers.getSigners()
    const daoRoot = await hre.ethers.getImpersonatedSigner('0xdDb5f4535123DAa5aE343c24006F4075aBAF5F7B')
    await sendEth(hre, owner, daoRoot, hre.ethers.parseEther('7'))
    await hre.ethers.provider.getBalance('0xdDb5f4535123DAa5aE343c24006F4075aBAF5F7B')
    const forwarder = await hre.ethers.getContractAt('IForwarder', FORWARDER_ON_POLYGON)
    const pToken = await hre.ethers.getContractAt(pntOnPolygonAbi, PNT_ON_POLYGON_ADDRESS)
    await expect(
      forwarder.connect(daoRoot).call(
        '100000000000000000',
        FORWARDER_ON_GNOSIS,
        // secretlint-disable-next-line
        '0x000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000020000000000000000000000000259461eed4d76d4f0f900f9035f6c4dfb39159a000000000000000000000000dee8ebe2b7152eccd935fd67134bf1bad55302bc0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000044095ea7b3000000000000000000000000dee8ebe2b7152eccd935fd67134bf1bad55302bc0000000000000000000000000000000000000000000000000162ea854d0fc0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000642b54f551000000000000000000000000ddb5f4535123daa5ae343c24006f4075abaf5f7b0000000000000000000000000000000000000000000000000162ea854d0fc0000000000000000000000000000000000000000000000000000000000000093a8000000000000000000000000000000000000000000000000000000000',
        '0x00f1918e'
      )
    )
      .to.emit(pToken, 'Redeem')
      .withArgs(
        await forwarder.getAddress(),
        100000000000000000n,
        FORWARDER_ON_GNOSIS.toLowerCase().slice(2),
        // secretlint-disable-next-line
        '0x0000000000000000000000000000000000000000000000000000000000000040000000000000000000000000ddb5f4535123daa5ae343c24006f4075abaf5f7b0000000000000000000000000000000000000000000000000000000000000220000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000020000000000000000000000000259461eed4d76d4f0f900f9035f6c4dfb39159a000000000000000000000000dee8ebe2b7152eccd935fd67134bf1bad55302bc0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000044095ea7b3000000000000000000000000dee8ebe2b7152eccd935fd67134bf1bad55302bc0000000000000000000000000000000000000000000000000162ea854d0fc0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000642b54f551000000000000000000000000ddb5f4535123daa5ae343c24006f4075abaf5f7b0000000000000000000000000000000000000000000000000162ea854d0fc0000000000000000000000000000000000000000000000000000000000000093a8000000000000000000000000000000000000000000000000000000000',
        '0x00000000',
        PNETWORK_NETWORK_IDS.gnosisMainnet
      )
  })
})

describe('Gnosis Forwarder', () => {
  const missingSteps = async () => {
    const owner = await hre.ethers.getImpersonatedSigner('0xfe0BC5fAc8f624093C9CeaeCF1EF14B4a5F84cE9')
    const forwarder = await hre.ethers.getContractAt('ForwarderHost', FORWARDER_ON_GNOSIS)
    await forwarder.connect(owner).whitelistOriginAddress(FORWARDER_ON_POLYGON)
  }

  beforeEach(async () => {
    const rpc = hre.config.networks.gnosis.url
    await hardhatReset(hre.network.provider, rpc)
    await missingSteps()
  })

  it('should stake from forwarder call', async () => {
    const USER = '0xdDb5f4535123DAa5aE343c24006F4075aBAF5F7B'
    const pnetwork = await hre.ethers.getImpersonatedSigner('0x53d51f8801f40657ca566a1ae25b27eada97413c')
    const stakingManager = await hre.ethers.getContractAt('StakingManager', STAKING_MANAGER)
    await hre.ethers.provider.getBalance('0xdDb5f4535123DAa5aE343c24006F4075aBAF5F7B')
    const pToken = await hre.ethers.getContractAt(pntOnGnosisAbi, PNT_ON_GNOSIS_ADDRESS)
    const daoPNT = await hre.ethers.getContractAt('ERC20', DAOPNT_ON_GNOSIS_ADDRESS)
    const metadata = encode(
      ['bytes1', 'bytes', 'bytes4', 'address', 'bytes4', 'address', 'bytes', 'bytes'],
      [
        '0x02',
        // secretlint-disable-next-line
        '0x0000000000000000000000000000000000000000000000000000000000000040000000000000000000000000ddb5f4535123daa5ae343c24006f4075abaf5f7b0000000000000000000000000000000000000000000000000000000000000220000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000020000000000000000000000000259461eed4d76d4f0f900f9035f6c4dfb39159a000000000000000000000000dee8ebe2b7152eccd935fd67134bf1bad55302bc0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000044095ea7b3000000000000000000000000dee8ebe2b7152eccd935fd67134bf1bad55302bc0000000000000000000000000000000000000000000000000162ea854d0fc0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000642b54f551000000000000000000000000ddb5f4535123daa5ae343c24006f4075abaf5f7b0000000000000000000000000000000000000000000000000162ea854d0fc0000000000000000000000000000000000000000000000000000000000000093a8000000000000000000000000000000000000000000000000000000000',
        PNETWORK_NETWORK_IDS.polygonMainnet,
        '0xC85cd78555DF9991245F15c7AA6c4eDBb7791c19',
        PNETWORK_NETWORK_IDS.gnosisMainnet,
        '0x49157Ddc1cA1907AC7b1f6e871Aa90e93567aDa4',
        '0x',
        '0x'
      ]
    )
    await expect(pToken.connect(pnetwork).mint(FORWARDER_ON_GNOSIS, 100000000000000000n, metadata, '0x')).to.emit(
      stakingManager,
      'Staked'
    )
    expect(await daoPNT.balanceOf(USER)).to.be.eq(hre.ethers.parseUnits('0.0999'))
    expect(await pToken.balanceOf(STAKING_MANAGER)).to.be.eq(hre.ethers.parseUnits('0.0999'))
  })
})
