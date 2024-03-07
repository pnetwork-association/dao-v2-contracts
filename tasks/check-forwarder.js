const { task } = require('hardhat/config')

const { ADDRESSES: _ADDRESSES } = require('../lib/constants')

const main = async (_args, _hre) => {
  if (!(_hre.network.name.toUpperCase() in _ADDRESSES)) {
    console.warn('No addresses!')
    return
  }
  const ADDRESSES = _ADDRESSES[_hre.network.name.toUpperCase()]
  for (const entry of Object.entries(ADDRESSES)) {
    console.log(`Checking ${entry[0]} @ ${entry[1]}`)
    const c = await _hre.ethers.getContractAt(['function forwarder() view returns(address)'], entry[1])
    try {
      console.log('Forwarder', await c.forwarder())
    } catch (_) {
      console.log('No forwarder')
    }
  }
}

task('permissions:check-forwarder').setAction(main)
