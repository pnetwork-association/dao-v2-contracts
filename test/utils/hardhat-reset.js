module.exports.hardhatReset = (_provider, _url, _pinnedBlockNumber) =>
  _provider.request({
    method: 'hardhat_reset',
    params: [
      {
        forking: {
          jsonRpcUrl: _url,
          blockNumber: _pinnedBlockNumber
        }
      }
    ]
  })
