const R = require('ramda')

module.exports.sendEth = async (_hre, _from, _to, _eth, _opts = {}) => {
  if (R.isNil(_eth)) return Promise.reject(new Error('Unspecified amount:', _eth))

  const value = R.type(_eth) === 'String' ? _hre.ethers.parseEther(_eth) : _eth
  const balance = await _from.getBalance()

  if (value.gt(balance))
    return Promise.reject(new Error(`Failed: insufficient balance ${_hre.ethers.formatEther(balance)}`))

  return _from.sendTransaction({ ..._opts, to: _to, value })
}
