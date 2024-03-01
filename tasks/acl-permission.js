const { Confirm } = require('enquirer')
const { task } = require('hardhat/config')

const {
  TASKS: {
    PARAM_ENTITY,
    PARAM_DESC_ENTITY,
    PARAM_TARGET,
    PARAM_DESC_TARGET,
    PARAM_ROLE,
    PARAM_DESC_ROLE,
    PARAM_SAFE,
    PARAM_DESC_SAFE,
    PARAM_FLAG_LEDGER_WALLET,
    PARAM_DESC_FLAG_LEDGER_WALLET,
    PARAM_REVOKE,
    PARAM_DESC_REVOKE,
    PARAM_GRANT,
    PARAM_DESC_GRANT
  }
} = require('../lib/constants')
const { getAllRoles } = require('../lib/roles')
const { getAdapter, proposeTransactionToSafe } = require('../lib/safe')

const proposeGrantRole = async (_args, _hre) => {
  const safeAddress = _args[PARAM_SAFE]
  const targetAddress = _args[PARAM_TARGET]
  const entity = _args[PARAM_ENTITY]
  const role = _args[PARAM_ROLE]
  const revoke = !_args[PARAM_GRANT] || _args[PARAM_REVOKE]

  const roles = getAllRoles(_hre.ethers)

  if (!(role in roles)) throw new Error(`Invalid role ${role}`)

  const contract = await _hre.ethers.getContractAt('AccessControlUpgradeable', targetAddress)

  revoke
    ? console.info(`✔ Checking if ${entity} address does not have ${role} on ${targetAddress}...`)
    : console.info(`✔ Checking if ${entity} address already has ${role} on ${targetAddress}...`)
  if (revoke !== (await contract.hasRole(roles[role], entity))) {
    revoke
      ? console.info(`✘ Failed: ${entity} does not have role ${role}`)
      : console.info(`✘ Failed: ${entity} already has role ${role}`)
    return
  }

  console.info(`✔ Checking if the safe ${safeAddress} has DEFAULT_ADMIN_ROLE' on ${targetAddress}...`)
  if (!(await contract.hasRole(roles.DEFAULT_ADMIN_ROLE, safeAddress))) {
    console.info('✘ Failed: SAFE account does not have DEFAULT_ADMIN_ROLE')
    return
  }

  const actionConfirm = new Confirm({
    message: `${revoke ? 'Revoke' : 'Grant'} ${_args[PARAM_ROLE]} to ${entity} @ ${targetAddress}?`
  })
  if (!(await actionConfirm.run())) {
    console.info('Quitting')
    return
  }

  const transactionData = contract.interface.encodeFunctionData(revoke ? 'revokeRoke' : 'grantRole', [
    roles[role],
    entity
  ])

  const adapter = await getAdapter(_hre.ethers, _args[PARAM_FLAG_LEDGER_WALLET])
  await proposeTransactionToSafe(adapter, safeAddress, targetAddress, 0, transactionData)
  console.info("✔ Done! Check your safe wallet's transaction queue")
}

task('permissions:acl-manage', 'Propose grant/revoke role transaction to safe multisig')
  .addFlag(PARAM_REVOKE, PARAM_DESC_REVOKE)
  .addFlag(PARAM_GRANT, PARAM_DESC_GRANT)
  .addPositionalParam(PARAM_ROLE, PARAM_DESC_ROLE)
  .addPositionalParam(PARAM_ENTITY, PARAM_DESC_ENTITY)
  .addPositionalParam(PARAM_TARGET, PARAM_DESC_TARGET)
  .addPositionalParam(PARAM_SAFE, PARAM_DESC_SAFE)
  .addFlag(PARAM_FLAG_LEDGER_WALLET, PARAM_DESC_FLAG_LEDGER_WALLET)
  .setAction(proposeGrantRole)
