const { ethers, upgrades } = require('hardhat')
const { getRole } = require('../test/utils/index')

const ACL_ADDRESS = '0xB83ebd9296bE6D86325b68f6DC6bf2f923576580'
const EPOCH_DURATION = 60 * 60 * 24 * 15
const PNT_ON_ETH_ADDRESS = '0x89Ab32156e46F46D02ade3FEcbe5Fc4243B9AAeD'
const PNT_ON_POLYGON_ADDRESS = '0xb6bcae6468760bc0cdfb9c8ef4ee75c9dd23e1ed'
const TOKEN_MANAGER_ADDRESS = '0x6609795E38610CDCcde50A49295B01597B9557dE'
const LEND_MAX_EPOCHS = 24
const MINIMUM_BORROWING_FEE = 0.3 * 10 ** 6 // 30%
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

const main = async () => {
  const signer = await ethers.getSigner()

  const ACL = await ethers.getContractFactory('ACL')
  const StakingManager = await ethers.getContractFactory('StakingManagerF')
  const EpochsManager = await ethers.getContractFactory('EpochsManager')
  const BorrowingManager = await ethers.getContractFactory('BorrowingManager')
  const RegistrationManager = await ethers.getContractFactory('RegistrationManager')
  const FeesManager = await ethers.getContractFactory('FeesManager')
  const Forwarder = await ethers.getContractFactory('Forwarder')

  const acl = await ACL.attach(ACL_ADDRESS)

  console.info('StakingManager ...')
  const stakingManager = await upgrades.deployProxy(StakingManager, [PNT_ON_POLYGON_ADDRESS, PNT_ON_ETH_ADDRESS, TOKEN_MANAGER_ADDRESS], {
    initializer: 'initialize',
    kind: 'uups'
  })

  console.info('EpochsManager ...')
  const epochsManager = await upgrades.deployProxy(EpochsManager, [EPOCH_DURATION], {
    initializer: 'initialize',
    kind: 'uups'
  })

  console.info('BorrowingManager ...')
  const borrowingManager = await upgrades.deployProxy(
    BorrowingManager,
    [PNT_ON_POLYGON_ADDRESS, stakingManager.address, epochsManager.address, LEND_MAX_EPOCHS],
    {
      initializer: 'initialize',
      kind: 'uups'
    }
  )

  console.info('RegistrationManager ...')
  const registrationManager = await upgrades.deployProxy(
    RegistrationManager,
    [PNT_ON_POLYGON_ADDRESS, stakingManager.address, epochsManager.address, borrowingManager.address],
    {
      initializer: 'initialize',
      kind: 'uups'
    }
  )

  console.info('FeesManager ...')
  const feesManager = await upgrades.deployProxy(
    FeesManager,
    [stakingManager.address, epochsManager.address, borrowingManager.address, registrationManager.address, MINIMUM_BORROWING_FEE],
    {
      initializer: 'initialize',
      kind: 'uups'
    }
  )

  console.log('Forwarder ...')
  const forwarder = await Forwarder.deploy(PNT_ON_POLYGON_ADDRESS, ZERO_ADDRESS)

  console.log('Setting ACL permissions ...')
  await acl.setPermissionManager(signer.address, TOKEN_MANAGER_ADDRESS, getRole('MINT_ROLE'))
  await acl.setPermissionManager(signer.address, TOKEN_MANAGER_ADDRESS, getRole('BURN_ROLE'))
  await acl.grantPermission(stakingManager.address, TOKEN_MANAGER_ADDRESS, getRole('MINT_ROLE'))
  await acl.grantPermission(stakingManager.address, TOKEN_MANAGER_ADDRESS, getRole('BURN_ROLE'))

  console.log('Assigning roles ...')
  await borrowingManager.grantRole(getRole('BORROW_ROLE'), registrationManager.address)
  await borrowingManager.grantRole(getRole('DEPOSIT_INTEREST_ROLE'), feesManager.address)
  await forwarder.grantRole(getRole('SET_ORIGINATING_ADDRESS_ROLE'), signer.address)

  console.log(
    JSON.stringify({
      stakingManager: stakingManager.address,
      borrowingManager: borrowingManager.address,
      epochsManager: epochsManager.address,
      registrationManager: registrationManager.address,
      feesManager: feesManager.address,
      forwarder: forwarder.address
    })
  )
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
