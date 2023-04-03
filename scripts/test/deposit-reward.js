const { ethers } = require('hardhat')

const BORROWING_MANAGER_ADDRESS = ''
const TOKEN = ''

const main = async () => {
  const LendingManager = await ethers.getContractFactory('LendingManager')
  const lendingManager = await LendingManager.attach(BORROWING_MANAGER_ADDRESS)
  await lendingManager.depositReward(TOKEN, 2, '2000000000000000000000', {
    gasLimit: 300000
  })
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
