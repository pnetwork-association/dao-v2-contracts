const { task } = require('hardhat/config')

const { PNT_ON_POLYGON_ADDRESS, ZERO_ADDRESS } = require('../tasks/config')

const deploy = async (_args, _hre) => {
  const Forwarder = await _hre.ethers.getContractFactory('Forwarder')
  console.log('Deploying forwarder on Polygon ...')
  const forwarder = await Forwarder.deploy(PNT_ON_POLYGON_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS)
  console.log('Forwarder deployed at', forwarder.address)
}

task('deploy:forwarder-polygon', 'Deploy Forwarder on Polygon', deploy)
