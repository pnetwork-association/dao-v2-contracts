// Refs: https://github.com/pnetwork-association/ptokens-core/blob/master/common/metadata/src/metadata_encoders.rs#L24-L49
const METADATA_TYPES = [
  'bytes1', // version
  'bytes', // userData
  'bytes4', // sourceNetworkId
  'address', // senderAddress
  'bytes4', // destinationNetworkId
  'address', // receiverAddress
  'bytes', // protocolOptions
  'bytes' // protocolReceipt
]

module.exports.decodeMetadata = (_ethers, _metadata) => {
  const [
    version,
    userData,
    sourceNetworkId,
    senderAddress,
    destinationNetworkId,
    receiverAddress,
    protocolOptions,
    protocolReceipt
  ] = _ethers.AbiCoder.defaultAbiCoder().decode(METADATA_TYPES, _metadata)
  return {
    version,
    userData,
    sourceNetworkId,
    senderAddress,
    destinationNetworkId,
    receiverAddress,
    protocolOptions,
    protocolReceipt
  }
}

module.exports.encodeMetadata = (
  _ethers,
  {
    version = '0x02',
    userData,
    sourceNetworkId,
    senderAddress,
    destinationNetworkId,
    receiverAddress,
    protocolOptions = '0x',
    protocolReceipt = '0x'
  }
) =>
  _ethers.AbiCoder.defaultAbiCoder().encode(METADATA_TYPES, [
    version,
    userData,
    sourceNetworkId,
    senderAddress,
    destinationNetworkId,
    receiverAddress,
    protocolOptions,
    protocolReceipt
  ])
