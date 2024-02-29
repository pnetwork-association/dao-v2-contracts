const { assert } = require('chai')
const { Confirm } = require('enquirer')
const { task } = require('hardhat/config')

const {
  TASKS: {
    PARAM_PROXY,
    PARAM_DESC_PROXY,
    PARAM_SAFE,
    PARAM_DESC_SAFE,
    PARAM_IMPLEMENTATION,
    PARAM_DESC_IMPLEMENTATION,
    PARAM_FLAG_LEDGER_WALLET,
    PARAM_DESC_FLAG_LEDGER_WALLET,
    PARAM_CONTRACT_FACTORY,
    PARAM_DESC_CONTRACT_FACTORY
  }
} = require('../lib/constants')
const { getAllRoles } = require('../lib/roles')
const { getAdapter, proposeTransactionToSafe } = require('../lib/safe')

const proposeUpgrade = async (_args, _hre) => {
  const safeAddress = _args[PARAM_SAFE]
  const proxyAddress = _args[PARAM_PROXY]
  const { UPGRADE_ROLE } = getAllRoles(_hre.ethers)
  const proxyAccessControl = await _hre.ethers.getContractAt('AccessControlUpgradeable', proxyAddress)

  console.info(`✔ Checking that the safe ${safeAddress} has UPGRADE_ROLE' on proxy ${proxyAddress}...`)
  if (!(await proxyAccessControl.hasRole(UPGRADE_ROLE, safeAddress))) {
    console.info('✘ Failed: grant the UPGRADE_ROLE to submit an upgrade')
    return
  }

  const factoryName = _args[PARAM_CONTRACT_FACTORY]
  const factory = await _hre.ethers.getContractFactory(factoryName)

  console.info(`✔ Validating new implementation of ${factoryName} against proxy ${proxyAddress}...`)
  await _hre.upgrades.validateUpgrade(proxyAddress, factory)

  let newImplementation
  if (_args[PARAM_IMPLEMENTATION]) {
    newImplementation = _args[PARAM_IMPLEMENTATION]
    console.info(`✔ Using new implementation ${newImplementation}`)
    // check for length equality, better than nothing
    const code = await _hre.ethers.provider.getCode(newImplementation)
    const expected = (await _hre.artifacts.readArtifact(factoryName)).deployedBytecode
    assert(code.length === expected.length, 'Invalid bytecode!')
  } else {
    console.info('✘ No new implementation provided')
    const deployConfirm = new Confirm({ message: 'Deploying new implementation?' })
    if (!(await deployConfirm.run())) {
      console.info('✘ Quitting')
      return
    }

    console.info('✔ Deploying...')
    const deployedContract = await factory.deploy()
    await deployedContract.waitForDeployment()
    newImplementation = deployedContract.target
    console.info(`✔ Deployed new implementation ${newImplementation}`)
  }

  const upgradeConfirm = new Confirm({ message: `Upgrade proxy ${proxyAddress} to ${newImplementation}?` })
  if (!(await upgradeConfirm.run())) {
    console.info('Quitting')
    return
  }

  const upgradeTransactionData = factory.interface.encodeFunctionData('upgradeTo', [newImplementation])

  const adapter = await getAdapter(_hre.ethers, _args[PARAM_FLAG_LEDGER_WALLET])

  await proposeTransactionToSafe(adapter, _args[PARAM_SAFE], _args[PARAM_PROXY], 0, upgradeTransactionData)
  console.info("✔ Done! Check your safe wallet's transaction queue")
}

task('upgrade:proxy-safe', 'Propose contract upgrade to safe multisig')
  .addPositionalParam(PARAM_CONTRACT_FACTORY, PARAM_DESC_CONTRACT_FACTORY)
  .addPositionalParam(PARAM_PROXY, PARAM_DESC_PROXY)
  .addPositionalParam(PARAM_SAFE, PARAM_DESC_SAFE)
  .addOptionalParam(PARAM_IMPLEMENTATION, PARAM_DESC_IMPLEMENTATION)
  .addFlag(PARAM_FLAG_LEDGER_WALLET, PARAM_DESC_FLAG_LEDGER_WALLET)
  .setAction(proposeUpgrade)
