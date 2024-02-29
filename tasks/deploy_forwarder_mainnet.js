const { task } = require('hardhat/config')

const {
  ADDRESSES: {
    MAINNET: { PNT, ERC20_VAULT }
  }
} = require('../lib/constants')

const deploy = async (_args, _hre) => {
  if (_hre.network.name !== 'mainnet') {
    throw new Error('Invalid network')
  }
  const Forwarder = await _hre.ethers.getContractFactory('ForwarderNative')
  console.log('Deploying forwarder on Ethereum ...')
  const forwarder = await Forwarder.deploy(PNT, ERC20_VAULT)
  console.log('Forwarder deployed at', forwarder.target)
}

task('deploy:forwarder-mainnet', 'Deploy Forwarder on Mainnet', deploy)
