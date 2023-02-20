const { ethers } = require('hardhat')

module.exports.getRole = (_message) => ethers.utils.keccak256(ethers.utils.toUtf8Bytes(_message))

module.exports.getSentinelIdentity = async (_ownerAddress, { sentinel }) => {
  const messageHash = ethers.utils.solidityKeccak256(['address'], [_ownerAddress])
  return sentinel.signMessage(ethers.utils.arrayify(messageHash))
}

module.exports.encode = (...params) => new ethers.utils.AbiCoder().encode(...params)

module.exports.truncateWithPrecision = (_value, _precision = 0) => ethers.utils.parseUnits(ethers.utils.formatUnits(_value, 18), _precision)
