const { task } = require('hardhat/config')

const { PNT_ON_BSC_ADDRESS } = require('../tasks/config')

const deploy = async (_args, _hre) => {
  const Forwarder = await _hre.ethers.getContractFactory('ForwarderHost')
  console.log('Deploying forwarder on BSC ...')
  const forwarder = await Forwarder.deploy(PNT_ON_BSC_ADDRESS)
  console.log('Forwarder deployed at', await forwarder.getAddress())
}

task('deploy:forwarder-bsc', 'Deploy Forwarder on BSC', deploy)