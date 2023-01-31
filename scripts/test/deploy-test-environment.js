const { ethers, upgrades } = require('hardhat')
const { getRole } = require('../../test/utils/index')

const ACL_ADDRESS = '0xFDcae423E5e92B76FE7D1e2bcabd36fca8a6a8Fe'
const EPOCH_DURATION = 60 * 60 * 24 * 15
const STAKING_MANAGER_ADDRESS = '0xeb10e80D99655B51E3a981E888a73D0B21e21A6C'
const PNT_ADDRESS = '0x89Ab32156e46F46D02ade3FEcbe5Fc4243B9AAeD'
const TOKEN_MANAGER_ADDRESS = '0xD7E8E79d318eCE001B39D83Ea891ebD5fC22d254'
const DAO_ROOT_ADDRESS = '0x6Ae14ff8d24F719a8cf5A9FAa2Ad05dA7e44C8b6'
const PNT_HOLDER_1_ADDRESS = '0xaeaa8c6ebb17db8056fa30a08fd3097de555f571'
const LEND_MAX_EPOCHS = 24
const MINIMUM_BORROWING_FEE = 0.3 * 10 ** 6 // 30%

const main = async () => {
  const signer = await ethers.getSigner()
  const daoRoot = await ethers.getImpersonatedSigner(DAO_ROOT_ADDRESS)
  const pntHolder1 = await ethers.getImpersonatedSigner(PNT_HOLDER_1_ADDRESS)

  const ACL = await ethers.getContractFactory('ACL')
  const ERC20 = await ethers.getContractFactory('ERC20')
  const StakingManager = await ethers.getContractFactory('StakingManager')
  const EpochsManager = await ethers.getContractFactory('EpochsManager')
  const BorrowingManager = await ethers.getContractFactory('BorrowingManager')
  const RegistrationManager = await ethers.getContractFactory('RegistrationManager')
  const FeesManager = await ethers.getContractFactory('FeesManager')

  console.info('Deploying ...')

  const acl = await ACL.attach(ACL_ADDRESS)
  const pnt = await ERC20.attach(PNT_ADDRESS)

  const stakingManager = await upgrades.deployProxy(StakingManager, [PNT_ADDRESS, TOKEN_MANAGER_ADDRESS], {
    initializer: 'initialize',
    kind: 'uups'
  })

  const epochsManager = await upgrades.deployProxy(EpochsManager, [EPOCH_DURATION], {
    initializer: 'initialize',
    kind: 'uups'
  })

  const borrowingManager = await upgrades.deployProxy(
    BorrowingManager,
    [PNT_ADDRESS, STAKING_MANAGER_ADDRESS, epochsManager.address, LEND_MAX_EPOCHS],
    {
      initializer: 'initialize',
      kind: 'uups'
    }
  )

  const registrationManager = await upgrades.deployProxy(
    RegistrationManager,
    [PNT_ADDRESS, STAKING_MANAGER_ADDRESS, epochsManager.address, borrowingManager.address],
    {
      initializer: 'initialize',
      kind: 'uups'
    }
  )

  const feesManager = await upgrades.deployProxy(
    FeesManager,
    [STAKING_MANAGER_ADDRESS, epochsManager.address, borrowingManager.address, registrationManager.address, MINIMUM_BORROWING_FEE],
    {
      initializer: 'initialize',
      kind: 'uups'
    }
  )

  console.log('Setting ACL permissions ...')
  await acl.connect(daoRoot).grantPermission(stakingManager.address, TOKEN_MANAGER_ADDRESS, getRole('MINT_ROLE'))
  await acl.connect(daoRoot).grantPermission(stakingManager.address, TOKEN_MANAGER_ADDRESS, getRole('BURN_ROLE'))

  console.log('Assigning roles ...')
  await borrowingManager.grantRole(getRole('BORROW_ROLE'), registrationManager.address)
  await borrowingManager.grantRole(getRole('DEPOSIT_INTEREST_ROLE'), signer.address)

  console.log('Transferring PNT to test address ...')
  await pnt.connect(pntHolder1).transfer(signer.address, ethers.utils.parseEther('500000'))

  console.log(
    JSON.stringify({
      stakingManager: stakingManager.address,
      borrowingManager: borrowingManager.address,
      epochsManager: epochsManager.address,
      registrationManager: registrationManager.address,
      feesManager: feesManager.address,
      signer: signer.address
    })
  )
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
