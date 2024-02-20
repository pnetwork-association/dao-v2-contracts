const { task } = require('hardhat/config')

const { PNT_ON_ETH_ADDRESS, ERC20_VAULT } = require('../tasks/config')

const deploy = async (_args, _hre) => {
  const Forwarder = await _hre.ethers.getContractFactory('ForwarderNative')
  console.log('Deploying forwarder on Ethereum ...')
  const forwarder = await Forwarder.deploy(PNT_ON_ETH_ADDRESS, ERC20_VAULT)
  console.log('Forwarder deployed at', await forwarder.getAddress())
}

task('deploy:forwarder-mainnet', 'Deploy Forwarder on Mainnet', deploy)