const { task } = require('hardhat/config')

const { ADDRESSES } = require('../lib/constants')

const checkPermissions = async (_hre, _key, _val) => {
  if (_hre.ethers.isAddress(_val)) {
    console.info(`Checking ${_key} # ${_val}`)
    await _hre.run('permissions:check', { address: _val })
    console.info('\n')
  }
}

const main = async (_, _hre) => {
  for (const entry of Object.entries(ADDRESSES[_hre.network.name.toUpperCase()])) {
    await checkPermissions(_hre, entry[0], entry[1])
  }
}

task('permissions:check-all', 'Check permissions for all contracts').setAction(main)
