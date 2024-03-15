const { task } = require('hardhat/config')

const {
  ADDRESSES: {
    MAINNET: { PNT, ETHPNT, ERC20_VAULT, FORWARDER_PNT, FORWARDER_ETHPNT, SAFE }
  }
} = require('../lib/constants')

const deployForwarderPNT = async (_args, _hre) => {
  if (_hre.network.name !== 'mainnet') {
    throw new Error('Invalid network')
  }
  const Forwarder = await _hre.ethers.getContractFactory('Forwarder')
  console.log('Deploying forwarder on Ethereum ...')
  const forwarder = await Forwarder.deploy(PNT, ERC20_VAULT)
  console.log('Forwarder deployed at', forwarder.target)
}

// eslint-disable-next-line no-unused-vars
const deployForwarderEthPNT = async (_args, _hre) => {
  if (_hre.network.name !== 'mainnet') {
    throw new Error('Invalid network')
  }
  const Forwarder = await _hre.ethers.getContractFactory('Forwarder')
  console.log('Deploying forwarder on Ethereum ...')
  const forwarder = await Forwarder.deploy(ETHPNT, ERC20_VAULT)
  console.log('Forwarder deployed at', forwarder.target)
}

// eslint-disable-next-line no-unused-vars
const transferOwnershipForwarderPNT = async (_args, _hre) => {
  const c = await _hre.ethers.getContractAt('Forwarder', FORWARDER_PNT)
  await c.transferOwnership(SAFE)
}

// eslint-disable-next-line no-unused-vars
const transferOwnershipForwarderEthPNT = async (_args, _hre) => {
  const c = await _hre.ethers.getContractAt('Forwarder', FORWARDER_ETHPNT)
  await c.transferOwnership(SAFE)
}

task('deploy:forwarder-mainnet', 'Deploy Forwarder on Mainnet', deployForwarderPNT)
