const hre = require('hardhat')
const { expect } = require("chai")
const { sendEth } = require('../utils/send-eth')
const { getRole } = require('../utils')
const { mineUpTo } = require('@nomicfoundation/hardhat-network-helpers')

// roles
const CREATE_VOTES_ROLE = getRole('CREATE_VOTES_ROLE')
const MINT_ROLE = getRole('MINT_ROLE')
const UPDATE_GUARDIAN_REGISTRATION_ROLE = getRole('UPDATE_GUARDIAN_REGISTRATION_ROLE')

// addresses
const ACL_CONTRACT = '0x50b2b8e429cB51bD43cD3E690e5BEB9eb674f6d7'
const DAO_CREATOR = '0x08544a580EDC2C3F27689b740F8257A29166FC77'
const DAO_OWNER = '0x45b5828721453352e7ffd92b8106ca67d0595a26'

const PNT_ON_GNOSIS = '0x0259461eeD4D76D4F0f900f9035f6c4dfB39159A'
const DAO_PNT = '0xFF8Ce5Aca26251Cc3f31e597291c71794C06092a'
const DAO_V3_VOTING_CONTRACT = '0x0cf759bcCfEf5f322af58ADaE2D28885658B5e02' // gnosis
const DAO_V3_REGISTRATION_MANAGER = '0x08342a325630bE00F55A7Bc5dD64D342B1D3d23D'
const DAO_V1_TREASURY_CONTRACT = '0xDd92eb1478D3189707aB7F4a5aCE3a615cdD0476' // gnosis
const TOKEN_HOLDERS_ADDRESSES = [
    '0xc4442915B1FB44972eE4D8404cE05a8D2A1248dA',
    '0xe8b43e7d55337ab735f6e1932d4a1e98de70eabc',
    '0x9ad4550759389ca7f0488037daa4332b1f30cdac',
    '0x100a70b9e50e91367d571332e76cfa70e9307059',
]
const PNT_ON_GNOSIS_MINTER = '0x53d51f8801f40657ca566a1ae25b27eada97413c'
const DAO_V3_STAKING_MANAGER = '0xdEE8ebE2b7152ECCd935fd67134BF1bad55302BC'
const DAO_V3_STAKING_MANAGER_LM = '0x74107f07765A918890c7a0E9d420Dc587539aD42'
const DAO_V3_STAKING_MANAGER_RM = '0x9ce64A5c880153CD15C097C8D90c39cB073aE945'
const DAO_V3_LENDING_MANAGER = '0xEf3A54f764F58848e66BaDc427542b44C44b5553'
const TOKEN_CONTROLLER = '0xCec0058735D50de98d3715792569921FEb9EfDC1'

const USER_ADDRESS = '0xdDb5f4535123DAa5aE343c24006F4075aBAF5F7B'

const AclAbi = require('../abi/ACL.json')
const DaoPntAbi = require('../abi/daoPNT.json')
const VaultAbi = require('../abi/Vault.json').abi
const DandelionVotingAbi = require('../abi/DandelionVoting.json')
const PNTonGnosisAbi = require('../abi/PNTonGnosis.json')



const getBytes = _hexString =>
    Buffer.from(_hexString.slice(2), 'hex')

