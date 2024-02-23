const { task } = require('hardhat/config')

const {
  ADDRESSES: {
    POLYGON: { PNT_ON_POLYGON_ADDRESS }
  }
} = require('../lib/constants')

const deploy = async (_args, _hre) => {
  if (_hre.network.name !== 'polygon') {
    throw new Error('Invalid network')
  }
  const Forwarder = await _hre.ethers.getContractFactory('ForwarderHost')
  console.log('Deploying forwarder on Polygon ...')
  const forwarder = await Forwarder.deploy(PNT_ON_POLYGON_ADDRESS)
  console.log('Forwarder deployed at', forwarder.target)
}

task('deploy:forwarder-polygon', 'Deploy Forwarder on Polygon', deploy)
