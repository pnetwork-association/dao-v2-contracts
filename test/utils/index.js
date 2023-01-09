const { ethers } = require('hardhat')

module.exports.getRole = (_message) => ethers.utils.keccak256(ethers.utils.toUtf8Bytes(_message))

module.exports.getSentinelIdentity = async (_ownerAddress, { sentinel }) => {
  const messageHash = ethers.utils.solidityKeccak256(['address'], [_ownerAddress])
  return sentinel.signMessage(ethers.utils.arrayify(messageHash))
}
