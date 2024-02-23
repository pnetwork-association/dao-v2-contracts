const { task } = require('hardhat/config')

const {
  ADDRESSES: {
    GNOSIS: {
      DANDELION_VOTING_ADDRESS,
      PNT_ON_GNOSIS_ADDRESS,
      FORWARDER_ON_GNOSIS,
      TOKEN_MANAGER_ADDRESS,
      STAKING_MANAGER,
      STAKING_MANAGER_LM,
      STAKING_MANAGER_RM,
      EPOCHS_MANAGER,
      LENDING_MANAGER,
      REGISTRATION_MANAGER,
      FEES_MANAGER,
      REWARDS_MANAGER
    }
  },
  EPOCH_DURATION,
  LEND_MAX_EPOCHS,
  MINIMUM_BORROWING_FEE,
  PNT_MAX_TOTAL_SUPPLY,
  START_FIRST_EPOCH_TIMESTAMP
} = require('../lib/constants')

const deploy = async (_args, _hre) => {
  const StakingManager = await _hre.ethers.getContractFactory('StakingManager')
  const StakingManagerPermissioned = await _hre.ethers.getContractFactory('StakingManagerPermissioned')
  const EpochsManager = await _hre.ethers.getContractFactory('EpochsManager')
  const LendingManager = await _hre.ethers.getContractFactory('LendingManager')
  const RegistrationManager = await _hre.ethers.getContractFactory('RegistrationManager')
  const FeesManager = await _hre.ethers.getContractFactory('FeesManager')
  const RewardsManager = await _hre.ethers.getContractFactory('RewardsManager')

  console.info('StakingManager ...')
  let stakingManager
  if (STAKING_MANAGER) {
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
  console.info('StakingManager:', stakingManager.target)

  console.info('StakingManager LM ...')
  let stakingManagerLM
  if (STAKING_MANAGER_LM) {
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
  console.info('StakingManager LM:', stakingManagerLM.target)

  console.info('StakingManager RM ...')
  let stakingManagerRM
  if (STAKING_MANAGER_RM) {
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
  console.info('StakingManager RM:', stakingManagerRM.target)

  console.info('EpochsManager ...')
  let epochsManager
  if (EPOCHS_MANAGER) {
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
  console.info('EpochsManager:', epochsManager.target)

  console.info('LendingManager ...')
  let lendingManager
  if (LENDING_MANAGER) {
    lendingManager = LendingManager.attach(LENDING_MANAGER)
  } else {
    lendingManager = await _hre.upgrades.deployProxy(
      LendingManager,
      [
        PNT_ON_GNOSIS_ADDRESS,
        stakingManagerLM.target,
        epochsManager.target,
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
  console.info('LendingManager:', lendingManager.target)

  console.info('RegistrationManager ...')
  let registrationManager
  if (REGISTRATION_MANAGER) {
    registrationManager = RegistrationManager.attach(REGISTRATION_MANAGER)
  } else {
    registrationManager = await _hre.upgrades.deployProxy(
      RegistrationManager,
      [
        PNT_ON_GNOSIS_ADDRESS,
        stakingManagerRM.target,
        epochsManager.target,
        lendingManager.target,
        FORWARDER_ON_GNOSIS
      ],
      {
        initializer: 'initialize',
        kind: 'uups'
      }
    )
  }
  console.info('RegistrationManager:', registrationManager.target)

  console.info('FeesManager ...')
  let feesManager
  if (FEES_MANAGER) {
    feesManager = FeesManager.attach(FEES_MANAGER)
  } else {
    feesManager = await _hre.upgrades.deployProxy(
      FeesManager,
      [
        epochsManager.target,
        lendingManager.target,
        registrationManager.target,
        FORWARDER_ON_GNOSIS,
        MINIMUM_BORROWING_FEE
      ],
      {
        initializer: 'initialize',
        kind: 'uups'
      }
    )
  }
  console.info('FeesManager:', feesManager.target)

  console.info('RewardsManager ...')
  let rewardsManager
  if (REWARDS_MANAGER) {
    rewardsManager = RewardsManager.attach(REWARDS_MANAGER)
  } else {
    rewardsManager = await _hre.upgrades.deployProxy(
      RewardsManager,
      [
        epochsManager.target,
        DANDELION_VOTING_ADDRESS,
        PNT_ON_GNOSIS_ADDRESS,
        TOKEN_MANAGER_ADDRESS,
        PNT_MAX_TOTAL_SUPPLY
      ],
      {
        initializer: 'initialize',
        kind: 'uups'
      }
    )
  }
  console.info('RewardsManager:', rewardsManager.target)

  console.log(
    JSON.stringify({
      stakingManager: stakingManager.target,
      stakingManagerLM: stakingManagerLM.target,
      stakingManagerRM: stakingManagerRM.target,
      epochsManager: epochsManager.target,
      lendingManager: lendingManager.target,
      registrationManager: registrationManager.target,
      feesManager: feesManager.target,
      rewardsManager: rewardsManager.target
    })
  )
}

task('deploy:dao', 'Deploy or update contracts', deploy)
