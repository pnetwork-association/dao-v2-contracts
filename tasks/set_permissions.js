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

const setPermissions = async (_args, _hre) => {
  const getRole = (_message) => _hre.ethers.keccak256(_hre.ethers.toUtf8Bytes(_message))
  const [signer] = await _hre.ethers.getSigners()

  const ACL = await _hre.ethers.getContractFactory('ACL')
  const StakingManager = await _hre.ethers.getContractFactory('StakingManager')
  const StakingManagerPermissioned = await _hre.ethers.getContractFactory('StakingManagerPermissioned')
  const LendingManager = await _hre.ethers.getContractFactory('LendingManager')
  const RegistrationManager = await _hre.ethers.getContractFactory('RegistrationManager')

  const acl = ACL.attach(ACL_ADDRESS)
  const stakingManager = StakingManager.attach(STAKING_MANAGER)
  const stakingManagerLM = StakingManagerPermissioned.attach(STAKING_MANAGER_LM)
  const stakingManagerRM = StakingManagerPermissioned.attach(STAKING_MANAGER_RM)
  const lendingManager = LendingManager.attach(LENDING_MANAGER)
  const registrationManager = RegistrationManager.attach(REGISTRATION_MANAGER)

  console.log('Setting ACL permissions ...')
  await acl.setPermissionManager(signer.address, TOKEN_MANAGER_ADDRESS, getRole('MINT_ROLE'))
  await acl.setPermissionManager(signer.address, TOKEN_MANAGER_ADDRESS, getRole('BURN_ROLE'))
  await acl.grantPermission(stakingManager.target, TOKEN_MANAGER_ADDRESS, getRole('MINT_ROLE'))
  await acl.grantPermission(stakingManager.target, TOKEN_MANAGER_ADDRESS, getRole('BURN_ROLE'))
  await acl.grantPermission(stakingManagerLM.target, TOKEN_MANAGER_ADDRESS, getRole('MINT_ROLE'))
  await acl.grantPermission(stakingManagerLM.target, TOKEN_MANAGER_ADDRESS, getRole('BURN_ROLE'))
  await acl.grantPermission(stakingManagerRM.target, TOKEN_MANAGER_ADDRESS, getRole('MINT_ROLE'))
  await acl.grantPermission(stakingManagerRM.target, TOKEN_MANAGER_ADDRESS, getRole('BURN_ROLE'))
  await stakingManagerLM.grantRole(getRole('STAKE_ROLE'), lendingManager.target)
  await stakingManagerLM.grantRole(getRole('INCREASE_DURATION_ROLE'), lendingManager.target)
  await stakingManagerRM.grantRole(getRole('STAKE_ROLE'), registrationManager.target)
  await stakingManagerRM.grantRole(getRole('INCREASE_DURATION_ROLE'), registrationManager.target)

  console.log('Assigning roles and whitelisting origin addresses ...')
  await lendingManager.grantRole(getRole('BORROW_ROLE'), registrationManager.target)
  // await forwarder.whitelistOriginAddress(FORWARDER_ON_MAINNET)
  // await forwarder.whitelistOriginAddress(FORWARDER_ON_BSC)

  // NOTE: remember to send 1 pnt to FORWARDER_ON_MAINNET and FORWARDER_ON_BSC
}

task('dao:set-permissions', 'Set permissions', setPermissions)
