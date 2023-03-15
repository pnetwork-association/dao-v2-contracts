const { getSafeSingletonDeployment } = require('@gnosis.pm/safe-deployments')
const { calculateSafeTransactionHash, executeTx, safeSignMessage, buildSafeTransaction } = require('@gnosis.pm/safe-contracts')

const contractInstance = async (_hre, deployment, _address) => {
  if (!deployment) throw Error('No deployment provided')
  // TODO: use network
  const contractAddress = _address || deployment.defaultAddress
  return await _hre.ethers.getContractAt(deployment.abi, contractAddress)
}

module.exports.safeSingleton = async (_hre, _address) => contractInstance(_hre, getSafeSingletonDeployment({ released: undefined }), _address)

module.exports.calcSafeTxHash = async (_safe, _tx, _chainId, _onChainOnly) => {
  const onChainHash = await _safe.getTransactionHash(
    _tx.to,
    _tx.value,
    _tx.data,
    _tx.operation,
    _tx.safeTxGas,
    _tx.baseGas,
    _tx.gasPrice,
    _tx.gasToken,
    _tx.refundReceiver,
    _tx.nonce
  )
  if (_onChainOnly) return onChainHash
  const offChainHash = calculateSafeTransactionHash(_safe, _tx, _chainId)
  if (onChainHash != offChainHash) throw Error('Unexpected hash!')
  return offChainHash
}

module.exports.signAndExecuteSafe = async ({ data, to }, _safe, _signer) => {
  const nonce = await _safe.nonce()
  if (!ethers.utils.isHexString(data)) throw Error(`Invalid hex string provided for data: ${data}`)
  const tx = buildSafeTransaction({
    to,
    value: '0',
    data,
    nonce: nonce.toString(),
    operation: 0,
    //gasPrice: 6e9,
    safeTxGas: 1000000,
    baseGas: 1000000
  })
  const chainId = (await _safe.provider.getNetwork()).chainId
  const signature = await safeSignMessage(_signer, _safe, tx, chainId)
  return executeTx(_safe, tx, [signature])
}
