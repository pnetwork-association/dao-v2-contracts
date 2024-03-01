const { task } = require('hardhat/config')

const ACLAbi = require('../lib/abi/ACL.json')
const {
  ADDRESSES,
  TASKS: { PARAM_ADDRESS, PARAM_DESC_ADDRESS }
} = require('../lib/constants')
const { getAllRoles } = require('../lib/roles')

const FIRST_BLOCK = {
  GNOSIS: 31195110,
  MAINNET: 10565704
}
// secretlint-disable-next-line
const SET_PERMISSION_TOPIC = '0x759b9a74d5354b5801710a0c1b283cc9f0d32b607ac8ced10c83ac8e75c77d52'

const checkPermission = async (_contract, _role) => {
  const count = await _contract.getRoleMemberCount(_role[1])
  for (let i = 0; i < count; i++)
    console.info(`${_role[0]} (${_role[1]}): ${await _contract.getRoleMember(_role[1], i)}`)
}

const checkAclPermission = async (_ethers, _acl, _address, _role, _fromBlock) => {
  const manager = await _acl.getPermissionManager(_address, _role[1])
  if (manager !== _ethers.ZeroAddress) console.info(`${_role[0]} manager: ${manager}`)
  const logs = await _ethers.provider.getLogs({
    address: _acl.target,
    topics: [SET_PERMISSION_TOPIC, null, _ethers.zeroPadValue(_address, 32), _ethers.zeroPadValue(_role[1], 32)],
    fromBlock: _fromBlock
  })
  await Promise.all(
    logs.map(async (_log) => {
      if (await _acl.hasPermission(_ethers.dataSlice(_log.topics[1], 12), _address, _role[1]))
        console.info(`${_role[0]} (${_role[1]}): ${_ethers.dataSlice(_log.topics[1], 12)}`)
    })
  )
}

const main = async (_params, { ethers, network }) => {
  const roles = getAllRoles(ethers)

  const tryAccessControlEnumerableUpgradeable = async (_address, _roles) => {
    console.info('Trying AccessControlEnumerableUpgradeable')
    const contract = await ethers.getContractAt('AccessControlEnumerableUpgradeable', _address)
    await Promise.all(Object.entries(_roles).map((_role) => checkPermission(contract, _role)))
  }

  const tryACL = async (_address, _roles) => {
    console.info('Trying Aragon ACL')
    const aclAddress = ADDRESSES[network.name.toUpperCase()].ACL
    if (aclAddress === undefined) {
      console.warn('Missing ACL address')
      return
    }
    const fromBlock = FIRST_BLOCK[network.name.toUpperCase()]
    const aclContract = await ethers.getContractAt(ACLAbi, aclAddress)
    await Promise.all(
      Object.entries(_roles).map((_role) => checkAclPermission(ethers, aclContract, _address, _role, fromBlock))
    )
  }

  const tryCheckOwner = async (_address) => {
    const contract = await ethers.getContractAt('Ownable', _address)
    try {
      const owner = await contract.owner()
      console.info('Owner', owner)
    } catch (_) {
      // no op
    }
  }

  try {
    await tryAccessControlEnumerableUpgradeable(_params[PARAM_ADDRESS], roles)
  } catch (_err) {
    console.info('Failed with AccessControlEnumerableUpgradeable')
    await tryACL(_params[PARAM_ADDRESS], roles)
  }
  await tryCheckOwner(_params[PARAM_ADDRESS])
}

task('permissions:check', 'Check permissions for a contract')
  .setAction(main)
  .addPositionalParam(PARAM_ADDRESS, PARAM_DESC_ADDRESS)
