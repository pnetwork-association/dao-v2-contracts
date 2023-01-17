const { ethers, upgrades } = require('hardhat')
const { getRole } = require('../../test/utils/index')

const EPOCH_DURATION = 60 * 60 * 24 * 15
const STAKING_MANAGER_ADDRESS = '0xeb10e80D99655B51E3a981E888a73D0B21e21A6C'
const PNT_ADDRESS = '0x89Ab32156e46F46D02ade3FEcbe5Fc4243B9AAeD'
const LEND_MAX_EPOCHS = 24

const main = async () => {
  const signer = await ethers.getSigner()
  const EpochsManager = await ethers.getContractFactory('EpochsManager')
  const BorrowingManager = await ethers.getContractFactory('BorrowingManagerV2')
  const RegistrationManager = await ethers.getContractFactory('RegistrationManager')
  // const FeesManager = await ethers.getContractFactory('FeesManager')
  const StandardToken = await ethers.getContractFactory('StandardToken')

  console.info('Deploying ...')

  const epochsManager = await upgrades.deployProxy(EpochsManager, [EPOCH_DURATION], {
    initializer: 'initialize',
    kind: 'uups'
  })

  const borrowingManager = await upgrades.deployProxy(
    BorrowingManager,
    [STAKING_MANAGER_ADDRESS, PNT_ADDRESS, epochsManager.address, LEND_MAX_EPOCHS],
    {
      initializer: 'initialize',
      kind: 'uups'
    }
  )

  const registrationManager = await upgrades.deployProxy(
    RegistrationManager,
    [STAKING_MANAGER_ADDRESS, PNT_ADDRESS, epochsManager.address, borrowingManager.address],
    {
      initializer: 'initialize',
      kind: 'uups'
    }
  )

  console.log('Assigning roles ...')
  await borrowingManager.grantRole(getRole('BORROW_ROLE'), registrationManager.address)
  await borrowingManager.grantRole(getRole('DEPOSIT_INTEREST'), signer.address)

  console.log('Creating test tokens ...')
  const testToken1 = await StandardToken.deploy('Test Token 1', 'TST1', '100000000000000000000000000')
  const testToken2 = await StandardToken.deploy('Test Token 2', 'TST2', '100000000000000000000000000')
  await testToken1.approve(borrowingManager.address, '0xffffffffffffffffffffffffffffffffffffffff')
  await testToken2.approve(borrowingManager.address, '0xffffffffffffffffffffffffffffffffffffffff')

  console.log('Depositing interests ...')
  for (let i = 0; i < 3; i++) {
    await borrowingManager.depositInterest(testToken1.address, 1, '2000000000000000000000', {
      gasLimit: 300000
    })
  }

  for (let i = 0; i < 3; i++) {
    await borrowingManager.depositInterest(testToken1.address, 2, '2000000000000000000000', {
      gasLimit: 300000
    })
    await borrowingManager.depositInterest(testToken2.address, 2, '3000000000000000000000', {
      gasLimit: 300000
    })
  }

  for (let i = 0; i < 3; i++) {
    await borrowingManager.depositInterest(testToken1.address, 3, '2000000000000000000000', {
      gasLimit: 300000
    })
    await borrowingManager.depositInterest(testToken2.address, 3, '3000000000000000000000', {
      gasLimit: 300000
    })
  }

  for (let i = 0; i < 3; i++) {
    await borrowingManager.depositInterest(testToken2.address, 4, '3000000000000000000000', {
      gasLimit: 300000
    })
  }

  console.log(
    JSON.stringify({
      borrowingManager: borrowingManager.address,
      epochsManager: epochsManager.address,
      registrationManager: registrationManager.address,
      testToken1: testToken1.address,
      testToken2: testToken2.address
    })
  )
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
