const { ethers } = require('hardhat')
const { PNT_ON_GNOSIS_ADDRESS, ZERO_ADDRESS } = require('./config')

const main = async () => {
  const Forwarder = await ethers.getContractFactory('Forwarder')
  console.log('Deploying forwarder on Gnosis ...')
  const forwarder = await Forwarder.deploy(PNT_ON_GNOSIS_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS)
  console.log('Forwarder deployed at', forwarder.address)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
