const { ethers, upgrades } = require('hardhat')
const { getRole } = require('../test/utils/index')
const {
  ACL_ADDRESS,
  EPOCH_DURATION,
  FORWARDER_ON_BSC,
  FORWARDER_ON_MAINNET,
  FORWARDER_ON_POLYGON,
  LEND_MAX_EPOCHS,
  MINIMUM_BORROWING_FEE,
  PNT_ON_POLYGON_ADDRESS,
  PNT_MAX_TOTAL_SUPPLY,
  TOKEN_MANAGER_ADDRESS
} = require('./config')

const main = async () => {
  const signer = await ethers.getSigner()

  const ACL = await ethers.getContractFactory('ACL')
  const StakingManager = await ethers.getContractFactory('StakingManager')
  const StakingManagerPermissioned = await ethers.getContractFactory('StakingManagerPermissioned')
  const EpochsManager = await ethers.getContractFactory('EpochsManager')
  const LendingManager = await ethers.getContractFactory('LendingManager')
  const RegistrationManager = await ethers.getContractFactory('RegistrationManager')
  const FeesManager = await ethers.getContractFactory('FeesManager')
  const Forwarder = await ethers.getContractFactory('Forwarder')

  const acl = await ACL.attach(ACL_ADDRESS)
  const forwarder = await Forwarder.attach(FORWARDER_ON_POLYGON)

  console.info('StakingManager ...')
  const stakingManager = await upgrades.deployProxy(
    StakingManager,
    [PNT_ON_POLYGON_ADDRESS, TOKEN_MANAGER_ADDRESS, forwarder.address, PNT_MAX_TOTAL_SUPPLY],
    {
      initializer: 'initialize',
      kind: 'uups'
    }
  )

  console.info('StakingManager BM ...')
  const stakingManagerBM = await upgrades.deployProxy(
    StakingManagerPermissioned,
    [PNT_ON_POLYGON_ADDRESS, TOKEN_MANAGER_ADDRESS, forwarder.address, PNT_MAX_TOTAL_SUPPLY],
    {
      initializer: 'initialize',
      kind: 'uups'
    }
  )

  console.info('StakingManager RM ...')
  const stakingManagerRM = await upgrades.deployProxy(
    StakingManagerPermissioned,
    [PNT_ON_POLYGON_ADDRESS, TOKEN_MANAGER_ADDRESS, forwarder.address, PNT_MAX_TOTAL_SUPPLY],
    {
      initializer: 'initialize',
      kind: 'uups'
    }
  )

  console.info('EpochsManager ...')
  const epochsManager = await upgrades.deployProxy(EpochsManager, [EPOCH_DURATION], {
    initializer: 'initialize',
    kind: 'uups'
  })

  console.info('LendingManager ...')
  const lendingManager = await upgrades.deployProxy(
    LendingManager,
    [PNT_ON_POLYGON_ADDRESS, stakingManagerBM.address, epochsManager.address, forwarder.address, LEND_MAX_EPOCHS],
    {
      initializer: 'initialize',
      kind: 'uups'
    }
  )

  console.info('RegistrationManager ...')
  const registrationManager = await upgrades.deployProxy(
    RegistrationManager,
    [PNT_ON_POLYGON_ADDRESS, stakingManagerRM.address, epochsManager.address, lendingManager.address, forwarder.address],
    {
      initializer: 'initialize',
      kind: 'uups'
    }
  )

  console.info('FeesManager ...')
  const feesManager = await upgrades.deployProxy(
    FeesManager,
    [epochsManager.address, lendingManager.address, registrationManager.address, forwarder.address, MINIMUM_BORROWING_FEE],
    {
      initializer: 'initialize',
      kind: 'uups'
    }
  )

  console.log('Setting ACL permissions ...')
  // await acl.setPermissionManager(signer.address, TOKEN_MANAGER_ADDRESS, getRole('MINT_ROLE'))
  // await acl.setPermissionManager(signer.address, TOKEN_MANAGER_ADDRESS, getRole('BURN_ROLE'))
  await acl.grantPermission(stakingManager.address, TOKEN_MANAGER_ADDRESS, getRole('MINT_ROLE'))
  await acl.grantPermission(stakingManager.address, TOKEN_MANAGER_ADDRESS, getRole('BURN_ROLE'))
  await acl.grantPermission(stakingManagerBM.address, TOKEN_MANAGER_ADDRESS, getRole('MINT_ROLE'))
  await acl.grantPermission(stakingManagerBM.address, TOKEN_MANAGER_ADDRESS, getRole('BURN_ROLE'))
  await acl.grantPermission(stakingManagerRM.address, TOKEN_MANAGER_ADDRESS, getRole('MINT_ROLE'))
  await acl.grantPermission(stakingManagerRM.address, TOKEN_MANAGER_ADDRESS, getRole('BURN_ROLE'))
  await stakingManagerBM.grantRole(getRole('STAKE_ROLE'), lendingManager.address)
  await stakingManagerBM.grantRole(getRole('INCREASE_DURATION_ROLE'), lendingManager.address)
  await stakingManagerRM.grantRole(getRole('STAKE_ROLE'), registrationManager.address)
  await stakingManagerRM.grantRole(getRole('INCREASE_DURATION_ROLE'), registrationManager.address)

  console.log('Assigning roles and whitelisting origin addresses ...')
  await lendingManager.grantRole(getRole('BORROW_ROLE'), registrationManager.address)
  await forwarder.whitelistOriginAddress(FORWARDER_ON_MAINNET)
  await forwarder.whitelistOriginAddress(FORWARDER_ON_BSC)

  // NOTE: remember to send 1 pnt to FORWARDER_ON_MAINNET and FORWARDER_ON_BSC

  console.log(
    JSON.stringify({
      stakingManager: stakingManager.address,
      stakingManagerBM: stakingManagerBM.address,
      stakingManagerRM: stakingManagerRM.address,
      lendingManager: lendingManager.address,
      epochsManager: epochsManager.address,
      registrationManager: registrationManager.address,
      feesManager: feesManager.address
    })
  )
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
