const { expect } = require('chai')
const { ethers, upgrades } = require('hardhat')
const { time } = require('@nomicfoundation/hardhat-network-helpers')

let epochsManager, EpochsManager

const EPOCH_DURATION = 86400 // 1 day

describe('EpochsManager', () => {
  beforeEach(async () => {
    EpochsManager = await ethers.getContractFactory('EpochsManager')

    const signers = await ethers.getSigners()

    epochsManager = await upgrades.deployProxy(EpochsManager, [EPOCH_DURATION], {
      initializer: 'initialize',
      kind: 'uups'
    })
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