const { task } = require('hardhat/config')

const {
  ADDRESSES: {
    GNOSIS: { PNT_ON_GNOSIS_ADDRESS }
  }
} = require('../lib/constants')

const deploy = async (_args, _hre) => {
  const Forwarder = await _hre.ethers.getContractFactory('ForwarderHost')
  console.log('Deploying forwarder on Gnosis ...')
  const forwarder = await Forwarder.deploy(PNT_ON_GNOSIS_ADDRESS)
  console.log('Forwarder deployed at', forwarder.target)
}

task('deploy:forwarder-gnosis', 'Deploy Forwarder on Gnosis', deploy)
