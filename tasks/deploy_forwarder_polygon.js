const { task } = require('hardhat/config')

const {
  ADDRESSES: {
    POLYGON: { PNT }
  }
} = require('../lib/constants')

const deploy = async (_args, _hre) => {
  if (_hre.network.name !== 'polygon') {
    throw new Error('Invalid network')
  }
  const Forwarder = await _hre.ethers.getContractFactory('ForwarderHost')
  console.log('Deploying forwarder on Polygon ...')
  const forwarder = await Forwarder.deploy(PNT)
  console.log('Forwarder deployed at', forwarder.target)
}

task('deploy:forwarder-polygon', 'Deploy Forwarder on Polygon', deploy)
