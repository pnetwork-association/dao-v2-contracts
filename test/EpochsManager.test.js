const { expect } = require('chai')
const { ethers, upgrades } = require('hardhat')
const { time } = require('@nomicfoundation/hardhat-network-helpers')
const { getRole } = require('./utils')

const EPOCH_DURATION = 86400 // 1 day

describe('EpochsManager', () => {
  let epochsManager,
    EpochsManager

  beforeEach(async () => {
    EpochsManager = await ethers.getContractFactory('EpochsManager')
    const signer = await ethers.getSigner()
    epochsManager = await upgrades.deployProxy(EpochsManager, [EPOCH_DURATION, 0], {
      initializer: 'initialize',
      kind: 'uups'
    })
    await epochsManager.grantRole(getRole('UPGRADE_ROLE'), signer.address)
  })

  it('admin should be able to handle correctly a contract upgrade', async () => {
    const latestBlockTimestamp = await time.latest()
    await time.increaseTo(latestBlockTimestamp + EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.eq(1)
    await upgrades.upgradeProxy(epochsManager.address, EpochsManager)
    expect(await epochsManager.currentEpoch()).to.be.eq(1)
  })

  it('should increase the epoch correctly', async () => {
    expect(await epochsManager.currentEpoch()).to.be.eq(0)
    await time.increase(EPOCH_DURATION)
    expect(await epochsManager.currentEpoch()).to.be.eq(1)
  })
})
