const { task, types } = require('hardhat/config')

const { ACL_ADDRESS } = require('../lib/constants')

task('acl-assign-permission', 'Assing an ACL permission')
  .addParam('entity', 'The entity receiving the permission', undefined, types.string, true)
  .addParam('app', 'The app on which the permission is granted', undefined, types.string, true)
  .addParam('role', 'The role', undefined, types.string, true)
  .setAction(async (_taskArgs, _hre) => {
    const { ethers } = _hre
    const { entity, app, role } = _taskArgs
    const ACL = await ethers.getContractFactory('ACL')
    const acl = await ACL.attach(ACL_ADDRESS)
    await acl.revokePermission(entity, app, ethers.keccak256(ethers.toUtf8Bytes(role)))
    console.log('Permission succesfully assigned!')
  })
