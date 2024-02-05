const { ethers } = require('hardhat')
const { MerkleTree } = require('merkletreejs')

module.exports.getRole = (_message) => ethers.keccak256(ethers.toUtf8Bytes(_message))

module.exports.getSentinelIdentity = async (_ownerAddress, { actor, registrationManager }) => {
  const signatureNonce = await registrationManager.getSignatureNonceByOwner(_ownerAddress)
  const messageHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [_ownerAddress, signatureNonce])
  )
  return actor.signMessage(ethers.getBytes(messageHash))
}

const encode = (...params) => new ethers.AbiCoder().encode(...params)
module.exports.encode = encode

module.exports.truncateWithPrecision = (_value, _precision = 0) =>
  ethers.parseUnits(ethers.formatUnits(_value, 18), _precision)

module.exports.getUserDataGeneratedByForwarder = (_userData, _caller) =>
  encode(['bytes', 'address'], [_userData, _caller])

module.exports.getActorsMerkleProof = (_actors, _actor) => {
  const leaves = _actors.map(({ address }) => ethers.solidityPackedKeccak256(['address'], [address]))
  const merkleTree = new MerkleTree(leaves, ethers.keccak256, { sortPairs: true })
  return merkleTree.getHexProof(ethers.solidityPackedKeccak256(['address'], [_actor.address]))
}
