const { task } = require('hardhat/config')

const {
  ADDRESSES: {
    GNOSIS: { PNT, FORWARDER, SAFE }
  }
} = require('../lib/constants')

const deploy = async (_args, _hre) => {
  if (_hre.network.name !== 'gnosis') {
    throw new Error('Invalid network')
  }
  const Forwarder = await _hre.ethers.getContractFactory('Forwarder')
  console.log('Deploying forwarder on Gnosis ...')
  const forwarder = await Forwarder.deploy(PNT, _hre.ethers.ZeroAddress)
  console.log('Forwarder deployed at', forwarder.target)
}

// eslint-disable-next-line no-unused-vars
const transferOwnership = async (_args, _hre) => {
  const c = await _hre.ethers.getContractAt('Forwarder', FORWARDER)
  await c.transferOwnership(SAFE)
}

task('deploy:forwarder-gnosis', 'Deploy Forwarder on Gnosis', deploy)
