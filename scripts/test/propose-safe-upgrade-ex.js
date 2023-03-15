const { ethers, upgrades } = require('hardhat')
const { safeSingleton, signAndExecuteSafe } = require('../utils/safe')
const TransparentUpgradeableProxy = require('@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol/TransparentUpgradeableProxy.json')

const GNOSIS_SAFE_ADDRESS = '0x1bf6dACB3Df3ac4F0C93356caaE257D09FC8E4c6'
const TEST_PROXY = '0xe3bfd89B359954F766970BEe1CC1b95EF5CCebf0'

const main = async () => {
  const signer = await ethers.getSigner()

  const Test = await ethers.getContractFactory('Test')
  const test = await upgrades.deployProxy(Test, [], {
    initializer: 'initialize',
    kind: 'uups'
  })

  const TestV2 = await ethers.getContractFactory('TestV2')
  // no need to deploy a contract using safe since the contract become active only if the upgrade will be accepted by the safe multisig
  const safe = await safeSingleton(hre, GNOSIS_SAFE_ADDRESS)
  const testv2 = await upgrades.deployImplementation(TestV2)
  const TransparentUpgradeableProxyFactory = await ethers.getContractFactory(
    TransparentUpgradeableProxy.abi,
    TransparentUpgradeableProxy.bytecode,
    signer
  )
  const proxy = TransparentUpgradeableProxyFactory.attach(TEST_PROXY)
  await signAndExecuteSafe({ to: proxy.address, data: proxy.interface.encodeFunctionData('upgradeTo', [testv2]) }, safe, signer)

  console.log(await test.version())
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
