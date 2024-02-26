const { types, task } = require('hardhat/config')

const {
  TASKS: { PARAM_CONTRACT_FACTORY, PARAM_DESC_CONTRACT_FACTORY, PARAM_PROXY_ADDRESS, PARAM_DESC_PROXY_ADDRESS }
} = require('../lib/constants')

const forceImport = (_taskArgs, _hre) =>
  console.info('Forcing import for contract...') ||
  _hre.ethers
    .getContractFactory(_taskArgs[PARAM_CONTRACT_FACTORY])
    .then((_contractFactory) => _hre.upgrades.forceImport(_taskArgs[PARAM_PROXY_ADDRESS], _contractFactory))
    .then((_) => console.info('Imported successfully!'))

task('utils:force-import', 'Force import an already deployed proxy', forceImport)
  .addPositionalParam(PARAM_PROXY_ADDRESS, PARAM_DESC_PROXY_ADDRESS, undefined, types.string)
  .addPositionalParam(PARAM_CONTRACT_FACTORY, PARAM_DESC_CONTRACT_FACTORY, undefined, types.string)
