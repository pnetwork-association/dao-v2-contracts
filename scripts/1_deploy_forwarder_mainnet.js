const { ethers } = require('hardhat')
const { PNT_ON_ETH_ADDRESS, ERC20_VAULT } = require('./config')

const main = async () => {
  const Forwarder = await ethers.getContractFactory('Forwarder')
  console.log('Deploying forwarder on Ethereum ...')
  const forwarder = await Forwarder.deploy(PNT_ON_ETH_ADDRESS, ERC20_VAULT, ERC20_VAULT)
  console.log('Forwarder deployed at', forwarder.address)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
