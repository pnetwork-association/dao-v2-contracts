const { ethers, upgrades } = require('hardhat')
const { getRole } = require('../../test/utils/index')
const { time } = require('@nomicfoundation/hardhat-network-helpers')

const ACL_ADDRESS = '0xFDcae423E5e92B76FE7D1e2bcabd36fca8a6a8Fe'
const EPOCH_DURATION = 60 * 60 * 24 * 15
const PNT_ADDRESS = '0x89Ab32156e46F46D02ade3FEcbe5Fc4243B9AAeD'
const PBTC_ADDRESS = '0x62199B909FB8B8cf870f97BEf2cE6783493c4908'
const TOKEN_MANAGER_ADDRESS = '0xD7E8E79d318eCE001B39D83Ea891ebD5fC22d254'
const DAO_ROOT_ADDRESS = '0x6Ae14ff8d24F719a8cf5A9FAa2Ad05dA7e44C8b6'
const PNT_HOLDER_1_ADDRESS = '0xaeaa8c6ebb17db8056fa30a08fd3097de555f571'
const PBTC_HOLDER_1_ADDRESS = '0x0a3b24e917192fb3238d118bfa331cfad5a07368'
const LEND_MAX_EPOCHS = 24
const MINIMUM_BORROWING_FEE = 0.3 * 10 ** 6 // 30%
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const PNT_MAX_TOTAL_SUPPLY = '96775228000000000000000000'

