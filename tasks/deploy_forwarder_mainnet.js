const { task } = require('hardhat/config')

const {
  ADDRESSES: {
    MAINNET: { PNT, ERC20_VAULT, FORWARDER, SAFE }
  }
} = require('../lib/constants')

const deploy = async (_args, _hre) => {
  if (_hre.network.name !== 'mainnet') {
    throw new Error('Invalid network')
  }
  const Forwarder = await _hre.ethers.getContractFactory('Forwarder')
  console.log('Deploying forwarder on Ethereum ...')
  const forwarder = await Forwarder.deploy(PNT, ERC20_VAULT)
  console.log('Forwarder deployed at', forwarder.target)
}

// eslint-disable-next-line no-unused-vars
const transferOwnership = async (_args, _hre) => {
  const c = await _hre.ethers.getContractAt('Forwarder', FORWARDER)
  await c.transferOwnership(SAFE)
}

task('deploy:forwarder-mainnet', 'Deploy Forwarder on Mainnet', deploy)
