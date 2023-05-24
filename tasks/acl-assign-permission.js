const { ACL_ADDRESS } = require('../scripts/config')

task('acl-assign-permission', 'Assing an ACL permission')
  .addParam('entity', 'The entity receiving the permission', undefined, types.string, true)
  .addParam('app', 'The app on which the permission is granted', undefined, types.string, true)
  .addParam('role', 'The role', undefined, types.string, true)
  .setAction(async (_taskArgs, _hre) => {
    const { ethers } = _hre
    const { entity, app, role } = _taskArgs
    const ACL = await ethers.getContractFactory('ACL')
    const acl = await ACL.attach(ACL_ADDRESS)
    await acl.revokePermission(entity, app, ethers.utils.keccak256(ethers.utils.toUtf8Bytes(role)))
    console.log('Permission succesfully assigned!')
  })
