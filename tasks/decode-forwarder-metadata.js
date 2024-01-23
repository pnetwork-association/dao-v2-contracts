const { task, types } = require('hardhat/config')

task('decode-forwarder-metadata', 'Decode the pNetwork Forwarder Metadata')
  .addParam('metadata', 'The pNetwork Metadata', undefined, types.string, true)
  .setAction(async (_taskArgs, _hre) => {
    const { ethers } = _hre
    const { metadata } = _taskArgs

    const abiCoder = new ethers.utils.AbiCoder()
    const [
      version,
      userData,
      sourceNetworkId,
      senderAddress,
      destinationNetworkId,
      receiverAddress,
      protocolOptions,
      protocolReceipt
    ] = abiCoder.decode(['bytes1', 'bytes', 'bytes4', 'address', 'bytes4', 'address', 'bytes', 'bytes'], metadata)

    const [callsAndTargets, originAddress, callerAddress] = abiCoder.decode(['bytes', 'address', 'address'], userData)
    // const [targets, data] = abiCoder.decode(['address[]', 'bytes[]'], callsAndTargets)

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
