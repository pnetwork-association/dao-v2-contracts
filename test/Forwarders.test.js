const { time } = require('@nomicfoundation/hardhat-network-helpers')
const { expect } = require('chai')
const { ethers, upgrades } = require('hardhat')

const { ACL_ADDRESS, SAFE_ADDRESS, TOKEN_MANAGER_ADDRESS } = require('../lib/constants')
const { encodeMetadata, decodeMetadata } = require('../lib/metadata')
const { getAllRoles } = require('../lib/roles')

const {
  BORROW_AMOUNT_FOR_SENTINEL_REGISTRATION,
  EPOCH_DURATION,
  LEND_MAX_EPOCHS,
  ONE_DAY,
  PNETWORK_ADDRESS,
  PNETWORK_NETWORK_IDS,
  PNT_HOLDER_1_ADDRESS,
  PNT_HOLDER_2_ADDRESS,
  PNT_MAX_TOTAL_SUPPLY,
  REGISTRATION_SENTINEL_BORROWING,
  REGISTRATION_SENTINEL_STAKING
} = require('./constants')
const { encode, getSentinelIdentity, getUserDataGeneratedByForwarder } = require('./utils')
const { sendEth } = require('./utils/send-eth')

const { BORROW_ROLE, STAKE_ROLE, INCREASE_DURATION_ROLE, UPGRADE_ROLE, MINT_ROLE, BURN_ROLE, SET_FORWARDER_ROLE } =
  getAllRoles(ethers)

let acl,
  forwarderNative,
  forwarderHost,
  stakingManager,
  stakingManagerLM,
  stakingManagerRM,
  lendingManager,
  registrationManager,
  epochsManager,
  vault,
  voting,
  owner,
  pnt,
  pToken,
  pnetwork,
  sentinel1,
  daoRoot,
  pntHolder1,
  pntHolder2,
  fakeForwarder,
  forwarderRecipientUpgradeableTestData,
  fakeDandelionVoting

const MOCK_PTOKEN_ERC777 = 'MockPTokenERC777'
const MOCK_PTOKEN_ERC20 = 'MockPTokenERC20'
const PTOKEN_CONTRACTS = [MOCK_PTOKEN_ERC777, MOCK_PTOKEN_ERC20]

