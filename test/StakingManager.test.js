const { expect } = require('chai')
const { ethers, upgrades } = require('hardhat')
const { time } = require('@nomicfoundation/hardhat-network-helpers')
const { getRole } = require('./utils/index')
const {
  ACL_ADDRESS,
  DAO_PNT_ADDRESS,
  DAO_ROOT_ADDRESS,
  MIN_LOCK_DURATION,
  ONE_DAY,
  PNETWORK_CHAIN_IDS,
  PNT_ADDRESS,
  PNT_HOLDER_1_ADDRESS,
  PNT_MAX_TOTAL_SUPPLY,
  TOKEN_MANAGER_ADDRESS
} = require('./constants')

let pntHolder1, root, stakingManager, StakingManager, fakeForwarder

describe('StakingManager', () => {
  beforeEach(async () => {
    StakingManager = await ethers.getContractFactory('StakingManager')
    const ACL = await ethers.getContractFactory('ACL')
    const ERC20 = await ethers.getContractFactory('ERC20')

    const signers = await ethers.getSigners()
    owner = signers[0]
    fakeForwarder = signers[1]
    pntHolder1 = await ethers.getImpersonatedSigner(PNT_HOLDER_1_ADDRESS)
    root = await ethers.getImpersonatedSigner(DAO_ROOT_ADDRESS)

    acl = await ACL.attach(ACL_ADDRESS)
    pnt = await ERC20.attach(PNT_ADDRESS)
    daoPnt = await ERC20.attach(DAO_PNT_ADDRESS)

    stakingManager = await upgrades.deployProxy(StakingManager, [PNT_ADDRESS, TOKEN_MANAGER_ADDRESS, fakeForwarder.address, PNT_MAX_TOTAL_SUPPLY], {
      initializer: 'initialize',
      kind: 'uups'
    })

    await owner.sendTransaction({
      to: root.address,
      value: ethers.utils.parseEther('10')
    })

    await stakingManager.grantRole(getRole('UPGRADE_ROLE'), owner.address)
    await stakingManager.grantRole(getRole('CHANGE_MAX_TOTAL_SUPPLY_ROLE'), owner.address)
    await acl.connect(root).grantPermission(stakingManager.address, TOKEN_MANAGER_ADDRESS, getRole('MINT_ROLE'))
    await acl.connect(root).grantPermission(stakingManager.address, TOKEN_MANAGER_ADDRESS, getRole('BURN_ROLE'))

    await owner.sendTransaction({
      to: pntHolder1.address,
      value: ethers.utils.parseEther('10')
    })
  })

  it('should be able to stake the first time', async () => {
    const stakeAmount = ethers.utils.parseEther('10000')
    const duration = MIN_LOCK_DURATION
    const daoPnBalancePre = await daoPnt.balanceOf(pntHolder1.address)
    const pnBalancePre = await pnt.balanceOf(pntHolder1.address)

    await pnt.connect(pntHolder1).approve(stakingManager.address, stakeAmount)
    await expect(stakingManager.connect(pntHolder1).stake(pntHolder1.address, stakeAmount, duration))
      .to.emit(stakingManager, 'Staked')
      .withArgs(pntHolder1.address, stakeAmount, duration)
    const expectedStartDate = await time.latest()
    const expectedEndDate = expectedStartDate + duration

    const daoPnBalancePost = await daoPnt.balanceOf(pntHolder1.address)
    const pnBalancePost = await pnt.balanceOf(pntHolder1.address)
    await expect(daoPnBalancePost).to.be.eq(daoPnBalancePre.add(stakeAmount))
    await expect(pnBalancePost).to.be.eq(pnBalancePre.sub(stakeAmount))

    const stake = await stakingManager.stakeOf(pntHolder1.address)
    await expect(stake.amount).to.be.eq(stakeAmount)
    await expect(stake.startDate).to.be.eq(expectedStartDate)
    await expect(stake.endDate).to.be.eq(expectedEndDate)
  })

  it('should be able to stake by keeping the old end date if the new one is lower than the first one', async () => {
    //
    //  lend1
    //               10k
    //  |---|vvvvvvvvvvvvvvvvvvvv|-----------|
    //      t1                   t4
    //
    //  lend2
    //               10k
    //  |-------|vvvvvvvvvv|-----------|
    //          t2         t3
    //
    //  result
    //               20k
    //  |---|vvvvvvvvvvvvvvvvvvvv|-----------|
    //      t1                   t4

    const stakeAmount = ethers.utils.parseEther('10000')
    const duration1 = MIN_LOCK_DURATION * 2
    const duration2 = MIN_LOCK_DURATION

    await pnt.connect(pntHolder1).approve(stakingManager.address, stakeAmount)
    await expect(stakingManager.connect(pntHolder1).stake(pntHolder1.address, stakeAmount, duration1))
      .to.emit(stakingManager, 'Staked')
      .withArgs(pntHolder1.address, stakeAmount, duration1)
    let expectedStartDate = await time.latest()
    const expectedEndDate = expectedStartDate + duration1

    let stake = await stakingManager.stakeOf(pntHolder1.address)
    await expect(stake.amount).to.be.eq(stakeAmount)
    await expect(stake.startDate).to.be.eq(expectedStartDate)
    await expect(stake.endDate).to.be.eq(expectedEndDate)

    await pnt.connect(pntHolder1).approve(stakingManager.address, stakeAmount)
    await expect(stakingManager.connect(pntHolder1).stake(pntHolder1.address, stakeAmount, duration2))
      .to.emit(stakingManager, 'Staked')
      .withArgs(pntHolder1.address, stakeAmount, duration2)
    expectedStartDate = await time.latest()

    stake = await stakingManager.stakeOf(pntHolder1.address)
    await expect(stake.amount).to.be.eq(stakeAmount.mul(2))
    await expect(stake.startDate).to.be.eq(expectedStartDate)
    await expect(stake.endDate).to.be.eq(expectedEndDate)
  })

  it('should be able to stake by keeping the new end date if the new one is greater than the first one', async () => {
    //  lend2
    //               10k
    //  |-------|vvvvvvvvvv|-----------|
    //          t1         t3
    //
    //  lend1
    //                      10k
    //  |----------|vvvvvvvvvvvvvvvvvvvv|-----------|
    //             t2                   t4
    //
    //
    //  result
    //                      20k
    //  |---------|vvvvvvvvvvvvvvvvvvvv|-----------|
    //            t2                   t4

    const stakeAmount = ethers.utils.parseEther('10000')
    const duration1 = MIN_LOCK_DURATION
    const duration2 = MIN_LOCK_DURATION * 2

    await pnt.connect(pntHolder1).approve(stakingManager.address, stakeAmount)
    await expect(stakingManager.connect(pntHolder1).stake(pntHolder1.address, stakeAmount, duration1))
      .to.emit(stakingManager, 'Staked')
      .withArgs(pntHolder1.address, stakeAmount, duration1)
    let expectedStartDate = await time.latest()
    let expectedEndDate = expectedStartDate + duration1

    let stake = await stakingManager.stakeOf(pntHolder1.address)
    await expect(stake.amount).to.be.eq(stakeAmount)
    await expect(stake.startDate).to.be.eq(expectedStartDate)
    await expect(stake.endDate).to.be.eq(expectedEndDate)

    await pnt.connect(pntHolder1).approve(stakingManager.address, stakeAmount)
    await expect(stakingManager.connect(pntHolder1).stake(pntHolder1.address, stakeAmount, duration2))
      .to.emit(stakingManager, 'Staked')
      .withArgs(pntHolder1.address, stakeAmount, duration2)
    expectedStartDate = await time.latest()
    expectedEndDate = expectedStartDate + duration2

    stake = await stakingManager.stakeOf(pntHolder1.address)
    await expect(stake.amount).to.be.eq(stakeAmount.mul(2))
    await expect(stake.startDate).to.be.eq(expectedStartDate)
    await expect(stake.endDate).to.be.eq(expectedEndDate)
  })

  it('should be able to unstake everything', async () => {
    const stakeAmount = ethers.utils.parseEther('10000')
    const duration = MIN_LOCK_DURATION * 4

    await pnt.connect(pntHolder1).approve(stakingManager.address, stakeAmount)
    await expect(stakingManager.connect(pntHolder1).stake(pntHolder1.address, stakeAmount, duration))
      .to.emit(stakingManager, 'Staked')
      .withArgs(pntHolder1.address, stakeAmount, duration)

    await time.increase(duration + 1)

    const daoPnBalancePre = await daoPnt.balanceOf(pntHolder1.address)
    const pnBalancePre = await pnt.balanceOf(pntHolder1.address)

    await expect(stakingManager.connect(pntHolder1)['unstake(uint256,bytes4)'](stakeAmount, PNETWORK_CHAIN_IDS.polygonMainnet))
      .to.emit(stakingManager, 'Unstaked')
      .withArgs(pntHolder1.address, stakeAmount)

    const stake = await stakingManager.stakeOf(pntHolder1.address)
    await expect(stake.amount).to.be.eq(0)
    await expect(stake.startDate).to.be.eq(0)
    await expect(stake.endDate).to.be.eq(0)

    const daoPnBalancePost = await daoPnt.balanceOf(pntHolder1.address)
    const pnBalancePost = await pnt.balanceOf(pntHolder1.address)
    await expect(daoPnBalancePost).to.be.eq(daoPnBalancePre.sub(stakeAmount))
    await expect(pnBalancePost).to.be.eq(pnBalancePre.add(stakeAmount))
  })

  it('should be able to unstake partially', async () => {
    const stakeAmount = ethers.utils.parseEther('10000')
    const unstakeAmount = ethers.utils.parseEther('5000')
    const duration = MIN_LOCK_DURATION * 4

    await pnt.connect(pntHolder1).approve(stakingManager.address, stakeAmount)
    await expect(stakingManager.connect(pntHolder1).stake(pntHolder1.address, stakeAmount, duration))
      .to.emit(stakingManager, 'Staked')
      .withArgs(pntHolder1.address, stakeAmount, duration)
    const expectedStartDate = await time.latest()
    const expectedEndDate = expectedStartDate + duration

    await time.increase(duration + 1)

    const daoPnBalancePre = await daoPnt.balanceOf(pntHolder1.address)
    const pnBalancePre = await pnt.balanceOf(pntHolder1.address)

    await expect(stakingManager.connect(pntHolder1)['unstake(uint256,bytes4)'](unstakeAmount, PNETWORK_CHAIN_IDS.polygonMainnet))
      .to.emit(stakingManager, 'Unstaked')
      .withArgs(pntHolder1.address, unstakeAmount)

    const stake = await stakingManager.stakeOf(pntHolder1.address)
    await expect(stake.amount).to.be.eq(stakeAmount.sub(unstakeAmount))
    await expect(stake.startDate).to.be.eq(expectedStartDate)
    await expect(stake.endDate).to.be.eq(expectedEndDate)

    const daoPnBalancePost = await daoPnt.balanceOf(pntHolder1.address)
    const pnBalancePost = await pnt.balanceOf(pntHolder1.address)
    await expect(daoPnBalancePost).to.be.eq(daoPnBalancePre.sub(unstakeAmount))
    await expect(pnBalancePost).to.be.eq(pnBalancePre.add(unstakeAmount))
  })

  it('should not be able to unstake if the staking period is not finished yet', async () => {
    const stakeAmount = ethers.utils.parseEther('10000')
    const duration = MIN_LOCK_DURATION * 4

    await pnt.connect(pntHolder1).approve(stakingManager.address, stakeAmount)
    await expect(stakingManager.connect(pntHolder1).stake(pntHolder1.address, stakeAmount, duration))
      .to.emit(stakingManager, 'Staked')
      .withArgs(pntHolder1.address, stakeAmount, duration)

    await expect(
      stakingManager.connect(pntHolder1)['unstake(uint256,bytes4)'](stakeAmount, PNETWORK_CHAIN_IDS.polygonMainnet)
    ).to.be.revertedWithCustomError(stakingManager, 'UnfinishedStakingPeriod')
  })

  it('should not be able to unstake more than what you staked', async () => {
    const stakeAmount = ethers.utils.parseEther('10000')
    const duration = MIN_LOCK_DURATION * 4

    await pnt.connect(pntHolder1).approve(stakingManager.address, stakeAmount)
    await expect(stakingManager.connect(pntHolder1).stake(pntHolder1.address, stakeAmount, duration))
      .to.emit(stakingManager, 'Staked')
      .withArgs(pntHolder1.address, stakeAmount, duration)

    await time.increase(duration + 1)

    await expect(
      stakingManager.connect(pntHolder1)['unstake(uint256,bytes4)'](stakeAmount.add(1), PNETWORK_CHAIN_IDS.polygonMainnet)
    ).to.be.revertedWithCustomError(stakingManager, 'InvalidAmount')
  })

  it('should be able to increase the duration if the staking period is not finished yet', async () => {
    const stakeAmount = ethers.utils.parseEther('10000')
    const duration1 = MIN_LOCK_DURATION * 2
    const duration2 = MIN_LOCK_DURATION * 5

    await pnt.connect(pntHolder1).approve(stakingManager.address, stakeAmount)
    await expect(stakingManager.connect(pntHolder1).stake(pntHolder1.address, stakeAmount, duration1))
      .to.emit(stakingManager, 'Staked')
      .withArgs(pntHolder1.address, stakeAmount, duration1)
    const expectedStartDate = await time.latest()
    const firstEndDate = expectedStartDate + duration1

    await expect(stakingManager.connect(pntHolder1).increaseDuration(duration2))
      .to.emit(stakingManager, 'DurationIncreased')
      .withArgs(pntHolder1.address, duration2)
    const increasedEndDate = firstEndDate + duration2

    const stake = await stakingManager.stakeOf(pntHolder1.address)
    await expect(stake.startDate).to.be.eq(expectedStartDate)
    await expect(stake.endDate).to.be.eq(increasedEndDate)
  })

  it('should be able to increase the duration if the staking period is finished', async () => {
    const stakeAmount = ethers.utils.parseEther('10000')
    const duration1 = MIN_LOCK_DURATION * 2
    const duration2 = MIN_LOCK_DURATION * 5

    await pnt.connect(pntHolder1).approve(stakingManager.address, stakeAmount)
    await expect(stakingManager.connect(pntHolder1).stake(pntHolder1.address, stakeAmount, duration1))
      .to.emit(stakingManager, 'Staked')
      .withArgs(pntHolder1.address, stakeAmount, duration1)

    await time.increase(duration1 + 1)

    await expect(stakingManager.connect(pntHolder1).increaseDuration(duration2))
      .to.emit(stakingManager, 'DurationIncreased')
      .withArgs(pntHolder1.address, duration2)
    const expectedStartDate = await time.latest()
    const increasedEndDate = expectedStartDate + duration2

    const stake = await stakingManager.stakeOf(pntHolder1.address)
    await expect(stake.startDate).to.be.eq(expectedStartDate)
    await expect(stake.endDate).to.be.eq(increasedEndDate)
  })

  it('should not be able to increase duration if there is anything at stake', async () => {
    const duration = MIN_LOCK_DURATION * 5
    await expect(stakingManager.connect(pntHolder1).increaseDuration(duration)).to.be.revertedWithCustomError(stakingManager, 'NothingAtStake')
  })

  it('should be able to unstake after a contract upgrade', async () => {
    const stakeAmount = ethers.utils.parseEther('10000')
    const duration = MIN_LOCK_DURATION * 4

    await pnt.connect(pntHolder1).approve(stakingManager.address, stakeAmount)
    await expect(stakingManager.connect(pntHolder1).stake(pntHolder1.address, stakeAmount, duration))
      .to.emit(stakingManager, 'Staked')
      .withArgs(pntHolder1.address, stakeAmount, duration)

    await time.increase(duration + 1)

    const daoPnBalancePre = await daoPnt.balanceOf(pntHolder1.address)
    const pnBalancePre = await pnt.balanceOf(pntHolder1.address)

    await upgrades.upgradeProxy(stakingManager.address, StakingManager, {
      kind: 'uups'
    })

    await expect(stakingManager.connect(pntHolder1)['unstake(uint256,bytes4)'](stakeAmount, PNETWORK_CHAIN_IDS.polygonMainnet))
      .to.emit(stakingManager, 'Unstaked')
      .withArgs(pntHolder1.address, stakeAmount)

    const stake = await stakingManager.stakeOf(pntHolder1.address)
    await expect(stake.amount).to.be.eq(0)
    await expect(stake.startDate).to.be.eq(0)
    await expect(stake.endDate).to.be.eq(0)

    const daoPnBalancePost = await daoPnt.balanceOf(pntHolder1.address)
    const pnBalancePost = await pnt.balanceOf(pntHolder1.address)
    await expect(daoPnBalancePost).to.be.eq(daoPnBalancePre.sub(stakeAmount))
    await expect(pnBalancePost).to.be.eq(pnBalancePre.add(stakeAmount))
  })

  it('should not be able to update the maximun supply without the corresponding role', async () => {
    const expectedError = `AccessControl: account ${pntHolder1.address.toLowerCase()} is missing role ${getRole('CHANGE_MAX_TOTAL_SUPPLY_ROLE')}`
    await expect(stakingManager.connect(pntHolder1).changeMaxTotalSupply('1')).to.be.revertedWith(expectedError)
  })

  it('should be able to change the max total supply', async () => {
    await stakingManager.grantRole(getRole('CHANGE_MAX_TOTAL_SUPPLY_ROLE'), owner.address)
    await expect(stakingManager.changeMaxTotalSupply('1')).to.emit(stakingManager, 'MaxTotalSupplyChanged').withArgs(1)
  })

  it('should not be able to mint more than the max total supply', async () => {
    const duration = ONE_DAY * 10
    const newMaxTotalSupply = ethers.utils.parseEther('1000')
    await stakingManager.grantRole(getRole('CHANGE_MAX_TOTAL_SUPPLY_ROLE'), owner.address)
    await stakingManager.changeMaxTotalSupply(newMaxTotalSupply)
    await pnt.connect(pntHolder1).approve(stakingManager.address, newMaxTotalSupply.add(1))
    await expect(stakingManager.connect(pntHolder1).stake(pntHolder1.address, newMaxTotalSupply.add(1), duration)).to.be.revertedWithCustomError(
      stakingManager,
      'MaxTotalSupplyExceeded'
    )
  })
})