describe("", () => {
    let faucet,
        acl,
        daoVoting,
        tokenHolders,
        user,
        daoCreator,
        daoOwner,
        pntOnGnosis,
        pntMinter,
        StakingManager,
        stakingManager,
        stakingManagerLm,
        stakingManagerRm,
        LendingManager,
        lendingManager,
        daoPNT,
        registrationManager,
        RegistrationManager

    const missingSteps = async () => {
        await setPermission(stakingManager.address, TOKEN_CONTROLLER, MINT_ROLE)
        await setPermission(stakingManagerLm.address, TOKEN_CONTROLLER, MINT_ROLE)
        await setPermission(stakingManagerRm.address, TOKEN_CONTROLLER, MINT_ROLE)
        await registrationManager.connect(daoOwner).grantRole(UPDATE_GUARDIAN_REGISTRATION_ROLE, DAO_V3_VOTING_CONTRACT)
    }

    before(async () => {
        //   const rpc = hre.config.networks.mainnetFork.url
        //   const blockToForkFrom = 18968470 // before the upgrade
        //   await hardhatReset(hre, rpc, blockToForkFrom)

        faucet = await hre.ethers.getSigner()
        tokenHolders = await Promise.all(TOKEN_HOLDERS_ADDRESSES.map(hre.ethers.getImpersonatedSigner))
        user = await hre.ethers.getImpersonatedSigner(USER_ADDRESS)
        daoCreator = await hre.ethers.getImpersonatedSigner(DAO_CREATOR)
        daoOwner = await hre.ethers.getImpersonatedSigner(DAO_OWNER)
        pntMinter = await hre.ethers.getImpersonatedSigner(PNT_ON_GNOSIS_MINTER)

        acl = await hre.ethers.getContractAt(AclAbi, ACL_CONTRACT)
        daoVoting = await hre.ethers.getContractAt(DandelionVotingAbi, DAO_V3_VOTING_CONTRACT)
        daoTreasury = await hre.ethers.getContractAt(VaultAbi, DAO_V1_TREASURY_CONTRACT)
        pntOnGnosis = await hre.ethers.getContractAt(PNTonGnosisAbi, PNT_ON_GNOSIS)
        daoPNT = await hre.ethers.getContractAt(DaoPntAbi, DAO_PNT)
        StakingManager = await hre.ethers.getContractFactory('StakingManager')
        stakingManager = StakingManager.attach(DAO_V3_STAKING_MANAGER)
        stakingManagerLm = StakingManager.attach(DAO_V3_STAKING_MANAGER_LM)
        stakingManagerRm = StakingManager.attach(DAO_V3_STAKING_MANAGER_RM)
        RegistrationManager = await hre.ethers.getContractFactory('RegistrationManager')
        registrationManager = RegistrationManager.attach(DAO_V3_REGISTRATION_MANAGER)
        LendingManager = await hre.ethers.getContractFactory('LendingManager')
        lendingManager = LendingManager.attach(DAO_V3_LENDING_MANAGER)

        expect(await acl.hasInitialized()).to.be.eq(true)
        expect(await daoVoting.duration()).to.be.eq(259200)

        await missingSteps()

        await Promise.all(tokenHolders.map(_holder => sendEth(hre, faucet, _holder.address, '5')))
        await Promise.all(tokenHolders.map(_holder => mintPntOnGnosis(_holder.address, 10000)))
        await Promise.all(tokenHolders.map(_holder => stake(_holder, 5000)))
    })

    const openNewVoteAndReachQuorum = async (_voteId, _executionScript, _metadata) => {
        const supports = true
        const voteCreator = tokenHolders[0]
        const executionScriptBytes = getBytes(_executionScript)

        await grantCreateVotesPermission(voteCreator.address)
        daoVoting = daoVoting.connect(voteCreator)

        await expect(daoVoting.newVote(executionScriptBytes, _metadata, supports))
            .to.emit(daoVoting, 'StartVote')
            .withArgs(_voteId, voteCreator.address, _metadata)

        for (let tokenHolder of tokenHolders) {
            if (tokenHolder === voteCreator) {
                await expect(daoVoting.vote(_voteId, supports))
                    .to.be.revertedWith('DANDELION_VOTING_CAN_NOT_VOTE')
            } else {
                await expect(daoVoting.connect(tokenHolder).vote(_voteId, supports))
                    .to.emit(daoVoting, 'CastVote')
            }
        }

        const vote = await daoVoting.getVote(_voteId)
        const executionBlock = vote[3]
        await mineUpTo(executionBlock.add(1))
    }

    const hasPermission = (who, where, what) =>
        acl['hasPermission(address,address,bytes32)'](who, where, what)

    const setPermission = async (entity, app, role) =>
        acl.connect(daoCreator).grantPermission(entity, app, role)

    const grantCreateVotesPermission = async (_who) => {
        let hasPerm = await hasPermission(_who, DAO_V3_VOTING_CONTRACT, CREATE_VOTES_ROLE)
        expect(hasPerm).to.be.false
        await setPermission(_who, DAO_V3_VOTING_CONTRACT, CREATE_VOTES_ROLE)
        hasPerm = await hasPermission(_who, DAO_V3_VOTING_CONTRACT, CREATE_VOTES_ROLE)
        expect(hasPerm).to.be.true
    }

    const mintPntOnGnosis = async (receiver, amount) => {
        const balance = await pntOnGnosis.balanceOf(receiver)
        await pntOnGnosis.connect(pntMinter)['mint(address,uint256)'](receiver, amount)
        expect(await pntOnGnosis.balanceOf(receiver)).to.be.eq(balance + amount)
    }

    const stake = async (pntOwner, amount, duration = 604800) => {
        await pntOnGnosis.connect(pntOwner).approve(DAO_V3_STAKING_MANAGER, amount)
        await stakingManager.connect(pntOwner).stake(pntOwner.address, amount, duration)
    }

    const encodeUpdateGuardianRegistrationFunctionData = (owner, duration, guardian) =>
        registrationManager.interface.encodeFunctionData('updateGuardianRegistration', [owner, duration, guardian])


    const encodeFunctionCall = (_to, _calldata) => {
        console.info('_to', _to)
        console.info('_calldata', _calldata)
        return [
            {
                to: _to,
                calldata: _calldata
            },
        ]
    }

    const createExecutorId = (id) => `0x${String(id).padStart(8, '0')}`

    const encodeCallScript = (actions, specId = 1) => {
        return actions.reduce((script, { to, calldata }) => {
            const encoder = new hre.ethers.utils.AbiCoder()
            const addr = encoder.encode(['address'], [to])
            const length = encoder.encode(['uint256'], [(calldata.length - 2) / 2])
            // Remove 12 first 0s of padding for addr and 28 0s for uint32
            return script + addr.slice(26) + length.slice(58) + calldata.slice(2)
        }, createExecutorId(specId))
    }

    it("it should open a vote for registering a guardian and execute it", async () => {
        const voteId = 1
        const metadata = 'Should we register a new guardian?'
        const executionScript = encodeCallScript(
            encodeFunctionCall(
                DAO_V3_REGISTRATION_MANAGER,
                encodeUpdateGuardianRegistrationFunctionData(faucet.address, 10, faucet.address)
            )
        )
        let currentBlock = await hre.ethers.provider.getBlockNumber()
        expect(await daoPNT.totalSupplyAt(currentBlock)).to.be.eq(20000)
        await mintPntOnGnosis(faucet.address, 10000)
        await stake(faucet, 10000)
        currentBlock = await hre.ethers.provider.getBlockNumber()
        expect(await daoPNT.totalSupplyAt(currentBlock)).to.be.eq(30000)

        await openNewVoteAndReachQuorum(voteId, executionScript, metadata)
        await expect(daoVoting.executeVote(voteId)).to.emit(daoVoting, 'ExecuteVote')
            .withArgs(voteId)
            .and.to.emit(registrationManager, 'GuardianRegistrationUpdated')
    })

    it("should lend PNTs and register a borrowing sentinel", async () => {
        const amount = hre.ethers.utils.parseEther('200000', await pntOnGnosis.decimals())
        await mintPntOnGnosis(faucet.address, hre.ethers.utils.parseEther('400000', await pntOnGnosis.decimals()))
        await pntOnGnosis.connect(faucet).approve(DAO_V3_LENDING_MANAGER, amount)
        const balancePre = await pntOnGnosis.balanceOf(faucet.address)
        await expect(lendingManager.lend(faucet.address, amount, 86400 * 90)).to.emit(lendingManager, 'Lended').withArgs(faucet.address, 2, 3, amount)
            .and.to.emit(stakingManagerLm, 'Staked').withArgs(faucet.address, amount, 86400 * 90)
        const balancePost = await pntOnGnosis.balanceOf(faucet.address)
        expect(balancePre.sub(amount)).to.be.eq(balancePost)

        const sentinel = hre.ethers.Wallet.createRandom()
        const signature = await sentinel.signMessage('test')
        expect(await registrationManager.connect(user)['updateSentinelRegistrationByBorrowing(uint16,bytes,uint256)'](1, signature, 0)).to.emit(registrationManager, 'SentinelRegistrationUpdated').withArgs('0xdDb5f4535123DAa5aE343c24006F4075aBAF5F7B', 2, 2, '0xB48299F9704a2A268a09f5d47F56e662624E882f', 2, 200000000000000000000000)
    })

    it.only("should register a staking sentinel", async () => {
        const amount = hre.ethers.utils.parseEther('200000', await pntOnGnosis.decimals())
        await mintPntOnGnosis(user.address, hre.ethers.utils.parseEther('400000', await pntOnGnosis.decimals()))
        const sentinel = hre.ethers.Wallet.createRandom()
        const signature = await sentinel.signMessage('test')
        await pntOnGnosis.connect(user).approve(DAO_V3_REGISTRATION_MANAGER, amount)
        expect(await registrationManager.connect(user).updateSentinelRegistrationByStaking(user.address, amount, 86400 * 30, signature, 0)).to.emit(registrationManager, 'SentinelRegistrationUpdated').withArgs('0xdDb5f4535123DAa5aE343c24006F4075aBAF5F7B', 2, 2, '0xB48299F9704a2A268a09f5d47F56e662624E882f', 2, 200000000000000000000000)
    })
})