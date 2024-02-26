const { task } = require('hardhat/config')

const {
  TASKS: { PARAM_CONTRACT_FACTORY, PARAM_DESC_CONTRACT_FACTORY, PARAM_ADDRESS, PARAM_DESC_PROXY_ADDRESS }
} = require('../lib/constants')

const upgrade = async (_args, _hre) => {
  const factory = await _hre.ethers.getContractFactory(_args.factory)
  const address = _args.address
  await _hre.upgrades.upgradeProxy(address, factory)
}

task('upgrade:proxy', 'Upgrade proxy')
  .setAction(upgrade)
  .addPositionalParam(PARAM_CONTRACT_FACTORY, PARAM_DESC_CONTRACT_FACTORY)
  .addPositionalParam(PARAM_ADDRESS, PARAM_DESC_PROXY_ADDRESS)
