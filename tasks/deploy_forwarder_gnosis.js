const { task } = require('hardhat/config')

const { PNT_ON_GNOSIS_ADDRESS } = require('../lib/constants')

const deploy = async (_args, _hre) => {
  const Forwarder = await _hre.ethers.getContractFactory('ForwarderHost')
  console.log('Deploying forwarder on Gnosis ...')
  const forwarder = await Forwarder.deploy(PNT_ON_GNOSIS_ADDRESS)
  console.log('Forwarder deployed at', await forwarder.getAddress())
}

task('deploy:forwarder-gnosis', 'Deploy Forwarder on Gnosis', deploy)
