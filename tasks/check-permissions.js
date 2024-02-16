const { task } = require('hardhat/config')

const ACLAbi = require('./abi/ACL.json')
const { ACL_ADDRESS, ZERO_ADDRESS } = require('./config')
const { getAllRoles } = require('./lib/roles')

const PARAM_CONTRACT_ADDRESS = 'address'

const checkPermission = async (_contract, _role) => {
  const count = await _contract.getRoleMemberCount(_role[1])
  for (let i = 0; i < count; i++) console.info(`${_role[0]}: ${await _contract.getRoleMember(_role[1], i)}`)
}

const checkAclPermission = async (_acl, _address, _role) => {
  const manager = await _acl.getPermissionManager(_address, _role[1])
  if (manager !== ZERO_ADDRESS) console.info(`${_role[0]} manager: ${manager}`)
}

const tryAccessControlEnumerableUpgradeable = async (_hre, _address, _roles) => {
  console.info('Trying AccessControlEnumerableUpgradeable')
  const contract = await _hre.ethers.getContractAt('AccessControlEnumerableUpgradeable', _address)
  await Promise.all(Object.entries(_roles).map((_role) => checkPermission(contract, _role)))
}

const tryACL = async (_hre, _address, _roles) => {
  console.info('Trying Aragon ACL')
  const aclContract = await _hre.ethers.getContractAt(ACLAbi, ACL_ADDRESS)
  await Promise.all(Object.entries(_roles).map((_role) => checkAclPermission(aclContract, _address, _role)))
}

const checkPermissions = async (_params, _hre) => {
  const roles = getAllRoles(_hre.ethers)
  try {
    await tryAccessControlEnumerableUpgradeable(_hre, _params[PARAM_CONTRACT_ADDRESS], roles)
  } catch (_err) {
    console.info('Failed with AccessControlEnumerableUpgradeable')
    await tryACL(_hre, _params[PARAM_CONTRACT_ADDRESS], roles)
  }
}

task('permissions:check').setAction(checkPermissions).addPositionalParam(PARAM_CONTRACT_ADDRESS)
