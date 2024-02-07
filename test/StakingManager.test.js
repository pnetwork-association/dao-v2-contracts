const { time } = require('@nomicfoundation/hardhat-network-helpers')
const { expect } = require('chai')
const { ethers, upgrades } = require('hardhat')

const {
  ACL_ADDRESS,
  DAO_PNT_ADDRESS,
  DAO_ROOT_ADDRESS,
  MIN_LOCK_DURATION,
  ONE_DAY,
  PNETWORK_NETWORK_IDS,
  PNT_HOLDER_1_ADDRESS,
  PNT_MAX_TOTAL_SUPPLY,
  TOKEN_MANAGER_ADDRESS,
  ZERO_ADDRESS
} = require('./constants')
const { CHANGE_MAX_TOTAL_SUPPLY_ROLE, UPGRADE_ROLE, SLASH_ROLE, MINT_ROLE, BURN_ROLE } = require('./roles')

describe('StakingManager', () => {
  let pntHolder1, root, owner, stakingManager, StakingManager, fakeForwarder, challenger, acl, pnt, daoPnt

  beforeEach(async () => {
    StakingManager = await ethers.getContractFactory('StakingManager')
    const ACL = await ethers.getContractFactory('ACL')
    const ERC20 = await ethers.getContractFactory('ERC20')
    const TestToken = await ethers.getContractFactory('TestToken')

    const signers = await ethers.getSigners()
    owner = signers[0]
    fakeForwarder = signers[1]
    challenger = signers[2]
    pntHolder1 = await ethers.getImpersonatedSigner(PNT_HOLDER_1_ADDRESS)
    root = await ethers.getImpersonatedSigner(DAO_ROOT_ADDRESS)

    acl = ACL.attach(ACL_ADDRESS)
    pnt = await TestToken.deploy('PNT', 'PNT')
    daoPnt = ERC20.attach(DAO_PNT_ADDRESS)

    await pnt.connect(owner).transfer(pntHolder1.address, ethers.parseEther('400000'))

    stakingManager = await upgrades.deployProxy(
      StakingManager,
      [await pnt.getAddress(), TOKEN_MANAGER_ADDRESS, fakeForwarder.address, PNT_MAX_TOTAL_SUPPLY],
      {
        initializer: 'initialize',
        kind: 'uups'
      }
    )

    await owner.sendTransaction({
      to: root.address,
      value: ethers.parseEther('10')
    })

    await stakingManager.grantRole(UPGRADE_ROLE, owner.address)
    await stakingManager.grantRole(SLASH_ROLE, owner.address)
    await stakingManager.grantRole(CHANGE_MAX_TOTAL_SUPPLY_ROLE, owner.address)
    await acl.connect(root).grantPermission(await stakingManager.getAddress(), TOKEN_MANAGER_ADDRESS, MINT_ROLE)
    await acl.connect(root).grantPermission(await stakingManager.getAddress(), TOKEN_MANAGER_ADDRESS, BURN_ROLE)

    await owner.sendTransaction({
      to: pntHolder1.address,
      value: ethers.parseEther('10')
    })
  })

  it('should be able to stake the first time', async () => {
    const stakeAmount = ethers.parseEther('10000')
    const duration = MIN_LOCK_DURATION
    const daoPnBalancePre = await daoPnt.balanceOf(pntHolder1.address)
    const pntBalancePre = await pnt.balanceOf(pntHolder1.address)

    await pnt.connect(pntHolder1).approve(await stakingManager.getAddress(), stakeAmount)
    await expect(stakingManager.connect(pntHolder1).stake(pntHolder1.address, stakeAmount, duration))
      .to.emit(stakingManager, 'Staked')
      .withArgs(pntHolder1.address, stakeAmount, duration)
    const expectedStartDate = await time.latest()
    const expectedEndDate = expectedStartDate + duration

    const daoPnBalancePost = await daoPnt.balanceOf(pntHolder1.address)
    const pntBalancePost = await pnt.balanceOf(pntHolder1.address)
    expect(daoPnBalancePost).to.be.eq(daoPnBalancePre + stakeAmount)
    expect(pntBalancePost).to.be.eq(pntBalancePre - stakeAmount)

    const stake = await stakingManager.stakeOf(pntHolder1.address)
    expect(stake.amount).to.be.eq(stakeAmount)
    expect(stake.token).to.be.eq(await pnt.getAddress())
    expect(stake.startDate).to.be.eq(expectedStartDate)
    expect(stake.endDate).to.be.eq(expectedEndDate)
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

    const stakeAmount = ethers.parseEther('10000')
    const duration1 = MIN_LOCK_DURATION * 2
    const duration2 = MIN_LOCK_DURATION

    await pnt.connect(pntHolder1).approve(await stakingManager.getAddress(), stakeAmount)
    await expect(stakingManager.connect(pntHolder1).stake(pntHolder1.address, stakeAmount, duration1))
      .to.emit(stakingManager, 'Staked')
      .withArgs(pntHolder1.address, stakeAmount, duration1)
    let expectedStartDate = await time.latest()
    const expectedEndDate = expectedStartDate + duration1

    let stake = await stakingManager.stakeOf(pntHolder1.address)
    expect(stake.amount).to.be.eq(stakeAmount)
    expect(stake.token).to.be.eq(await pnt.getAddress())
    expect(stake.startDate).to.be.eq(expectedStartDate)
    expect(stake.endDate).to.be.eq(expectedEndDate)

    await pnt.connect(pntHolder1).approve(await stakingManager.getAddress(), stakeAmount)
    await expect(stakingManager.connect(pntHolder1).stake(pntHolder1.address, stakeAmount, duration2))
      .to.emit(stakingManager, 'Staked')
      .withArgs(pntHolder1.address, stakeAmount, duration2)
    expectedStartDate = await time.latest()

    stake = await stakingManager.stakeOf(pntHolder1.address)
    expect(stake.amount).to.be.eq(stakeAmount * 2n)
    expect(stake.startDate).to.be.eq(expectedStartDate)
    expect(stake.endDate).to.be.eq(expectedEndDate)
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

    const stakeAmount = ethers.parseEther('10000')
    const duration1 = MIN_LOCK_DURATION
    const duration2 = MIN_LOCK_DURATION * 2

    await pnt.connect(pntHolder1).approve(await stakingManager.getAddress(), stakeAmount)
    await expect(stakingManager.connect(pntHolder1).stake(pntHolder1.address, stakeAmount, duration1))
      .to.emit(stakingManager, 'Staked')
      .withArgs(pntHolder1.address, stakeAmount, duration1)
    let expectedStartDate = await time.latest()
    let expectedEndDate = expectedStartDate + duration1

    let stake = await stakingManager.stakeOf(pntHolder1.address)
    expect(stake.amount).to.be.eq(stakeAmount)
    expect(stake.startDate).to.be.eq(expectedStartDate)
    expect(stake.endDate).to.be.eq(expectedEndDate)

    await pnt.connect(pntHolder1).approve(await stakingManager.getAddress(), stakeAmount)
    await expect(stakingManager.connect(pntHolder1).stake(pntHolder1.address, stakeAmount, duration2))
      .to.emit(stakingManager, 'Staked')
      .withArgs(pntHolder1.address, stakeAmount, duration2)
    expectedStartDate = await time.latest()
    expectedEndDate = expectedStartDate + duration2

    stake = await stakingManager.stakeOf(pntHolder1.address)
    expect(stake.amount).to.be.eq(stakeAmount * 2n)
    expect(stake.startDate).to.be.eq(expectedStartDate)
    expect(stake.endDate).to.be.eq(expectedEndDate)
  })

  it('should be able to unstake everything', async () => {
    const stakeAmount = ethers.parseEther('10000')
    const duration = MIN_LOCK_DURATION * 4

    await pnt.connect(pntHolder1).approve(await stakingManager.getAddress(), stakeAmount)
    await expect(stakingManager.connect(pntHolder1).stake(pntHolder1.address, stakeAmount, duration))
      .to.emit(stakingManager, 'Staked')
      .withArgs(pntHolder1.address, stakeAmount, duration)

    await time.increase(duration + 1)

    const daoPnBalancePre = await daoPnt.balanceOf(pntHolder1.address)
    const pntBalancePre = await pnt.balanceOf(pntHolder1.address)

    await expect(
      stakingManager.connect(pntHolder1)['unstake(uint256,bytes4)'](stakeAmount, PNETWORK_NETWORK_IDS.gnosisMainnet)
    )
      .to.emit(stakingManager, 'Unstaked')
      .withArgs(pntHolder1.address, stakeAmount)

    const stake = await stakingManager.stakeOf(pntHolder1.address)
    expect(stake.amount).to.be.eq(0)
    expect(stake.startDate).to.be.eq(0)
    expect(stake.endDate).to.be.eq(0)

    const daoPnBalancePost = await daoPnt.balanceOf(pntHolder1.address)
    const pntBalancePost = await pnt.balanceOf(pntHolder1.address)
    expect(daoPnBalancePost).to.be.eq(daoPnBalancePre - stakeAmount)
    expect(pntBalancePost).to.be.eq(pntBalancePre + stakeAmount)
  })

  it('should be able to unstake partially', async () => {
    const stakeAmount = ethers.parseEther('10000')
    const unstakeAmount = ethers.parseEther('5000')
    const duration = MIN_LOCK_DURATION * 4

    await pnt.connect(pntHolder1).approve(await stakingManager.getAddress(), stakeAmount)
    await expect(stakingManager.connect(pntHolder1).stake(pntHolder1.address, stakeAmount, duration))
      .to.emit(stakingManager, 'Staked')
      .withArgs(pntHolder1.address, stakeAmount, duration)
    const expectedStartDate = await time.latest()
    const expectedEndDate = expectedStartDate + duration

    await time.increase(duration + 1)

    const daoPnBalancePre = await daoPnt.balanceOf(pntHolder1.address)
    const pntBalancePre = await pnt.balanceOf(pntHolder1.address)

    await expect(
      stakingManager.connect(pntHolder1)['unstake(uint256,bytes4)'](unstakeAmount, PNETWORK_NETWORK_IDS.gnosisMainnet)
    )
      .to.emit(stakingManager, 'Unstaked')
      .withArgs(pntHolder1.address, unstakeAmount)

    const stake = await stakingManager.stakeOf(pntHolder1.address)
    expect(stake.amount).to.be.eq(stakeAmount - unstakeAmount)
    expect(stake.startDate).to.be.eq(expectedStartDate)
    expect(stake.endDate).to.be.eq(expectedEndDate)

    const daoPnBalancePost = await daoPnt.balanceOf(pntHolder1.address)
    const pntBalancePost = await pnt.balanceOf(pntHolder1.address)
    expect(daoPnBalancePost).to.be.eq(daoPnBalancePre - unstakeAmount)
    expect(pntBalancePost).to.be.eq(pntBalancePre + unstakeAmount)
  })

  it('should not be able to unstake if the staking period is not finished yet', async () => {
    const stakeAmount = ethers.parseEther('10000')
    const duration = MIN_LOCK_DURATION * 4

    await pnt.connect(pntHolder1).approve(await stakingManager.getAddress(), stakeAmount)
    await expect(stakingManager.connect(pntHolder1).stake(pntHolder1.address, stakeAmount, duration))
      .to.emit(stakingManager, 'Staked')
      .withArgs(pntHolder1.address, stakeAmount, duration)

    await expect(
      stakingManager.connect(pntHolder1)['unstake(uint256,bytes4)'](stakeAmount, PNETWORK_NETWORK_IDS.gnosisMainnet)
    ).to.be.revertedWithCustomError(stakingManager, 'UnfinishedStakingPeriod')
  })

  it('should not be able to unstake more than what you staked', async () => {
    const stakeAmount = ethers.parseEther('10000')
    const duration = MIN_LOCK_DURATION * 4

    await pnt.connect(pntHolder1).approve(await stakingManager.getAddress(), stakeAmount)
    await expect(stakingManager.connect(pntHolder1).stake(pntHolder1.address, stakeAmount, duration))
      .to.emit(stakingManager, 'Staked')
      .withArgs(pntHolder1.address, stakeAmount, duration)

    await time.increase(duration + 1)

    await expect(
      stakingManager
        .connect(pntHolder1)
        ['unstake(uint256,bytes4)'](stakeAmount + 1n, PNETWORK_NETWORK_IDS.gnosisMainnet)
    ).to.be.revertedWithCustomError(stakingManager, 'InvalidAmount')
  })

  it('should be able to increase the duration if the staking period is not finished yet', async () => {
    const stakeAmount = ethers.parseEther('10000')
    const duration1 = MIN_LOCK_DURATION * 2
    const duration2 = MIN_LOCK_DURATION * 5

    await pnt.connect(pntHolder1).approve(await stakingManager.getAddress(), stakeAmount)
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
    expect(stake.startDate).to.be.eq(expectedStartDate)
    expect(stake.endDate).to.be.eq(increasedEndDate)
  })

  it('should be able to increase the duration if the staking period is finished', async () => {
    const stakeAmount = ethers.parseEther('10000')
    const duration1 = MIN_LOCK_DURATION * 2
    const duration2 = MIN_LOCK_DURATION * 5

    await pnt.connect(pntHolder1).approve(await stakingManager.getAddress(), stakeAmount)
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
    expect(stake.startDate).to.be.eq(expectedStartDate)
    expect(stake.endDate).to.be.eq(increasedEndDate)
  })

  it('should not be able to increase duration if there is anything at stake', async () => {
    const duration = MIN_LOCK_DURATION * 5
    await expect(stakingManager.connect(pntHolder1).increaseDuration(duration)).to.be.revertedWithCustomError(
      stakingManager,
      'NothingAtStake'
    )
  })

  it('should be able to unstake after a contract upgrade', async () => {
    const stakeAmount = ethers.parseEther('10000')
    const duration = MIN_LOCK_DURATION * 4

    await pnt.connect(pntHolder1).approve(await stakingManager.getAddress(), stakeAmount)
    await expect(stakingManager.connect(pntHolder1).stake(pntHolder1.address, stakeAmount, duration))
      .to.emit(stakingManager, 'Staked')
      .withArgs(pntHolder1.address, stakeAmount, duration)

    await time.increase(duration + 1)

    const daoPnBalancePre = await daoPnt.balanceOf(pntHolder1.address)
    const pntBalancePre = await pnt.balanceOf(pntHolder1.address)

    await upgrades.upgradeProxy(await stakingManager.getAddress(), StakingManager, {
      kind: 'uups'
    })

    await expect(
      stakingManager.connect(pntHolder1)['unstake(uint256,bytes4)'](stakeAmount, PNETWORK_NETWORK_IDS.gnosisMainnet)
    )
      .to.emit(stakingManager, 'Unstaked')
      .withArgs(pntHolder1.address, stakeAmount)

    const stake = await stakingManager.stakeOf(pntHolder1.address)
    expect(stake.amount).to.be.eq(0)
    expect(stake.startDate).to.be.eq(0)
    expect(stake.endDate).to.be.eq(0)

    const daoPnBalancePost = await daoPnt.balanceOf(pntHolder1.address)
    const pntBalancePost = await pnt.balanceOf(pntHolder1.address)
    expect(daoPnBalancePost).to.be.eq(daoPnBalancePre - stakeAmount)
    expect(pntBalancePost).to.be.eq(pntBalancePre + stakeAmount)
  })

  it('should not be able to update the maximun supply without the corresponding role', async () => {
    const expectedError = `AccessControl: account ${pntHolder1.address.toLowerCase()} is missing role ${CHANGE_MAX_TOTAL_SUPPLY_ROLE}`
    await expect(stakingManager.connect(pntHolder1).changeMaxTotalSupply('1')).to.be.revertedWith(expectedError)
  })

  it('should be able to change the max total supply', async () => {
    await stakingManager.grantRole(CHANGE_MAX_TOTAL_SUPPLY_ROLE, owner.address)
    await expect(stakingManager.changeMaxTotalSupply('1')).to.emit(stakingManager, 'MaxTotalSupplyChanged').withArgs(1)
  })

  it('should not be able to mint more than the max total supply', async () => {
    const duration = ONE_DAY * 10
    const newMaxTotalSupply = ethers.parseEther('1000')
    await stakingManager.grantRole(CHANGE_MAX_TOTAL_SUPPLY_ROLE, owner.address)
    await stakingManager.changeMaxTotalSupply(newMaxTotalSupply)
    await pnt.connect(pntHolder1).approve(await stakingManager.getAddress(), newMaxTotalSupply + 1n)
    await expect(
      stakingManager.connect(pntHolder1).stake(pntHolder1.address, newMaxTotalSupply + 1n, duration)
    ).to.be.revertedWithCustomError(stakingManager, 'MaxTotalSupplyExceeded')
  })

  it('should be able to slash', async () => {
    const stakeAmount = ethers.parseEther('10000')
    const slashAmount = ethers.parseEther('1000')
    const duration = MIN_LOCK_DURATION * 4

    await pnt.connect(pntHolder1).approve(await stakingManager.getAddress(), stakeAmount)
    await stakingManager.connect(pntHolder1).stake(pntHolder1.address, stakeAmount, duration)

    let stake = await stakingManager.stakeOf(pntHolder1.address)
    expect(stake.amount).to.be.eq(stakeAmount)
    const daoPnBalancePre = await daoPnt.balanceOf(pntHolder1.address)
    const challengerPntBalancePre = await pnt.balanceOf(challenger.address)

    await expect(stakingManager.slash(pntHolder1.address, slashAmount, challenger.address))
      .to.emit(stakingManager, 'Slashed')
      .withArgs(pntHolder1.address, slashAmount, challenger.address)

    stake = await stakingManager.stakeOf(pntHolder1.address)
    expect(stake.amount).to.be.eq(stakeAmount - slashAmount)

    const daoPnBalancePost = await daoPnt.balanceOf(pntHolder1.address)
    const challengerPntBalancePost = await pnt.balanceOf(challenger.address)
    expect(daoPnBalancePost).to.be.eq(daoPnBalancePre - slashAmount)
    expect(challengerPntBalancePost).to.be.eq(challengerPntBalancePre + slashAmount)

    await time.increase(duration + 1)

    await expect(
      stakingManager.connect(pntHolder1)['unstake(uint256,bytes4)'](stakeAmount, PNETWORK_NETWORK_IDS.gnosisMainnet)
    ).to.be.revertedWithCustomError(stakingManager, 'InvalidAmount')
  })

  it('should not be able to slash more than the staked amount', async () => {
    const stakeAmount = ethers.parseEther('10000')
    const slashAmount = stakeAmount + 1n
    const duration = MIN_LOCK_DURATION * 4

    await pnt.connect(pntHolder1).approve(await stakingManager.getAddress(), stakeAmount)
    await stakingManager.connect(pntHolder1).stake(pntHolder1.address, stakeAmount, duration)

    const stake = await stakingManager.stakeOf(pntHolder1.address)
    expect(stake.amount).to.be.eq(stakeAmount)

    await expect(
      stakingManager.slash(pntHolder1.address, slashAmount, challenger.address)
    ).to.be.revertedWithCustomError(stakingManager, 'InvalidAmount')
  })

  it('should delete the Stake struct if the slashed amount is equal to the staked amount', async () => {
    const stakeAmount = ethers.parseEther('10000')
    const slashAmount = stakeAmount
    const duration = MIN_LOCK_DURATION * 4

    await pnt.connect(pntHolder1).approve(await stakingManager.getAddress(), stakeAmount)
    await stakingManager.connect(pntHolder1).stake(pntHolder1.address, stakeAmount, duration)
    const expectedStartDate = await time.latest()
    const firstEndDate = expectedStartDate + duration

    let stake = await stakingManager.stakeOf(pntHolder1.address)
    expect(stake.amount).to.be.eq(stakeAmount)
    expect(stake.token).to.be.eq(await pnt.getAddress())
    expect(stake.startDate).to.be.eq(expectedStartDate)
    expect(stake.endDate).to.be.eq(firstEndDate)
    await stakingManager.slash(pntHolder1.address, slashAmount, challenger.address)

    stake = await stakingManager.stakeOf(pntHolder1.address)
    expect(stake.amount).to.be.eq(0)
    expect(stake.token).to.be.eq(ZERO_ADDRESS)
    expect(stake.startDate).to.be.eq(0)
    expect(stake.endDate).to.be.eq(0)
  })

  it('should be able to increase the amount at stake', async () => {
    const stakeAmount = ethers.parseEther('10000')
    const duration = MIN_LOCK_DURATION * 4

    await pnt.connect(pntHolder1).approve(await stakingManager.getAddress(), stakeAmount)
    await stakingManager.connect(pntHolder1).stake(pntHolder1.address, stakeAmount, duration)

    let stake = await stakingManager.stakeOf(pntHolder1.address)
    expect(stake.amount).to.be.eq(stakeAmount)

    await pnt.connect(pntHolder1).approve(await stakingManager.getAddress(), stakeAmount)
    await expect(stakingManager.connect(pntHolder1).increaseAmount(stakeAmount)).to.emit(
      stakingManager,
      'AmountIncreased',
      pntHolder1.address,
      stakeAmount
    )

    stake = await stakingManager.stakeOf(pntHolder1.address)
    expect(stake.amount).to.be.eq(stakeAmount * 2n)
  })

  it('should not be able to increase the amount at stake if there is nothing at stake', async () => {
    const stakeAmount = ethers.parseEther('10000')

    await pnt.connect(pntHolder1).approve(await stakingManager.getAddress(), stakeAmount)
    await expect(stakingManager.connect(pntHolder1).increaseAmount(stakeAmount)).to.be.revertedWithCustomError(
      stakingManager,
      'NothingAtStake'
    )
  })

  it('should not be able to increase the amount at stake if the timelock is passed', async () => {
    const stakeAmount = ethers.parseEther('10000')
    const duration = MIN_LOCK_DURATION * 4
    await pnt.connect(pntHolder1).approve(await stakingManager.getAddress(), stakeAmount)
    await stakingManager.connect(pntHolder1).stake(pntHolder1.address, stakeAmount, duration)
    await time.increase(duration + 1)
    await expect(stakingManager.connect(pntHolder1).increaseAmount(stakeAmount)).to.be.revertedWithCustomError(
      stakingManager,
      'InvalidDuration'
    )
  })

  it('should not be able to increase the amount at stake if the remaining timelock is less than 7 days', async () => {
    const stakeAmount = ethers.parseEther('10000')
    const duration = MIN_LOCK_DURATION * 4
    await pnt.connect(pntHolder1).approve(await stakingManager.getAddress(), stakeAmount)
    await stakingManager.connect(pntHolder1).stake(pntHolder1.address, stakeAmount, duration)
    await time.increase(duration - MIN_LOCK_DURATION + ONE_DAY)
    await expect(stakingManager.connect(pntHolder1).increaseAmount(stakeAmount)).to.be.revertedWithCustomError(
      stakingManager,
      'InvalidDuration'
    )
  })
})
