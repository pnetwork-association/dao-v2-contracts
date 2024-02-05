const { task } = require('hardhat/config')

const {
  DANDELION_VOTING_ADDRESS,
  EPOCH_DURATION,
  FORWARDER_ON_GNOSIS,
  LEND_MAX_EPOCHS,
  MINIMUM_BORROWING_FEE,
  PNT_MAX_TOTAL_SUPPLY,
  PNT_ON_GNOSIS_ADDRESS,
  TOKEN_MANAGER_ADDRESS,
  START_FIRST_EPOCH_TIMESTAMP,
  STAKING_MANAGER,
  STAKING_MANAGER_LM,
  STAKING_MANAGER_RM,
  EPOCHS_MANAGER,
  LENDING_MANAGER,
  REGISTRATION_MANAGER,
  FEES_MANAGER
} = require('./config')

const deploy = async (_args, _hre) => {
  const StakingManager = await _hre.ethers.getContractFactory('StakingManager')
  const StakingManagerPermissioned = await _hre.ethers.getContractFactory('StakingManagerPermissioned')
  const EpochsManager = await _hre.ethers.getContractFactory('EpochsManager')
  const LendingManager = await _hre.ethers.getContractFactory('LendingManager')
  const RegistrationManager = await _hre.ethers.getContractFactory('RegistrationManager')
  const FeesManager = await _hre.ethers.getContractFactory('FeesManager')

  console.info('StakingManager ...')
  let stakingManager
  if (STAKING_MANAGER) {
    // await _hre.upgrades.upgradeProxy(STAKING_MANAGER, StakingManager)
    stakingManager = StakingManager.attach(STAKING_MANAGER)
  } else {
    stakingManager = await _hre.upgrades.deployProxy(
      StakingManager,
      [PNT_ON_GNOSIS_ADDRESS, TOKEN_MANAGER_ADDRESS, FORWARDER_ON_GNOSIS, PNT_MAX_TOTAL_SUPPLY],
      {
        initializer: 'initialize',
        kind: 'uups'
      }
    )
  }
  console.info('StakingManager:', await stakingManager.getAddress())

  console.info('StakingManager LM ...')
  let stakingManagerLM
  if (STAKING_MANAGER_LM) {
    // await _hre.upgrades.upgradeProxy(STAKING_MANAGER_LM, StakingManagerPermissioned)
    stakingManagerLM = StakingManagerPermissioned.attach(STAKING_MANAGER_LM)
  } else {
    stakingManagerLM = await _hre.upgrades.deployProxy(
      StakingManagerPermissioned,
      [PNT_ON_GNOSIS_ADDRESS, TOKEN_MANAGER_ADDRESS, FORWARDER_ON_GNOSIS, PNT_MAX_TOTAL_SUPPLY],
      {
        initializer: 'initialize',
        kind: 'uups'
      }
    )
  }
  console.info('StakingManager LM:', await stakingManagerLM.getAddress())

  console.info('StakingManager RM ...')
  let stakingManagerRM
  if (STAKING_MANAGER_RM) {
    // await _hre.upgrades.upgradeProxy(STAKING_MANAGER_RM, StakingManagerPermissioned)
    stakingManagerRM = StakingManagerPermissioned.attach(STAKING_MANAGER_RM)
  } else {
    stakingManagerRM = await _hre.upgrades.deployProxy(
      StakingManagerPermissioned,
      [PNT_ON_GNOSIS_ADDRESS, TOKEN_MANAGER_ADDRESS, FORWARDER_ON_GNOSIS, PNT_MAX_TOTAL_SUPPLY],
      {
        initializer: 'initialize',
        kind: 'uups'
      }
    )
  }
  console.info('StakingManager RM:', await stakingManagerRM.getAddress())

  console.info('EpochsManager ...')
  let epochsManager
  if (EPOCHS_MANAGER) {
    // await _hre.upgrades.upgradeProxy(EpochsManager, EpochsManager)
    epochsManager = EpochsManager.attach(EPOCHS_MANAGER)
  } else {
    epochsManager = await _hre.upgrades.deployProxy(
      EpochsManager,
      [EPOCH_DURATION, START_FIRST_EPOCH_TIMESTAMP ? START_FIRST_EPOCH_TIMESTAMP : 0],
      {
        initializer: 'initialize',
        kind: 'uups'
      }
    )
  }
  console.info('EpochsManager:', await epochsManager.getAddress())

  console.info('LendingManager ...')
  let lendingManager
  if (LENDING_MANAGER) {
    // await _hre.upgrades.upgradeProxy(LENDING_MANAGER, LendingManager)
    lendingManager = LendingManager.attach(LENDING_MANAGER)
  } else {
    lendingManager = await _hre.upgrades.deployProxy(
      LendingManager,
      [
        PNT_ON_GNOSIS_ADDRESS,
        await stakingManagerLM.getAddress(),
        await epochsManager.getAddress(),
        FORWARDER_ON_GNOSIS,
        DANDELION_VOTING_ADDRESS,
        LEND_MAX_EPOCHS
      ],
      {
        initializer: 'initialize',
        kind: 'uups'
      }
    )
  }
  console.info('LendingManager:', await lendingManager.getAddress())

  console.info('RegistrationManager ...')
  let registrationManager
  if (REGISTRATION_MANAGER) {
    // await _hre.upgrades.upgradeProxy(REGISTRATION_MANAGER, RegistrationManager)
    registrationManager = RegistrationManager.attach(REGISTRATION_MANAGER)
  } else {
    registrationManager = await _hre.upgrades.deployProxy(
      RegistrationManager,
      [
        PNT_ON_GNOSIS_ADDRESS,
        await stakingManagerRM.getAddress(),
        await epochsManager.getAddress(),
        await lendingManager.getAddress(),
        FORWARDER_ON_GNOSIS
      ],
      {
        initializer: 'initialize',
        kind: 'uups'
      }
    )
  }
  console.info('RegistrationManager:', await registrationManager.getAddress())

  console.info('FeesManager ...')
  let feesManager
  if (FEES_MANAGER) {
    // await _hre.upgrades.upgradeProxy(FEES_MANAGER, FeesManager)
    feesManager = FeesManager.attach(FEES_MANAGER)
  } else {
    feesManager = await _hre.upgrades.deployProxy(
      FeesManager,
      [
        await epochsManager.getAddress(),
        await lendingManager.getAddress(),
        await registrationManager.getAddress(),
        FORWARDER_ON_GNOSIS,
        MINIMUM_BORROWING_FEE
      ],
      {
        initializer: 'initialize',
        kind: 'uups'
      }
    )
  }
  console.info('FeesManager:', await feesManager.getAddress())

  console.log(
    JSON.stringify({
      stakingManager: await stakingManager.getAddress(),
      stakingManagerLM: await stakingManagerLM.getAddress(),
      stakingManagerRM: await stakingManagerRM.getAddress(),
      epochsManager: await epochsManager.getAddress(),
      lendingManager: await lendingManager.getAddress(),
      registrationManager: await registrationManager.getAddress(),
      feesManager: await feesManager.getAddress()
    })
  )
}

task('deploy:dao', 'Deploy or update contracts', deploy)
