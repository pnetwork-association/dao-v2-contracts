const { task } = require('hardhat/config')

const {
  ADDRESSES: {
    BSC: { PNT }
  }
} = require('../lib/constants')

const deploy = async (_args, _hre) => {
  if (_hre.network.name !== 'bsc') {
    throw new Error('Invalid network')
  }
  const Forwarder = await _hre.ethers.getContractFactory('ForwarderHost')
  console.log('Deploying forwarder on BSC ...')
  const forwarder = await Forwarder.deploy(PNT)
  console.log('Forwarder deployed at', forwarder.target)
}

task('deploy:forwarder-bsc', 'Deploy Forwarder on BSC', deploy)
