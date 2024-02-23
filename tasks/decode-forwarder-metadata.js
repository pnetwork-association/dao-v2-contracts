const { task, types } = require('hardhat/config')

const { decodeMetadata } = require('../lib/metadata')

task('utils:decode-forwarder-metadata', 'Decode the pNetwork Forwarder Metadata')
  .addPositionalParam('metadata', 'The pNetwork Metadata', undefined, types.string, false)
  .setAction(async (_taskArgs, { ethers }) => {
    const { metadata } = _taskArgs

    const abiCoder = ethers.AbiCoder.defaultAbiCoder()
    const {
      version,
      userData,
      sourceNetworkId,
      senderAddress,
      destinationNetworkId,
      receiverAddress,
      protocolOptions,
      protocolReceipt
    } = decodeMetadata(ethers, metadata)

    const [callsAndTargets, originAddress, callerAddress] = abiCoder.decode(['bytes', 'address', 'address'], userData)

    console.log({
      version,
      userData: {
        callsAndTargets,
        originAddress,
        callerAddress
      },
      sourceNetworkId,
      senderAddress,
      destinationNetworkId,
      receiverAddress,
      protocolOptions,
      protocolReceipt
    })
  })
