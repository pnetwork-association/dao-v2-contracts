const { task } = require('hardhat/config')

const {
  ADDRESSES: {
    GNOSIS: { PNT }
  }
} = require('../lib/constants')

const deploy = async (_args, _hre) => {
  if (_hre.network.name !== 'gnosis') {
    throw new Error('Invalid network')
  }
  const Forwarder = await _hre.ethers.getContractFactory('ForwarderHost')
  console.log('Deploying forwarder on Gnosis ...')
  const forwarder = await Forwarder.deploy(PNT)
  console.log('Forwarder deployed at', forwarder.target)
}

task('deploy:forwarder-gnosis', 'Deploy Forwarder on Gnosis', deploy)
