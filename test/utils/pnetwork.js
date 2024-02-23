const ERC777_MINT_WITH_DATA_GAS_LIMIT = 1e6

module.exports.mintPToken = (_ptoken, _minter, _recipient, _value, _metadata, _operatorData = '0x') =>
  _ptoken
    .connect(_minter)
    .mint(_recipient, _value, _metadata, _operatorData, { gasLimit: ERC777_MINT_WITH_DATA_GAS_LIMIT })
