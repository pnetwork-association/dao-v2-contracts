const { ethers } = require('hardhat')
const { MerkleTree } = require('merkletreejs')

module.exports.getRole = (_message) => ethers.utils.keccak256(ethers.utils.toUtf8Bytes(_message))

module.exports.getSentinelIdentity = async (_ownerAddress, { actor, registrationManager }) => {
  const signatureNonce = await registrationManager.getSignatureNonceByOwner(_ownerAddress)
  const messageHash = ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(['address', 'uint256'], [_ownerAddress, signatureNonce])
  )
  return actor.signMessage(ethers.utils.arrayify(messageHash))
}

const encode = (...params) => new ethers.utils.AbiCoder().encode(...params)
module.exports.encode = encode

module.exports.truncateWithPrecision = (_value, _precision = 0) =>
  ethers.utils.parseUnits(ethers.utils.formatUnits(_value, 18), _precision)

module.exports.getUserDataGeneratedByForwarder = (_userData, _caller) =>
  encode(['bytes', 'address'], [_userData, _caller])

module.exports.getActorsMerkleProof = (_actors, _actor) => {
  const leaves = _actors.map(({ address }) => ethers.utils.solidityKeccak256(['address'], [address]))
  const merkleTree = new MerkleTree(leaves, ethers.utils.keccak256, { sortPairs: true })
  return merkleTree.getHexProof(ethers.utils.solidityKeccak256(['address'], [_actor.address]))
}