PTOKEN_CONTRACTS.map((_ptokenContract) =>
  describe(`Forwarders with host pToken as ${_ptokenContract.slice(4)}`, () => {
    beforeEach(async () => {
      const ForwarderNative = await ethers.getContractFactory('ForwarderNative')
      const ForwarderHost = await ethers.getContractFactory('ForwarderHost')
      const StakingManager = await ethers.getContractFactory('StakingManager')
      const StakingManagerPermissioned = await ethers.getContractFactory('StakingManagerPermissioned')
      const LendingManager = await ethers.getContractFactory('LendingManager')
      const RegistrationManager = await ethers.getContractFactory('RegistrationManager')
      const EpochsManager = await ethers.getContractFactory('EpochsManager')
      const MockPToken = await ethers.getContractFactory(_ptokenContract)
      const MockPTokensVault = await ethers.getContractFactory('MockPTokensVault')
      const TestToken = await ethers.getContractFactory('TestToken')
      const ACL = await ethers.getContractFactory('ACL')
      const DandelionVoting = await ethers.getContractFactory('DandelionVoting')

      const signers = await ethers.getSigners()
      owner = signers[0]
      sentinel1 = signers[1]
      fakeForwarder = signers[2]
      fakeDandelionVoting = signers[3]
      pnetwork = await ethers.getImpersonatedSigner(PNETWORK_ADDRESS)
      pntHolder1 = await ethers.getImpersonatedSigner(PNT_HOLDER_1_ADDRESS)
      pntHolder2 = await ethers.getImpersonatedSigner(PNT_HOLDER_2_ADDRESS)
      daoRoot = await ethers.getImpersonatedSigner(SAFE_ADDRESS)
      sendEth(ethers, owner, daoRoot.address, '1')

      acl = ACL.attach(ACL_ADDRESS)
      pnt = await TestToken.deploy('PNT', 'PNT')
      vault = await MockPTokensVault.deploy(PNETWORK_NETWORK_IDS.ethereumMainnet)
      pToken = await MockPToken.connect(owner).deploy(
        'Host Token (pToken)',
        'HTKN',
        pnetwork.address,
        PNETWORK_NETWORK_IDS.gnosisMainnet
      )
      await pnt.connect(owner).transfer(pntHolder1.address, ethers.parseEther('400000'))
      await pnt.connect(owner).transfer(pntHolder2.address, ethers.parseEther('400000'))

      forwarderNative = await ForwarderNative.deploy(await pnt.getAddress(), await vault.getAddress())
      forwarderHost = await ForwarderHost.deploy(await pToken.getAddress())
      await forwarderNative.whitelistOriginAddress(await forwarderHost.getAddress())
      await forwarderHost.whitelistOriginAddress(await forwarderNative.getAddress())

      stakingManager = await upgrades.deployProxy(
        StakingManager,
        [await pToken.getAddress(), TOKEN_MANAGER_ADDRESS, await forwarderHost.getAddress(), PNT_MAX_TOTAL_SUPPLY],
        {
          initializer: 'initialize',
          kind: 'uups'
        }
      )

      stakingManagerLM = await upgrades.deployProxy(
        StakingManagerPermissioned,
        [await pToken.getAddress(), TOKEN_MANAGER_ADDRESS, await forwarderHost.getAddress(), PNT_MAX_TOTAL_SUPPLY],
        {
          initializer: 'initialize',
          kind: 'uups'
        }
      )

      stakingManagerRM = await upgrades.deployProxy(
        StakingManagerPermissioned,
        [await pToken.getAddress(), TOKEN_MANAGER_ADDRESS, await forwarderHost.getAddress(), PNT_MAX_TOTAL_SUPPLY],
        {
          initializer: 'initialize',
          kind: 'uups'
        }
      )

      epochsManager = await upgrades.deployProxy(EpochsManager, [EPOCH_DURATION, 0], {
        initializer: 'initialize',
        kind: 'uups'
      })

      lendingManager = await upgrades.deployProxy(
        LendingManager,
        [
          await pToken.getAddress(),
          await stakingManagerLM.getAddress(),
          await epochsManager.getAddress(),
          await forwarderHost.getAddress(),
          fakeDandelionVoting.address,
          LEND_MAX_EPOCHS
        ],
        {
          initializer: 'initialize',
          kind: 'uups'
        }
      )

      registrationManager = await upgrades.deployProxy(
        RegistrationManager,
        [
          await pToken.getAddress(),
          await stakingManagerRM.getAddress(),
          await epochsManager.getAddress(),
          await lendingManager.getAddress(),
          await forwarderHost.getAddress()
        ],
        {
          initializer: 'initialize',
          kind: 'uups'
        }
      )

      voting = await DandelionVoting.deploy(await forwarderHost.getAddress())
      await voting.setForwarder(await forwarderHost.getAddress())

      // set permissions
      await acl.connect(daoRoot).grantPermission(await stakingManager.getAddress(), TOKEN_MANAGER_ADDRESS, MINT_ROLE)
      await acl.connect(daoRoot).grantPermission(await stakingManager.getAddress(), TOKEN_MANAGER_ADDRESS, BURN_ROLE)
      await acl.connect(daoRoot).grantPermission(await stakingManagerRM.getAddress(), TOKEN_MANAGER_ADDRESS, MINT_ROLE)
      await acl.connect(daoRoot).grantPermission(await stakingManagerRM.getAddress(), TOKEN_MANAGER_ADDRESS, BURN_ROLE)
      await acl.connect(daoRoot).grantPermission(await stakingManagerLM.getAddress(), TOKEN_MANAGER_ADDRESS, MINT_ROLE)
      await acl.connect(daoRoot).grantPermission(await stakingManagerLM.getAddress(), TOKEN_MANAGER_ADDRESS, BURN_ROLE)
      await lendingManager.grantRole(BORROW_ROLE, await registrationManager.getAddress())
      await stakingManagerLM.grantRole(STAKE_ROLE, await lendingManager.getAddress())
      await stakingManagerLM.grantRole(INCREASE_DURATION_ROLE, await lendingManager.getAddress())
      await stakingManagerRM.grantRole(STAKE_ROLE, await registrationManager.getAddress())
      await stakingManagerRM.grantRole(INCREASE_DURATION_ROLE, await registrationManager.getAddress())
      await stakingManager.grantRole(UPGRADE_ROLE, owner.address)
      await lendingManager.grantRole(UPGRADE_ROLE, owner.address)
      await registrationManager.grantRole(UPGRADE_ROLE, owner.address)

      await stakingManager.setForwarder(await forwarderHost.getAddress())
      await lendingManager.setForwarder(await forwarderHost.getAddress())
      await registrationManager.setForwarder(await forwarderHost.getAddress())

      await sendEth(ethers, owner, pntHolder1.address, '10')
      await sendEth(ethers, owner, pntHolder2.address, '10')
      await sendEth(ethers, owner, pnetwork.address, '10')
      await pnt.connect(owner).transfer(await forwarderNative.getAddress(), ethers.parseEther('10000'))

      forwarderRecipientUpgradeableTestData = [
        {
          artifact: StakingManager,
          contract: stakingManager
        },
        {
          artifact: LendingManager,
          contract: lendingManager
        },
        {
          artifact: RegistrationManager,
          contract: registrationManager
        }
      ]
    })

    describe('ForwarderRecipientUpgradeable', () => {
      it('should not be able to change the forwarder without the corresponding role', async () => {
        for (const { contract } of forwarderRecipientUpgradeableTestData) {
          const expectedError = `AccessControl: account ${pntHolder1.address.toLowerCase()} is missing role ${SET_FORWARDER_ROLE}`
          await expect(contract.connect(pntHolder1).setForwarder(fakeForwarder.address)).to.be.revertedWith(
            expectedError
          )
        }
      })

      it('should be able to change the forwarder', async () => {
        for (const { contract } of forwarderRecipientUpgradeableTestData) {
          await contract.grantRole(SET_FORWARDER_ROLE, pntHolder1.address)
          await contract.connect(pntHolder1).setForwarder(fakeForwarder.address)
          expect(await contract.forwarder()).to.be.eq(fakeForwarder.address)
        }
      })

      it('should be able to change the forwarder after a contract upgrade', async () => {
        for (const { artifact, contract } of forwarderRecipientUpgradeableTestData) {
          await contract.grantRole(SET_FORWARDER_ROLE, pntHolder1.address)
          await contract.connect(pntHolder1).setForwarder(fakeForwarder.address)
          expect(await contract.forwarder()).to.be.eq(fakeForwarder.address)
          await upgrades.upgradeProxy(await contract.getAddress(), artifact, {
            kind: 'uups'
          })
          await contract.connect(pntHolder1).setForwarder(await forwarderHost.getAddress())
          expect(await contract.forwarder()).to.be.eq(await forwarderHost.getAddress())
        }
      })
    })

    it('should be able to forward a vote', async () => {
      const voteId = 1
      const dandelionVotingInterface = new ethers.Interface([
        'function delegateVote(address voter, uint256 _voteId, bool _supports)'
      ])
      const userData = encode(
        ['address[]', 'bytes[]'],
        [
          [await voting.getAddress()],
          [dandelionVotingInterface.encodeFunctionData('delegateVote', [pntHolder1.address, voteId, true])]
        ]
      )

      await expect(
        forwarderNative
          .connect(pntHolder1)
          .call(0, await forwarderHost.getAddress(), userData, PNETWORK_NETWORK_IDS.gnosisMainnet)
      )
        .to.emit(vault, 'PegIn')
        .withArgs(
          await pnt.getAddress(),
          await forwarderNative.getAddress(),
          1,
          (await forwarderHost.getAddress()).toLowerCase().slice(2),
          getUserDataGeneratedByForwarder(userData, pntHolder1.address),
          PNETWORK_NETWORK_IDS.ethereumMainnet,
          PNETWORK_NETWORK_IDS.gnosisMainnet
        )

      // NOTE: at this point let's suppose that a pNetwork node processes the pegin ...

      const metadata = encodeMetadata(ethers, {
        userData: getUserDataGeneratedByForwarder(userData, pntHolder1.address),
        sourceNetworkId: PNETWORK_NETWORK_IDS.ethereumMainnet,
        senderAddress: await forwarderNative.getAddress(),
        destinationNetworkId: PNETWORK_NETWORK_IDS.gnosisMainnet,
        receiverAddress: await forwarderHost.getAddress()
      })

      await expect(pToken.connect(pnetwork).mint(await forwarderHost.getAddress(), 0, metadata, '0x'))
        .to.emit(voting, 'CastVote')
        .withArgs(voteId, pntHolder1.address, true)
    })

    it('should revert if an attacker calls delegateVote', async () => {
      const attacker = ethers.Wallet.createRandom().connect(ethers.provider)
      await sendEth(ethers, owner, attacker.address, '10')
      const voteId = 1
      const dandelionVotingInterface = new ethers.Interface([
        'function delegateVote(address voter, uint256 _voteId, bool _supports)'
      ])
      const userData = encode(
        ['address[]', 'bytes[]'],
        [
          [await voting.getAddress()],
          [dandelionVotingInterface.encodeFunctionData('delegateVote', [pntHolder1.address, voteId, true])]
        ]
      )

      await expect(
        forwarderNative
          .connect(attacker)
          .call(0, await forwarderHost.getAddress(), userData, PNETWORK_NETWORK_IDS.gnosisMainnet)
      )
        .to.emit(vault, 'PegIn')
        .withArgs(
          await pnt.getAddress(),
          await forwarderNative.getAddress(),
          1,
          (await forwarderHost.getAddress()).toLowerCase().slice(2),
          getUserDataGeneratedByForwarder(userData, attacker.address),
          PNETWORK_NETWORK_IDS.ethereumMainnet,
          PNETWORK_NETWORK_IDS.gnosisMainnet
        )

      // NOTE: at this point let's suppose that a pNetwork node processes the pegin ...

      const metadata = encodeMetadata(ethers, {
        userData: getUserDataGeneratedByForwarder(userData, attacker.address),
        sourceNetworkId: PNETWORK_NETWORK_IDS.ethereumMainnet,
        senderAddress: await forwarderNative.getAddress(),
        destinationNetworkId: PNETWORK_NETWORK_IDS.gnosisMainnet,
        receiverAddress: await forwarderHost.getAddress()
      })

      if (_ptokenContract === MOCK_PTOKEN_ERC20) {
        await expect(pToken.connect(pnetwork).mint(await forwarderHost.getAddress(), 0, metadata, '0x'))
          .to.emit(pToken, 'ReceiveUserDataFailed')
          .and.to.not.emit(voting, 'CastVote')
      } else if (_ptokenContract === MOCK_PTOKEN_ERC777) {
        await expect(pToken.connect(pnetwork).mint(await forwarderHost.getAddress(), 0, metadata, '0x'))
          .to.be.revertedWithCustomError(forwarderHost, 'InvalidCaller')
          .withArgs(attacker.address, pntHolder1.address)
      } else expect.fail('Unsupported pToken contract')
    })

    it('should not be able to forward if sender is not native forwarder', async () => {
      const attacker = ethers.Wallet.createRandom()
      const voteId = 1
      const dandelionVotingInterface = new ethers.Interface([
        'function delegateVote(address voter, uint256 _voteId, bool _supports)'
      ])
      const userData = encode(
        ['address[]', 'bytes[]'],
        [
          [await voting.getAddress()],
          [dandelionVotingInterface.encodeFunctionData('delegateVote', [pntHolder1.address, voteId, true])]
        ]
      )

      expect(await pToken.balanceOf(await forwarderHost.getAddress())).to.be.eq(0)
      const metadata = encodeMetadata(ethers, {
        userData: getUserDataGeneratedByForwarder(userData, pntHolder1.address),
        sourceNetworkId: PNETWORK_NETWORK_IDS.ethereumMainnet,
        senderAddress: attacker.address,
        destinationNetworkId: PNETWORK_NETWORK_IDS.gnosisMainnet,
        receiverAddress: await forwarderHost.getAddress()
      })

      if (_ptokenContract === MOCK_PTOKEN_ERC20) {
        await expect(pToken.connect(pnetwork).mint(await forwarderHost.getAddress(), 1, metadata, '0x'))
          .to.emit(pToken, 'ReceiveUserDataFailed')
          .and.to.not.emit(voting, 'CastVote')
        expect(await pToken.balanceOf(await forwarderHost.getAddress())).to.be.eq(1)
      } else if (_ptokenContract === MOCK_PTOKEN_ERC777) {
        await expect(pToken.connect(pnetwork).mint(await forwarderHost.getAddress(), 0, metadata, '0x'))
          .to.be.revertedWithCustomError(forwarderHost, 'InvalidOriginAddress')
          .withArgs(attacker.address)
        expect(await pToken.balanceOf(await forwarderHost.getAddress())).to.be.eq(0)
      } else expect.fail('Unsupported pToken contract')
    })

    it('should be able to forward a stake request', async () => {
      const stakeAmount = ethers.parseEther('1000')
      const duration = ONE_DAY * 7

      const userData = encode(
        ['address[]', 'bytes[]'],
        [
          [await pToken.getAddress(), await stakingManager.getAddress()],
          [
            pToken.interface.encodeFunctionData('approve', [await stakingManager.getAddress(), stakeAmount]),
            stakingManager.interface.encodeFunctionData('stake', [pntHolder1.address, stakeAmount, duration])
          ]
        ]
      )

      await pnt.connect(pntHolder1).approve(await forwarderNative.getAddress(), stakeAmount)
      await forwarderNative
        .connect(pntHolder1)
        .call(stakeAmount, await forwarderHost.getAddress(), userData, PNETWORK_NETWORK_IDS.gnosisMainnet)

      // NOTE: at this point let's suppose that a pNetwork node processes the pegin...

      const metadata = encodeMetadata(ethers, {
        userData: getUserDataGeneratedByForwarder(userData, pntHolder1.address),
        sourceNetworkId: PNETWORK_NETWORK_IDS.ethereumMainnet,
        senderAddress: await forwarderNative.getAddress(),
        destinationNetworkId: PNETWORK_NETWORK_IDS.gnosisMainnet,
        receiverAddress: await forwarderHost.getAddress()
      })

      await expect(pToken.connect(pnetwork).mint(await forwarderHost.getAddress(), stakeAmount, metadata, '0x'))
        .to.emit(stakingManager, 'Staked')
        .withArgs(pntHolder1.address, stakeAmount, duration)
    })

    it('should be able to forward a lend request', async () => {
      const lendAmount = ethers.parseEther('10000')
      const duration = EPOCH_DURATION * 13

      const userData = encode(
        ['address[]', 'bytes[]'],
        [
          [await pToken.getAddress(), await lendingManager.getAddress()],
          [
            pToken.interface.encodeFunctionData('approve', [await lendingManager.getAddress(), lendAmount]),
            lendingManager.interface.encodeFunctionData('lend', [pntHolder1.address, lendAmount, duration])
          ]
        ]
      )

      await pnt.connect(pntHolder1).approve(await forwarderNative.getAddress(), lendAmount)
      await forwarderNative
        .connect(pntHolder1)
        .call(lendAmount, await forwarderHost.getAddress(), userData, PNETWORK_NETWORK_IDS.gnosisMainnet)

      // NOTE: at this point let's suppose that a pNetwork node processes the pegin...

      const metadata = encodeMetadata(ethers, {
        userData: getUserDataGeneratedByForwarder(userData, pntHolder1.address),
        sourceNetworkId: PNETWORK_NETWORK_IDS.ethereumMainnet,
        senderAddress: await forwarderNative.getAddress(),
        destinationNetworkId: PNETWORK_NETWORK_IDS.gnosisMainnet,
        receiverAddress: await forwarderHost.getAddress()
      })

      await expect(pToken.connect(pnetwork).mint(await forwarderHost.getAddress(), lendAmount, metadata, '0x'))
        .to.emit(lendingManager, 'Lended')
        .withArgs(pntHolder1.address, 1, 12, lendAmount)
    })

    it('should be able to forward a updateSentinelRegistrationByStaking request', async () => {
      const stakeAmount = ethers.parseEther('200000')
      const duration = EPOCH_DURATION * 13
      const signature = await getSentinelIdentity(pntHolder1.address, { actor: sentinel1, registrationManager })

      const userData = encode(
        ['address[]', 'bytes[]'],
        [
          [await pToken.getAddress(), await registrationManager.getAddress()],
          [
            pToken.interface.encodeFunctionData('approve', [await registrationManager.getAddress(), stakeAmount]),
            registrationManager.interface.encodeFunctionData('updateSentinelRegistrationByStaking', [
              pntHolder1.address,
              stakeAmount,
              duration,
              signature,
              0
            ])
          ]
        ]
      )

      await pnt.connect(pntHolder1).approve(await forwarderNative.getAddress(), stakeAmount)
      await forwarderNative
        .connect(pntHolder1)
        .call(stakeAmount, await forwarderHost.getAddress(), userData, PNETWORK_NETWORK_IDS.gnosisMainnet)

      // NOTE: at this point let's suppose that a pNetwork node processes the pegin...

      const metadata = encodeMetadata(ethers, {
        userData: getUserDataGeneratedByForwarder(userData, pntHolder1.address),
        sourceNetworkId: PNETWORK_NETWORK_IDS.ethereumMainnet,
        senderAddress: await forwarderNative.getAddress(),
        destinationNetworkId: PNETWORK_NETWORK_IDS.gnosisMainnet,
        receiverAddress: await forwarderHost.getAddress()
      })

      await expect(pToken.connect(pnetwork).mint(await forwarderHost.getAddress(), stakeAmount, metadata, '0x'))
        .to.emit(registrationManager, 'SentinelRegistrationUpdated')
        .withArgs(pntHolder1.address, 1, 12, sentinel1.address, REGISTRATION_SENTINEL_STAKING, stakeAmount)
    })

    it('should be able to forward a updateSentinelRegistrationByBorrowing request after a lending one', async () => {
      // L E N D
      const lendAmount = ethers.parseEther('345678')
      const duration = EPOCH_DURATION * 15

      let userData = encode(
        ['address[]', 'bytes[]'],
        [
          [await pToken.getAddress(), await lendingManager.getAddress()],
          [
            pToken.interface.encodeFunctionData('approve', [await lendingManager.getAddress(), lendAmount]),
            lendingManager.interface.encodeFunctionData('lend', [pntHolder2.address, lendAmount, duration])
          ]
        ]
      )

      await pnt.connect(pntHolder2).approve(await forwarderNative.getAddress(), lendAmount)
      await forwarderNative
        .connect(pntHolder2)
        .call(lendAmount, await forwarderHost.getAddress(), userData, PNETWORK_NETWORK_IDS.gnosisMainnet)

      let metadata = encodeMetadata(ethers, {
        userData: getUserDataGeneratedByForwarder(userData, pntHolder2.address),
        sourceNetworkId: PNETWORK_NETWORK_IDS.ethereumMainnet,
        senderAddress: await forwarderNative.getAddress(),
        destinationNetworkId: PNETWORK_NETWORK_IDS.gnosisMainnet,
        receiverAddress: await forwarderHost.getAddress()
      })

      await expect(pToken.connect(pnetwork).mint(await forwarderHost.getAddress(), lendAmount, metadata, '0x'))
        .to.emit(lendingManager, 'Lended')
        .withArgs(pntHolder2.address, 1, 14, lendAmount)

      // B O R R O W
      const numberOfEpochs = 12
      const signature = await getSentinelIdentity(pntHolder1.address, { actor: sentinel1, registrationManager })

      userData = encode(
        ['address[]', 'bytes[]'],
        [
          [await registrationManager.getAddress()],
          [
            registrationManager.interface.encodeFunctionData(
              'updateSentinelRegistrationByBorrowing(address,uint16,bytes,uint256)',
              [pntHolder1.address, numberOfEpochs, signature, 0]
            )
          ]
        ]
      )

      await forwarderNative
        .connect(pntHolder1)
        .call(0, await forwarderHost.getAddress(), userData, PNETWORK_NETWORK_IDS.gnosisMainnet)

      metadata = encodeMetadata(ethers, {
        userData: getUserDataGeneratedByForwarder(userData, pntHolder1.address),
        sourceNetworkId: PNETWORK_NETWORK_IDS.ethereumMainnet,
        senderAddress: await forwarderNative.getAddress(),
        destinationNetworkId: PNETWORK_NETWORK_IDS.gnosisMainnet,
        receiverAddress: await forwarderHost.getAddress()
      })

      await expect(pToken.connect(pnetwork).mint(await forwarderHost.getAddress(), 0, metadata, '0x'))
        .to.emit(registrationManager, 'SentinelRegistrationUpdated')
        .withArgs(
          pntHolder1.address,
          1,
          12,
          sentinel1.address,
          REGISTRATION_SENTINEL_BORROWING,
          BORROW_AMOUNT_FOR_SENTINEL_REGISTRATION
        )
    })

    it('should be able to forward an unstake request', async () => {
      // S T A K E
      const amount = ethers.parseEther('10000')
      const duration = ONE_DAY * 7

      let userData = encode(
        ['address[]', 'bytes[]'],
        [
          [await pToken.getAddress(), await stakingManager.getAddress()],
          [
            pToken.interface.encodeFunctionData('approve', [await stakingManager.getAddress(), amount]),
            stakingManager.interface.encodeFunctionData('stake', [pntHolder1.address, amount, duration])
          ]
        ]
      )

      await pnt.connect(pntHolder1).approve(await forwarderNative.getAddress(), amount)
      await forwarderNative
        .connect(pntHolder1)
        .call(amount, await forwarderHost.getAddress(), userData, PNETWORK_NETWORK_IDS.gnosisMainnet)

      let metadata = encodeMetadata(ethers, {
        userData: getUserDataGeneratedByForwarder(userData, pntHolder1.address),
        sourceNetworkId: PNETWORK_NETWORK_IDS.ethereumMainnet,
        senderAddress: await forwarderNative.getAddress(),
        destinationNetworkId: PNETWORK_NETWORK_IDS.gnosisMainnet,
        receiverAddress: await forwarderHost.getAddress()
      })
      await pToken.connect(pnetwork).mint(await forwarderHost.getAddress(), amount, metadata, '0x')

      // U N S T A K E (from Ethereum to Gnosis and tokens should come back to ethereum)
      await time.increase(duration + 1)

      userData = encode(
        ['address[]', 'bytes[]'],
        [
          [await stakingManager.getAddress()],
          [
            stakingManager.interface.encodeFunctionData('unstake(address,uint256,bytes4)', [
              pntHolder1.address,
              amount,
              PNETWORK_NETWORK_IDS.ethereumMainnet
            ])
          ]
        ]
      )

      await forwarderNative
        .connect(pntHolder1)
        .call(0, await forwarderHost.getAddress(), userData, PNETWORK_NETWORK_IDS.gnosisMainnet)

      metadata = encodeMetadata(ethers, {
        userData: getUserDataGeneratedByForwarder(userData, pntHolder1.address),
        sourceNetworkId: PNETWORK_NETWORK_IDS.ethereumMainnet,
        senderAddress: await forwarderNative.getAddress(),
        destinationNetworkId: PNETWORK_NETWORK_IDS.gnosisMainnet,
        receiverAddress: await forwarderHost.getAddress()
      })

      await expect(pToken.connect(pnetwork).mint(await forwarderHost.getAddress(), amount, metadata, '0x'))
        .to.emit(stakingManager, 'Unstaked')
        .withArgs(pntHolder1.address, amount)
    })

    it('should not be able to updateSentinelRegistrationByBorrowing for a third party', async () => {
      await expect(
        registrationManager['updateSentinelRegistrationByBorrowing(address,uint16,bytes,uint256)'](
          pntHolder2.address,
          2,
          '0x',
          0
        )
      ).to.be.revertedWithCustomError(registrationManager, 'InvalidForwarder')
    })

    it.skip('decode metadata', async () => {
      // secretlint-disable-next-line
      // https://polygonscan.com/tx/0x25c15710d27d2f7d342ee78ad20c9ce6f4ae9e6f127895b04bf4d67a256050cd
      const bytes =
        // secretlint-disable-next-line
        '0x02000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100ffffffff0000000000000000000000000000000000000000000000000000000000000000000000000000000054d5a0638f23f0b89053f86eed60237bbc56e98c0075dd4c00000000000000000000000000000000000000000000000000000000000000000000000000000000257a984836f4459954ce09955e3c00e8c5b1fb8900000000000000000000000000000000000000000000000000000000000003c000000000000000000000000000000000000000000000000000000000000003e000000000000000000000000000000000000000000000000000000000000002a00000000000000000000000000000000000000000000000000000000000000060000000000000000000000000728ee450b8c75699149dd297ed6ec4176d8df65e00000000000000000000000067071fc7f4cf8a0fd272d66a5d06fba850198f740000000000000000000000000000000000000000000000000000000000000220000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000002000000000000000000000000b6bcae6468760bc0cdfb9c8ef4ee75c9dd23e1ed0000000000000000000000001491733a4c3fa754e895fcd99acdeca0d33645c30000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000044095ea7b30000000000000000000000001491733a4c3fa754e895fcd99acdeca0d33645c30000000000000000000000000000000000000000000000af30bbc818391df0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000642b54f55100000000000000000000000067071fc7f4cf8a0fd272d66a5d06fba850198f740000000000000000000000000000000000000000000000af30bbc818391df0000000000000000000000000000000000000000000000000000000000000093a800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'
      decodeMetadata(ethers, bytes)
    })
  })
)
