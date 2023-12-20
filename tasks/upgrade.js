const { task } = require('hardhat/config')

const upgrade = async (_args, _hre) => {
    const factory = await _hre.ethers.getContractFactory(_args.factory)
    const address = _args.address
    console.info('factory', factory)
    console.info('address', address)
    await _hre.upgrades.upgradeProxy(address, factory)
}

task('upgrade:proxy', 'Upgrade proxy').setAction(upgrade).addPositionalParam('factory', 'Contract name').addPositionalParam('address', 'Proxy address')