const { task } = require('hardhat/config')

const ACLAbi = require('./abi/ACL.json')
const { ACL_ADDRESS, ZERO_ADDRESS } = require('./config')
const { getAllRoles } = require('./lib/roles')

const PARAM_CONTRACT_ADDRESS = 'address'
const FIRST_BLOCK = 31195110
// secretlint-disable-next-line
const SET_PERMISSION_TOPIC = '0x759b9a74d5354b5801710a0c1b283cc9f0d32b607ac8ced10c83ac8e75c77d52'

const checkPermission = async (_contract, _role) => {
  const count = await _contract.getRoleMemberCount(_role[1])
  for (let i = 0; i < count; i++)
    console.info(`${_role[0]} (${_role[1]}): ${await _contract.getRoleMember(_role[1], i)}`)
}

const checkAclPermission = async (_ethers, _acl, _address, _role) => {
  const manager = await _acl.getPermissionManager(_address, _role[1])
  if (manager !== ZERO_ADDRESS) console.info(`${_role[0]} manager: ${manager}`)
  const logs = await _ethers.provider.getLogs({
    address: await _acl.getAddress(),
    topics: [SET_PERMISSION_TOPIC, null, _ethers.zeroPadValue(_address, 32), _ethers.zeroPadValue(_role[1], 32)],
    fromBlock: FIRST_BLOCK
  })
  await Promise.all(
    logs.map(async (_log) => {
      if (await _acl.hasPermission(_ethers.dataSlice(_log.topics[1], 12), _address, _role[1]))
        console.info(`${_role[0]} (${_role[1]}): ${_ethers.dataSlice(_log.topics[1], 12)}`)
    })
  )
}

const tryCheckOwner = async (_hre, _address) => {
  const contract = await _hre.ethers.getContractAt('Ownable', _address)
  try {
    const owner = await contract.owner()
    console.info('Owner', owner)
  } finally {
    // no op
  }
}

const tryAccessControlEnumerableUpgradeable = async (_hre, _address, _roles) => {
  console.info('Trying AccessControlEnumerableUpgradeable')
  const contract = await _hre.ethers.getContractAt('AccessControlEnumerableUpgradeable', _address)
  await Promise.all(Object.entries(_roles).map((_role) => checkPermission(contract, _role)))
}

const tryACL = async (_hre, _address, _roles) => {
  console.info('Trying Aragon ACL')
  const aclContract = await _hre.ethers.getContractAt(ACLAbi, ACL_ADDRESS)
  await Promise.all(
    Object.entries(_roles).map((_role) => checkAclPermission(_hre.ethers, aclContract, _address, _role))
  )
}

const checkPermissions = async (_params, _hre) => {
  const roles = getAllRoles(_hre.ethers)
  try {
    await tryAccessControlEnumerableUpgradeable(_hre, _params[PARAM_CONTRACT_ADDRESS], roles)
  } catch (_err) {
    console.info('Failed with AccessControlEnumerableUpgradeable')
    await tryACL(_hre, _params[PARAM_CONTRACT_ADDRESS], roles)
  }
  await tryCheckOwner(_hre, _params[PARAM_CONTRACT_ADDRESS])
}

task('permissions:check').setAction(checkPermissions).addPositionalParam(PARAM_CONTRACT_ADDRESS)
