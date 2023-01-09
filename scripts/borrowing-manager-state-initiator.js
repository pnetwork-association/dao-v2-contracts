const { ethers } = require('hardhat')
const inquirer = require('inquirer')
const { readFile } = require('./utils/file')

const STAKING_MANAGER_ADDRESS = ''

const main = async () => {
  const { filename } = await inquirer.prompt([
    {
      type: 'input',
      name: 'filename',
      message: 'Enter the daoPNT csv file name ...'
    }
  ])
  /*const { address } = await inquirer.prompt([
    {
      type: 'input',
      name: 'address',
      message: 'Enter the BorrowingManager address ...',
    },
  ])*/
  const rows = await readFile(filename)
  const addresses = rows.map(([_address]) => _address)
  const amounts = rows.map(([, _amount]) => _amount)
  const borrowingManager = await ethers.getContractAt('BorrowingManager', address)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
