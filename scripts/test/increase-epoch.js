const { ethers } = require('hardhat')

const EPOCH_DURATION = 60 * 60 * 24 * 15

const main = async () => {
  await ethers.provider.send('evm_increaseTime', [EPOCH_DURATION])
  await ethers.provider.send('evm_mine')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
