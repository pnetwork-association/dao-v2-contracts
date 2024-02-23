const { task } = require('hardhat/config')

const {
  ACL_ADDRESS,
  TOKEN_MANAGER_ADDRESS,
  STAKING_MANAGER,
  STAKING_MANAGER_LM,
  STAKING_MANAGER_RM,
  LENDING_MANAGER,
  REGISTRATION_MANAGER
} = require('../lib/constants')
const { getAllRoles } = require('../lib/roles')

const setPermissions = async (_args, { ethers }) => {
  const { MINT_ROLE, BURN_ROLE, STAKE_ROLE, INCREASE_DURATION_ROLE, BORROW_ROLE } = getAllRoles(ethers)
  const [signer] = await ethers.getSigners()

  const ACL = await ethers.getContractFactory('ACL')
  const StakingManager = await ethers.getContractFactory('StakingManager')
  const StakingManagerPermissioned = await ethers.getContractFactory('StakingManagerPermissioned')
  const LendingManager = await ethers.getContractFactory('LendingManager')
  const RegistrationManager = await ethers.getContractFactory('RegistrationManager')

  const acl = ACL.attach(ACL_ADDRESS)
  const stakingManager = StakingManager.attach(STAKING_MANAGER)
  const stakingManagerLM = StakingManagerPermissioned.attach(STAKING_MANAGER_LM)
  const stakingManagerRM = StakingManagerPermissioned.attach(STAKING_MANAGER_RM)
  const lendingManager = LendingManager.attach(LENDING_MANAGER)
  const registrationManager = RegistrationManager.attach(REGISTRATION_MANAGER)

  console.log('Setting ACL permissions ...')
  await acl.setPermissionManager(signer.address, TOKEN_MANAGER_ADDRESS, MINT_ROLE)
  await acl.setPermissionManager(signer.address, TOKEN_MANAGER_ADDRESS, BURN_ROLE)
  await acl.grantPermission(stakingManager.target, TOKEN_MANAGER_ADDRESS, MINT_ROLE)
  await acl.grantPermission(stakingManager.target, TOKEN_MANAGER_ADDRESS, BURN_ROLE)
  await acl.grantPermission(stakingManagerLM.target, TOKEN_MANAGER_ADDRESS, MINT_ROLE)
  await acl.grantPermission(stakingManagerLM.target, TOKEN_MANAGER_ADDRESS, BURN_ROLE)
  await acl.grantPermission(stakingManagerRM.target, TOKEN_MANAGER_ADDRESS, MINT_ROLE)
  await acl.grantPermission(stakingManagerRM.target, TOKEN_MANAGER_ADDRESS, BURN_ROLE)
  await stakingManagerLM.grantRole(STAKE_ROLE, lendingManager.target)
  await stakingManagerLM.grantRole(INCREASE_DURATION_ROLE, lendingManager.target)
  await stakingManagerRM.grantRole(STAKE_ROLE, registrationManager.target)
  await stakingManagerRM.grantRole(INCREASE_DURATION_ROLE, registrationManager.target)

  console.log('Assigning roles and whitelisting origin addresses ...')
  await lendingManager.grantRole(BORROW_ROLE, registrationManager.target)
  // await forwarder.whitelistOriginAddress(FORWARDER_ON_MAINNET)
  // await forwarder.whitelistOriginAddress(FORWARDER_ON_BSC)

  // NOTE: remember to send 1 pnt to FORWARDER_ON_MAINNET and FORWARDER_ON_BSC
}

task('permissions:set-permissions', 'Set permissions', setPermissions)
