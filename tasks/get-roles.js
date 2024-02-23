const { task } = require('hardhat/config')

const { getAllRoles } = require('../lib/roles')

const main = (_, _hre) => {
  console.log(getAllRoles(_hre.ethers))
}

task('utils:get-roles', 'Get roles and their hash').setAction(main)
