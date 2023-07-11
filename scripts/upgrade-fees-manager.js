const { ethers, upgrades } = require('hardhat')

const FEES_MANAGER = '0xE2261C279FE39CEA798Cd96b72ccB150bc164310'

const main = async () => {
  const FeesManager = await ethers.getContractFactory('FeesManager')
  console.info('Upgrading FeesManager...')
  await upgrades.upgradeProxy(FEES_MANAGER, FeesManager)
  console.info('FeesManager upgraded!')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })