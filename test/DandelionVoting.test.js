// This is just a test that uses old contracts since using aragon stuff it's a pain and we want
// to simulate easily in a forked environment what could happen if we wanted to implements some
// changes required for the pNetwork DAO V2

const { expect } = require('chai')
const { ethers, config, upgrades } = require('hardhat')
const { getRole } = require('./utils')
const { encodeCallScript } = require('./utils/aragon')
const { time, mine, mineUpTo } = require('@nomicfoundation/hardhat-network-helpers')
const TransparentUpgradeableProxy = require('@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol/TransparentUpgradeableProxy.json')

let voting, owner, daoPntHolder1, daoPntHolder2, daoPntHolder3, daoPntHolder4, daoPntHolder5, user2, ACL

const STAKING_MANAGER_ADDRESS = '0xeb10e80D99655B51E3a981E888a73D0B21e21A6C'
const DANDELION_VOTING_ADDRESS = '0x2211bFD97b1c02aE8Ac305d206e9780ba7D8BfF4'
const PNT_ADDRESS = '0x89Ab32156e46F46D02ade3FEcbe5Fc4243B9AAeD'
const DAO_PNT_HOLDER_1_ADDRESS = '0xBDE8B37e17c0d6C20728451652A0678aa1CA2B72'
const DAO_PNT_HOLDER_2_ADDRESS = '0xc4442915b1fb44972ee4d8404ce05a8d2a1248da'
const DAO_PNT_HOLDER_3_ADDRESS = '0xe8b43e7d55337ab735f6e1932d4a1e98de70eabc'
const DAO_PNT_HOLDER_4_ADDRESS = '0x9ad4550759389ca7f0488037daa4332b1f30cdac'
const DAO_PNT_HOLDER_5_ADDRESS = '0x100a70b9e50e91367d571332e76cfa70e9307059'
const DAO_ROOT_ADDRESS = '0x6Ae14ff8d24F719a8cf5A9FAa2Ad05dA7e44C8b6'
const ACL_ADDRESS = '0xFDcae423E5e92B76FE7D1e2bcabd36fca8a6a8Fe'
const KERNEL_ADDRESS = '0x2732fd9fd5f0e84b1b774cf5e6f5c812eafd455b'
const REPO_ADDRESS = '0x933c8920bb67dd8e3a845187f77766584579ee1f'

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
    const Test = await ethers.getContractFactory('Test')
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
    root = await ethers.getImpersonatedSigner(DAO_ROOT_ADDRESS)

    test = await upgrades.deployProxy(Test, [], {
      initializer: 'initialize',
      kind: 'uups'
    })

    voting = await DandelionVoting.attach(DANDELION_VOTING_ADDRESS)
    pnt = await ERC20.attach(PNT_ADDRESS)
    acl = await ACL.attach(ACL_ADDRESS)

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
  })

  it('should be able to open a vote that updates an OLD contract', async () => {
    const voteId = 24
    const Kernel = await ethers.getContractFactory('Kernel')
    const kernel = Kernel.attach(KERNEL_ADDRESS)

    // gives to the voting contract the role to upgrade a contract
    await acl.connect(root).grantPermission(voting.address, kernel.address, getRole('APP_MANAGER_ROLE'))
    // IMPORTANT: remove to the root the possibility to upgrade a contract within the dao. Only the voting contract can do it
    await acl.connect(root).revokePermission(root.address, kernel.address, getRole('APP_MANAGER_ROLE'))

    // TODO: adds fxs to calculate them dynamically but they are not important here since the first
    // thing that an user that wants to create a vote needs to do is to deploy the implementation
    // contract and publish it on Repo (Repo.newVersion) and then he opens the vote.
    // At this point everyone can check the vote correcteness and the new implementation contract
    const namespace = '0xf1f3eb40f5bc1ad1344716ced8b8a0431d840b5783aea1fd01786bc26f35ac0f'
    const name = '0x3e55205d77d748c700b32946450b8a5288b34f89c19d8749f4de7543090f8dcc'
    const app = '0x19cbd7eE4E77AC8CFF336eD5a424360bc052e7B9'

    await expect(kernel.connect(root).setApp(namespace, name, app)).to.be.revertedWith('KERNEL_AUTH_FAILED')

    const action = {
      to: kernel.address,
      calldata: kernel.interface.encodeFunctionData('setApp', [namespace, name, app])
    }

    const script = encodeCallScript([action])

    await voting.connect(daoPntHolder1).newVote(script, 'metadata', false)
    await voting.connect(daoPntHolder1).vote(voteId, true)
    await voting.connect(daoPntHolder2).vote(voteId, true)
    await voting.connect(daoPntHolder3).vote(voteId, true)
    await voting.connect(daoPntHolder4).vote(voteId, true)

    const vote = await voting.getVote(voteId)
    await mineUpTo(vote.executionBlock.toNumber() + 1)
    await expect(voting.executeVote(voteId)).to.emit(kernel, 'SetApp').withArgs(namespace, name, app)
  })

  it('should be able to open a vote that updates a NEW contract', async () => {
    const voteId = 25
    const TestV2 = await ethers.getContractFactory('TestV2')
    const testV2Address = await upgrades.deployImplementation(TestV2)

    const TransparentUpgradeableProxyFactory = await ethers.getContractFactory(
      TransparentUpgradeableProxy.abi,
      TransparentUpgradeableProxy.bytecode,
      owner
    )
    const proxy = TransparentUpgradeableProxyFactory.attach(test.address)

    const action = {
      to: proxy.address,
      calldata: proxy.interface.encodeFunctionData('upgradeTo', [testV2Address])
    }

    const script = encodeCallScript([action])

    await expect(voting.connect(daoPntHolder1).newVote(script, 'metadata', false))
      .to.emit(voting, 'StartVote')
      .withArgs(voteId, daoPntHolder1.address, 'metadata')

    await voting.connect(daoPntHolder1).vote(voteId, true)
    await voting.connect(daoPntHolder2).vote(voteId, true)
    await voting.connect(daoPntHolder3).vote(voteId, true)
    await voting.connect(daoPntHolder4).vote(voteId, true)

    const vote = await voting.getVote(voteId)
    await mineUpTo(vote.executionBlock.toNumber() + 1)

    expect(await test.version()).to.be.eq(1)
    // Test doesn't have the onlyRole(Roles.UPGRADE_ROLE) modifier
    await expect(voting.executeVote(voteId))
    expect(await test.version()).to.be.eq(2)
  })
})
