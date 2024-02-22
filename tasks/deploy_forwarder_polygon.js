const { task } = require('hardhat/config')

const {
  ADDRESSES: {
    POLYGON: { PNT_ON_POLYGON_ADDRESS }
  }
} = require('../lib/constants')

const deploy = async (_args, _hre) => {
  const Forwarder = await _hre.ethers.getContractFactory('ForwarderHost')
  console.log('Deploying forwarder on Polygon ...')
  const forwarder = await Forwarder.deploy(PNT_ON_POLYGON_ADDRESS)
  console.log('Forwarder deployed at', await forwarder.getAddress())
}

task('deploy:forwarder-polygon', 'Deploy Forwarder on Polygon', deploy)
