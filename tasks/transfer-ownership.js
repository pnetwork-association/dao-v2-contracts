const { Confirm } = require('enquirer')
const { task } = require('hardhat/config')

const {
  TASKS: { PARAM_ADDRESS, PARAM_DESC_ADDRESS, PARAM_NEW_OWNER, PARAM_DESC_NEW_OWNER }
} = require('../lib/constants')

const main = async (_args, _hre) => {
  const c = await _hre.ethers.getContractAt('Ownable', _args[PARAM_ADDRESS])

  const upgradeConfirm = new Confirm({
    message: `Transfer ownership of ${_args[PARAM_ADDRESS]} to ${_args[PARAM_NEW_OWNER]}?`
  })

  if (!(await upgradeConfirm.run())) {
    console.info('Quitting')
    return
  }

  await c.transferOwnership(_args[PARAM_NEW_OWNER])
  console.info(`✔ Ownership transferred to ${_args[PARAM_NEW_OWNER]}...`)
}

task('permissions:transfer-ownership', ' Transfer contract ownership to a new owner')
  .addPositionalParam(PARAM_ADDRESS, PARAM_DESC_ADDRESS)
  .addPositionalParam(PARAM_NEW_OWNER, PARAM_DESC_NEW_OWNER)
  .setAction(main)
