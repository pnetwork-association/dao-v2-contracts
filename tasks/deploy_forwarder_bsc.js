const { task } = require('hardhat/config')

const {
  ADDRESSES: {
    BSC: { PNT_ON_BSC_ADDRESS }
  }
} = require('../lib/constants')

const deploy = async (_args, _hre) => {
  if (_hre.network.name !== 'bsc') {
    console.error('Invalid network')
    _hre.exit(1)
  }
  const Forwarder = await _hre.ethers.getContractFactory('ForwarderHost')
  console.log('Deploying forwarder on BSC ...')
  const forwarder = await Forwarder.deploy(PNT_ON_BSC_ADDRESS)
  console.log('Forwarder deployed at', forwarder.target)
}

task('deploy:forwarder-bsc', 'Deploy Forwarder on BSC', deploy)
