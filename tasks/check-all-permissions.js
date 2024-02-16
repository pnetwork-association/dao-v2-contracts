const { task } = require('hardhat/config')

const CONFIG = require('./config')

const checkPermissions = async (_hre, _key, _val) => {
  if (_hre.ethers.isAddress(_val) && _val !== CONFIG.ZERO_ADDRESS) {
    console.info(`Checking ${_key} # ${_val}`)
    await _hre.run('permissions:check', { address: _val })
    console.info('\n')
  }
}

const main = async (_, _hre) => {
  for (const entry of Object.entries(CONFIG)) {
    await checkPermissions(_hre, entry[0], entry[1])
  }
}

task('permissions:check-all').setAction(main)
