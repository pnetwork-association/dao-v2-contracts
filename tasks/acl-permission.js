const { Confirm } = require('enquirer')
const { task } = require('hardhat/config')

const {
  TASKS: {
    PARAM_NAME_ENTITY,
    PARAM_NAME_TARGET,
    PARAM_NAME_ROLE,
    PARAM_NAME_SAFE_ADDRESS,
    PARAM_FLAG_LEDGER_WALLET,
    PARAM_NAME_REVOKE,
    PARAM_NAME_GRANT
  }
} = require('../lib/constants')
const { getAllRoles } = require('../lib/roles')
const { getAdapter, proposeTransactionToSafe } = require('../lib/safe')

const proposeGrantRole = async (_args, _hre) => {
  const safeAddress = _args[PARAM_NAME_SAFE_ADDRESS]
  const targetAddress = _args[PARAM_NAME_TARGET]
  const entity = _args[PARAM_NAME_ENTITY]
  const role = _args[PARAM_NAME_ROLE]
  const revoke = !_args[PARAM_NAME_GRANT] || _args[PARAM_NAME_REVOKE]

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
    message: `${revoke ? 'Revoke' : 'Grant'} ${_args[PARAM_NAME_ROLE]} to ${entity} @ ${targetAddress}?`
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
  .addFlag(PARAM_NAME_REVOKE, 'Revoke a role')
  .addFlag(PARAM_NAME_GRANT, 'Grant a role')
  .addPositionalParam(PARAM_NAME_ROLE, 'Role name to be managed')
  .addPositionalParam(PARAM_NAME_ENTITY, 'Address to which role will be granted/revoked')
  .addPositionalParam(PARAM_NAME_TARGET, 'Target contract address')
  .addPositionalParam(PARAM_NAME_SAFE_ADDRESS, 'Safe address')
  .addFlag(PARAM_FLAG_LEDGER_WALLET, 'Use a Ledger wallet')
  .setAction(proposeGrantRole)
