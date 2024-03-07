// Refs: https://github.com/pnetwork-association/ptokens-core/blob/master/common/metadata/src/metadata_encoders.rs#L53-L81
const METADATA_V3_TYPES = [
  'bytes1', // version
  'bytes', // userData
  'bytes4', // sourceNetworkId
  'string', // senderAddress
  'bytes4', // destinationNetworkId
  'string', // receiverAddress
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
  ] = _ethers.AbiCoder.defaultAbiCoder().decode(METADATA_V3_TYPES, _metadata)
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
    userData,
    sourceNetworkId,
    senderAddress,
    destinationNetworkId,
    receiverAddress,
    protocolOptions = '0x',
    protocolReceipt = '0x'
  }
) =>
  _ethers.AbiCoder.defaultAbiCoder().encode(METADATA_V3_TYPES, [
    '0x03',
    userData,
    sourceNetworkId,
    senderAddress.toLowerCase(),
    destinationNetworkId,
    receiverAddress.toLowerCase(),
    protocolOptions,
    protocolReceipt
  ])
