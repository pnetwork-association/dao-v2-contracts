const ERC777_MINT_WITH_DATA_GAS_LIMIT = 1e6
const ERC777_MINT_WITH_NO_DATA_GAS_LIMIT = 180000
const ERC20_VAULT_PEGOUT_WITH_USER_DATA_GAS_LIMIT = 1e6 // 1e6
const ERC20_VAULT_PEGOUT_WITHOUT_USER_DATA_GAS_LIMIT = 250000

module.exports.mintPToken = (_ptoken, _minter, _recipientAddress, _value, _metadata = '0x', _operatorData = '0x') =>
  _ptoken.connect(_minter).mint(_recipientAddress, _value, _metadata, _operatorData, {
    gasLimit: _metadata === '0x' ? ERC777_MINT_WITH_NO_DATA_GAS_LIMIT : ERC777_MINT_WITH_DATA_GAS_LIMIT
  })

module.exports.pegoutToken = (_vault, _manager, _recipientAddress, _tokenAddress, _value, _metadata = '0x') =>
  _vault.connect(_manager).pegOut(_recipientAddress, _tokenAddress, _value, _metadata, {
    gasLimit:
      _metadata === '0x' ? ERC20_VAULT_PEGOUT_WITHOUT_USER_DATA_GAS_LIMIT : ERC20_VAULT_PEGOUT_WITH_USER_DATA_GAS_LIMIT
  })