const main = async () => {
  const signer = await ethers.getSigner()
  const daoRoot = await ethers.getImpersonatedSigner(DAO_ROOT_ADDRESS)
  const pntHolder1 = await ethers.getImpersonatedSigner(PNT_HOLDER_1_ADDRESS)
  const pbtcHolder1 = await ethers.getImpersonatedSigner(PBTC_HOLDER_1_ADDRESS)

  await signer.sendTransaction({
    to: pntHolder1.address,
    value: ethers.utils.parseEther('1')
  })
  await signer.sendTransaction({
    to: pbtcHolder1.address,
    value: ethers.utils.parseEther('1')
  })

  const ACL = await ethers.getContractFactory('ACL')
  const ERC20 = await ethers.getContractFactory('ERC20')
  const StakingManager = await ethers.getContractFactory('StakingManager')
  const StakingManagerPermissioned = await ethers.getContractFactory('StakingManagerPermissioned')
  const EpochsManager = await ethers.getContractFactory('EpochsManager')
  const LendingManager = await ethers.getContractFactory('LendingManager')
  const RegistrationManager = await ethers.getContractFactory('RegistrationManager')
  const FeesManager = await ethers.getContractFactory('FeesManager')
  const Forwarder = await ethers.getContractFactory('Forwarder')

  const acl = await ACL.attach(ACL_ADDRESS)
  const pnt = await ERC20.attach(PNT_ADDRESS)
  const pbtc = await ERC20.attach(PBTC_ADDRESS)

  console.log('Funding signer ...')
  await pnt.connect(pntHolder1).transfer(signer.address, await pnt.balanceOf(pntHolder1.address))
  await pbtc.connect(pbtcHolder1).transfer(signer.address, await pbtc.balanceOf(pbtcHolder1.address))

  console.info('Deploying ...')

  const forwarder = await Forwarder.deploy(PNT_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS)

  const stakingManager = await upgrades.deployProxy(StakingManager, [PNT_ADDRESS, TOKEN_MANAGER_ADDRESS, forwarder.address, PNT_MAX_TOTAL_SUPPLY], {
    initializer: 'initialize',
    kind: 'uups'
  })

  const stakingManagerLM = await upgrades.deployProxy(
    StakingManagerPermissioned,
    [PNT_ADDRESS, TOKEN_MANAGER_ADDRESS, forwarder.address, PNT_MAX_TOTAL_SUPPLY],
    {
      initializer: 'initialize',
      kind: 'uups'
    }
  )

  const stakingManagerRM = await upgrades.deployProxy(
    StakingManagerPermissioned,
    [PNT_ADDRESS, TOKEN_MANAGER_ADDRESS, forwarder.address, PNT_MAX_TOTAL_SUPPLY],
    {
      initializer: 'initialize',
      kind: 'uups'
    }
  )

  const epochsManager = await upgrades.deployProxy(EpochsManager, [EPOCH_DURATION], {
    initializer: 'initialize',
    kind: 'uups'
  })

  const lendingManager = await upgrades.deployProxy(
    LendingManager,
    [PNT_ADDRESS, stakingManagerLM.address, epochsManager.address, forwarder.address, LEND_MAX_EPOCHS],
    {
      initializer: 'initialize',
      kind: 'uups'
    }
  )

  const registrationManager = await upgrades.deployProxy(
    RegistrationManager,
    [PNT_ADDRESS, stakingManagerRM.address, epochsManager.address, lendingManager.address, forwarder.address],
    {
      initializer: 'initialize',
      kind: 'uups'
    }
  )

  const feesManager = await upgrades.deployProxy(
    FeesManager,
    [epochsManager.address, lendingManager.address, registrationManager.address, forwarder.address, MINIMUM_BORROWING_FEE],
    {
      initializer: 'initialize',
      kind: 'uups'
    }
  )

  console.log('Setting ACL permissions ...')
  await acl.connect(daoRoot).grantPermission(stakingManager.address, TOKEN_MANAGER_ADDRESS, getRole('MINT_ROLE'))
  await acl.connect(daoRoot).grantPermission(stakingManager.address, TOKEN_MANAGER_ADDRESS, getRole('BURN_ROLE'))
  await acl.connect(daoRoot).grantPermission(stakingManagerRM.address, TOKEN_MANAGER_ADDRESS, getRole('MINT_ROLE'))
  await acl.connect(daoRoot).grantPermission(stakingManagerRM.address, TOKEN_MANAGER_ADDRESS, getRole('BURN_ROLE'))
  await acl.connect(daoRoot).grantPermission(stakingManagerLM.address, TOKEN_MANAGER_ADDRESS, getRole('MINT_ROLE'))
  await acl.connect(daoRoot).grantPermission(stakingManagerLM.address, TOKEN_MANAGER_ADDRESS, getRole('BURN_ROLE'))

  console.log('Assigning roles ...')
  await lendingManager.grantRole(getRole('BORROW_ROLE'), registrationManager.address)
  await stakingManagerLM.grantRole(getRole('STAKE_ROLE'), lendingManager.address)
  await stakingManagerLM.grantRole(getRole('INCREASE_DURATION_ROLE'), lendingManager.address)
  await stakingManagerRM.grantRole(getRole('STAKE_ROLE'), registrationManager.address)
  await stakingManagerRM.grantRole(getRole('INCREASE_DURATION_ROLE'), registrationManager.address)

  console.log('Lending ...')
  await pnt.approve(lendingManager.address, '0xffffffffffffffffffffffffffffffffffffffff')
  await lendingManager.lend(signer.address, ethers.utils.parseEther('400000'), EPOCH_DURATION * 10)

  console.log('Creating sentinel ...')
  await pnt.approve(registrationManager.address, '0xffffffffffffffffffffffffffffffffffffffff')
  await registrationManager.updateSentinelRegistrationByStaking(signer.address, ethers.utils.parseEther('200000'), EPOCH_DURATION * 12, '0x')

  console.log('Depositing rewards and fees ...')
  await pnt.approve(feesManager.address, '0xffffffffffffffffffffffffffffffffffffffff')
  await pbtc.approve(feesManager.address, '0xffffffffffffffffffffffffffffffffffffffff')

  // epoch 1
  await time.increase(EPOCH_DURATION)

  for (let i = 0; i < 3; i++) {
    await feesManager.depositFeeForCurrentEpoch(pnt.address, '2000000000000000000000')
  }

  // epoch 2
  await time.increase(EPOCH_DURATION)
  for (let i = 0; i < 3; i++) {
    await feesManager.depositFeeForCurrentEpoch(pnt.address, '2000000000000000000000')
    await feesManager.depositFeeForCurrentEpoch(pbtc.address, '200000000000000000')
  }

  // epoch 3
  await time.increase(EPOCH_DURATION)
  for (let i = 0; i < 3; i++) {
    await feesManager.depositFeeForCurrentEpoch(pnt.address, '1500000000000000000000')
    await feesManager.depositFeeForCurrentEpoch(pbtc.address, '300000000000000000')
  }

  // epoch 4
  await time.increase(EPOCH_DURATION)
  for (let i = 0; i < 3; i++) {
    await feesManager.depositFeeForCurrentEpoch(pbtc.address, '500000000000000000')
  }

  // epoch 5
  await time.increase(EPOCH_DURATION)
  // await registrationManager.updateSentinelRegistrationByBorrowing(4, '0x')

  console.log(
    JSON.stringify({
      acl: ACL_ADDRESS,
      stakingManager: stakingManager.address,
      stakingManagerLM: stakingManagerLM.address,
      stakingManagerRM: stakingManagerRM.address,
      lendingManager: lendingManager.address,
      epochsManager: epochsManager.address,
      registrationManager: registrationManager.address,
      feesManager: feesManager.address,
      forwarderOnPolygon: forwarder.address
    })
  )
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
