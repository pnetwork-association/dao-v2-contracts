/*const { expect } = require('chai')
const { ethers, upgrades } = require('hardhat')
const { time } = require('@nomicfoundation/hardhat-network-helpers')
const { getRole } = require('./utils')

let admin, user1, epochsManager, EpochsManager
let SET_EPOCH_DURATION_ROLE

const EPOCH_DURATION = 86400 // 1 day

describe('EpochsManager', () => {
  beforeEach(async () => {
    EpochsManager = await ethers.getContractFactory('EpochsManager')

    const signers = await ethers.getSigners()
    admin = signers[0]
    user1 = signers[1]

    SET_EPOCH_DURATION_ROLE = getRole('SET_EPOCH_DURATION_ROLE')

    epochsManager = await upgrades.deployProxy(EpochsManager, [EPOCH_DURATION], {
      initializer: 'initialize',
      kind: 'uups',
    })
  })

  it('should not be able to setEpochDuration', async () => {
    const expectedError = `AccessControl: account ${user1.address.toLowerCase()} is missing role ${SET_EPOCH_DURATION_ROLE}`
    await expect(epochsManager.connect(user1).setEpochDuration(EPOCH_DURATION)).to.be.revertedWith(expectedError)
  })

  it('admin should be able to setEpochDuration', async () => {
    const newEpochDuration = EPOCH_DURATION + 1
    await epochsManager.grantRole(SET_EPOCH_DURATION_ROLE, admin.address)
    await expect(epochsManager.setEpochDuration(newEpochDuration))
      .to.emit(epochsManager, 'EpochDurationUpdated')
      .withArgs(newEpochDuration)
    expect(await epochsManager.epochDuration()).to.be.eq(newEpochDuration)
  })

  it('user should be able to setEpochDuration when adming assign to him the relative role', async () => {
    const newEpochDuration = EPOCH_DURATION + 1
    await epochsManager.grantRole(SET_EPOCH_DURATION_ROLE, user1.address)
    await expect(epochsManager.connect(user1).setEpochDuration(newEpochDuration))
      .to.emit(epochsManager, 'EpochDurationUpdated')
      .withArgs(newEpochDuration)
    expect(await epochsManager.epochDuration()).to.be.eq(newEpochDuration)
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
})*/
