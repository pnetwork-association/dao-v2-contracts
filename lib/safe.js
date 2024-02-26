const { LedgerSigner } = require('@ethersproject/hardware-wallets')
const SafeApiKit = require('@safe-global/api-kit').default
const Safe = require('@safe-global/protocol-kit').default
const { EthersAdapter } = require('@safe-global/protocol-kit')

module.exports.proposeTransactionToSafe = async (_adapter, _safeAddress, _to, _value, _data) => {
  const safe = await Safe.create({ ethAdapter: _adapter, safeAddress: _safeAddress })
  const safeTransactionData = {
    to: _to,
    value: _value,
    data: _data
  }
  const safeTransaction = await safe.createTransaction({ transactions: [safeTransactionData] })
  const safeTxHash = await safe.getTransactionHash(safeTransaction)
  const senderSignature = await safe.signHash(safeTxHash)
  const safeService = new SafeApiKit({ chainId: await _adapter.getChainId() })
  await safeService.proposeTransaction({
    safeAddress: _safeAddress,
    safeTransactionData: safeTransaction.data,
    safeTxHash,
    senderAddress: await _adapter.getSignerAddress(),
    senderSignature: senderSignature.data
  })
}

module.exports.getAdapter = async (_ethers, _ledger = false) => {
  const signer = _ledger ? new LedgerSigner(_ethers.provider) : await _ethers.provider.getSigner()
  return new EthersAdapter({
    ethers: _ethers,
    signerOrProvider: signer
  })
}
