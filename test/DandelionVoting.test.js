// This is just a test that uses old contracts since using aragon stuff it's a pain and we want
// to simulate easily in a forked environment what could happen if we wanted to implements some
// changes required for the pNetwork DAO V2
/*
const { expect } = require('chai')
const { ethers, config } = require('hardhat')
const { getRole } = require('./utils')
const { encodeCallScript } = require('./utils/aragon')
const { time, mine, mineUpTo } = require('@nomicfoundation/hardhat-network-helpers')

let voting,
  pnt,
  ethpnt,
  owner,
  daoPntHolder1,
  daoPntHolder2,
  daoPntHolder3,
  daoPntHolder4,
  daoPntHolder5,
  root,
  acl,
  user1,
  user2,
  association,
  financeVault,
  ACL,
  Vault

const STAKING_MANAGER_ADDRESS = '0xeb10e80D99655B51E3a981E888a73D0B21e21A6C'
const DANDELION_VOTING_ADDRESS = '0x2211bFD97b1c02aE8Ac305d206e9780ba7D8BfF4'
const PNT_ADDRESS = '0x89Ab32156e46F46D02ade3FEcbe5Fc4243B9AAeD'
const ETHPNT_ADDRESS = '0xf4eA6B892853413bD9d9f1a5D3a620A0ba39c5b2'
const DAO_PNT_HOLDER_1_ADDRESS = '0xf977814e90da44bfa03b6295a0616a897441acec'
const DAO_PNT_HOLDER_2_ADDRESS = '0xc4442915b1fb44972ee4d8404ce05a8d2a1248da'
const DAO_PNT_HOLDER_3_ADDRESS = '0xe8b43e7d55337ab735f6e1932d4a1e98de70eabc'
const DAO_PNT_HOLDER_4_ADDRESS = '0x9ad4550759389ca7f0488037daa4332b1f30cdac'
const DAO_PNT_HOLDER_5_ADDRESS = '0x100a70b9e50e91367d571332e76cfa70e9307059'
const DAO_ROOT_ADDRESS = '0x6Ae14ff8d24F719a8cf5A9FAa2Ad05dA7e44C8b6'
const ACL_ADDRESS = '0xFDcae423E5e92B76FE7D1e2bcabd36fca8a6a8Fe'
const FINANCE_VAULT_ADDRESS = '0xDd92eb1478D3189707aB7F4a5aCE3a615cdD0476'
const ASSOCIATION_ADDRESS = '0xf1f6568a76559d85cF68E6597fA587544184dD46'

const CREATE_VOTES_ROLE = getRole('CREATE_VOTES_ROLE')
const TRANSFER_ROLE = getRole('TRANSFER_ROLE')

// minAcceptQuorumPct = 150000000000000000  -->  15%
// supportRequiredPct = 510000000000000000  -->  51%

describe('DandelionVoting', () => {
  beforeEach(async () => {
    await network.provider.request({
      method: 'hardhat_reset',
      params: [
        {
          forking: {
            jsonRpcUrl: config.networks.hardhat.forking.url
          }
        }
      ]
    })

    const DandelionVoting = await ethers.getContractFactory('DandelionVoting')
    const StakingManager = await ethers.getContractFactory('StakingManager')
    ACL = await ethers.getContractFactory('ACL')
    const ERC20 = await ethers.getContractFactory('ERC20')
    Vault = await ethers.getContractFactory('Vault')

    const signers = await ethers.getSigners()
    owner = signers[0]
    user1 = signers[1]
    user2 = signers[2]
    user3 = signers[3]
    daoPntHolder1 = await ethers.getImpersonatedSigner(DAO_PNT_HOLDER_1_ADDRESS)
    daoPntHolder2 = await ethers.getImpersonatedSigner(DAO_PNT_HOLDER_2_ADDRESS)
    daoPntHolder3 = await ethers.getImpersonatedSigner(DAO_PNT_HOLDER_3_ADDRESS)
    daoPntHolder4 = await ethers.getImpersonatedSigner(DAO_PNT_HOLDER_4_ADDRESS)
    daoPntHolder5 = await ethers.getImpersonatedSigner(DAO_PNT_HOLDER_5_ADDRESS)
    association = await ethers.getImpersonatedSigner(ASSOCIATION_ADDRESS)
    root = await ethers.getImpersonatedSigner(DAO_ROOT_ADDRESS)

    stakingManager = await StakingManager.attach(STAKING_MANAGER_ADDRESS)
    voting = await DandelionVoting.attach(DANDELION_VOTING_ADDRESS)
    pnt = await ERC20.attach(PNT_ADDRESS)
    ethpnt = await ERC20.attach(ETHPNT_ADDRESS)
    acl = await ACL.attach(ACL_ADDRESS)
    financeVault = await Vault.attach(FINANCE_VAULT_ADDRESS)

    VOTE_DURATION_BLOCKS = await voting.durationBlocks()

    await owner.sendTransaction({
      to: daoPntHolder1.address,
      value: ethers.utils.parseEther('1')
    })
    await owner.sendTransaction({
      to: daoPntHolder2.address,
      value: ethers.utils.parseEther('1')
    })
    await owner.sendTransaction({
      to: daoPntHolder3.address,
      value: ethers.utils.parseEther('1')
    })
    await owner.sendTransaction({
      to: daoPntHolder4.address,
      value: ethers.utils.parseEther('1')
    })
    await owner.sendTransaction({
      to: daoPntHolder5.address,
      value: ethers.utils.parseEther('1')
    })
    await owner.sendTransaction({
      to: user2.address,
      value: ethers.utils.parseEther('1')
    })
    await owner.sendTransaction({
      to: association.address,
      value: ethers.utils.parseEther('1')
    })
  })

  /*it('should be able to give to the users that have more than 200k the permission of opening votes', async () => {
    let voteId = 21
    // give the permission to a random user in order to simulating
    // the fact that this user would have more than 200k pnt
    // since at the moment the DandelionVoting contract logic is not updated yet
    // and it's not possible to make opening votes to who has more than 200k pnt
    await acl.connect(root).grantPermission(user1.address, voting.address, CREATE_VOTES_ROLE)

    // voting manager should be the permission manager of himself for CREATES_VOTES_ROLE
    // NOTE: BE CAREFULL since we can risk to lose the control
    await acl.connect(root).setPermissionManager(voting.address, voting.address, CREATE_VOTES_ROLE)

    const action = {
      to: acl.address,
      calldata: ACL.interface.encodeFunctionData('grantPermission', [user2.address, voting.address, CREATE_VOTES_ROLE])
    }
    const script = encodeCallScript([action])
    await expect(voting.connect(user1).newVote(script, 'metadata', false))
      .to.emit(voting, 'StartVote')
      .withArgs(voteId, user1.address, 'metadata')

    await voting.connect(daoPntHolder1).vote(voteId, true)
    await voting.connect(daoPntHolder2).vote(voteId, true)
    await voting.connect(daoPntHolder3).vote(voteId, true)
    await voting.connect(daoPntHolder4).vote(voteId, true)

    const vote = await voting.getVote(voteId)
    await mineUpTo(vote.executionBlock.toNumber() + 1)
    await voting.executeVote(voteId)

    voteId = 22
    await expect(voting.connect(user2).newVote([], 'metadata', false))
      .to.emit(voting, 'StartVote')
      .withArgs(voteId, user2.address, 'metadata')

    await expect(voting.connect(user3).newVote([], 'metadata', false)).to.be.revertedWith('APP_AUTH_FAILED')
  })
})
*/
