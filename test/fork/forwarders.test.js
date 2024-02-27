const { expect } = require('chai')
const { config, ethers, network } = require('hardhat')

const pntOnGnosisAbi = require('../../lib/abi/PNTonGnosis.json')
const {
  ADDRESSES: {
    GNOSIS: {
      PNT_ON_GNOSIS_ADDRESS,
      FORWARDER_ON_GNOSIS,
      STAKING_MANAGER,
      DAOPNT_ON_GNOSIS_ADDRESS,
      PNT_ON_GNOSIS_MINTER
    },
    POLYGON: { FORWARDER_ON_POLYGON }
  },
  PNETWORK_NETWORK_IDS
} = require('../../lib/constants')
const { encodeMetadata } = require('../../lib/metadata')
const { hardhatReset } = require('../utils/hardhat-reset')
const { mintPToken } = require('../utils/pnetwork')

describe('Gnosis Forwarder', () => {
  let pToken, daoPNT, minter

  const missingSteps = async () => {
    const owner = await ethers.getImpersonatedSigner('0xfe0BC5fAc8f624093C9CeaeCF1EF14B4a5F84cE9')
    const forwarder = await ethers.getContractAt('ForwarderHost', FORWARDER_ON_GNOSIS)
    await forwarder.connect(owner).whitelistOriginAddress(FORWARDER_ON_POLYGON)
  }

  beforeEach(async () => {
    const rpc = config.networks.gnosis.url
    await hardhatReset(network.provider, rpc)
    await missingSteps()
    pToken = await ethers.getContractAt(pntOnGnosisAbi, PNT_ON_GNOSIS_ADDRESS)
    daoPNT = await ethers.getContractAt('ERC20', DAOPNT_ON_GNOSIS_ADDRESS)
    minter = await ethers.getImpersonatedSigner(PNT_ON_GNOSIS_MINTER)
  })

  const mintPnt = (_recipient, _value, _metadata) => mintPToken(pToken, minter, _recipient, _value, _metadata)

  it('should stake from forwarder call', async () => {
    const USER_ADDRESS = '0xdDb5f4535123DAa5aE343c24006F4075aBAF5F7B'
    const stakingManager = await ethers.getContractAt('StakingManager', STAKING_MANAGER)
    await ethers.provider.getBalance(USER_ADDRESS)
    const metadata = encodeMetadata(ethers, {
      userData:
        // secretlint-disable-next-line
        '0x0000000000000000000000000000000000000000000000000000000000000040000000000000000000000000ddb5f4535123daa5ae343c24006f4075abaf5f7b0000000000000000000000000000000000000000000000000000000000000220000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000020000000000000000000000000259461eed4d76d4f0f900f9035f6c4dfb39159a000000000000000000000000dee8ebe2b7152eccd935fd67134bf1bad55302bc0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000044095ea7b3000000000000000000000000dee8ebe2b7152eccd935fd67134bf1bad55302bc0000000000000000000000000000000000000000000000000162ea854d0fc0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000642b54f551000000000000000000000000ddb5f4535123daa5ae343c24006f4075abaf5f7b0000000000000000000000000000000000000000000000000162ea854d0fc0000000000000000000000000000000000000000000000000000000000000093a8000000000000000000000000000000000000000000000000000000000',
      sourceNetworkId: PNETWORK_NETWORK_IDS.POLYGON,
      senderAddress: FORWARDER_ON_POLYGON,
      destinationNetworkId: PNETWORK_NETWORK_IDS.GNOSIS,
      receiverAddress: FORWARDER_ON_GNOSIS
    })
    await expect(mintPnt(FORWARDER_ON_GNOSIS, 100000000000000000n, metadata)).to.emit(stakingManager, 'Staked')
    expect(await daoPNT.balanceOf(USER_ADDRESS)).to.be.eq(ethers.parseUnits('0.0999'))
    expect(await pToken.balanceOf(STAKING_MANAGER)).to.be.eq(ethers.parseUnits('0.0999'))
  })
})
