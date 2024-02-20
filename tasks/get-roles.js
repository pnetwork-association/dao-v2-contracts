const { task } = require('hardhat/config')

const { getAllRoles } = require('./lib/roles')

const main = (_, _hre) => {
  console.log(getAllRoles(_hre.ethers))
}

task('get-roles').setAction(main)
