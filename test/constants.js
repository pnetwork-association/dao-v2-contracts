const constants = {
  ACL_ADDRESS: '0xFDcae423E5e92B76FE7D1e2bcabd36fca8a6a8Fe',
  BORROW_AMOUNT_FOR_SENTINEL_REGISTRATION: '200000000000000000000000',
  DANDELION_VOTING_ADDRESS: '0x2211bFD97b1c02aE8Ac305d206e9780ba7D8BfF4',
  DAO_PNT_ADDRESS: '0xe824F81cD136BB7a28480baF8d7E5f0E8E4B693E',
  DAO_ROOT_ADDRESS: '0x6Ae14ff8d24F719a8cf5A9FAa2Ad05dA7e44C8b6',
  EPOCH_DURATION: 1314001,
  ERC20_VAULT: '0xe396757EC7E6aC7C8E5ABE7285dde47b98F22db8',
  INFINITE: '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  LEND_MAX_EPOCHS: 24,
  MIN_LOCK_DURATION: 604800,
  MINIMUM_BORROWING_FEE: 0.3 * 10 ** 6,
  // 30%
  ONE_DAY: 86400,
  PBTC_ADDRESS: '0x62199B909FB8B8cf870f97BEf2cE6783493c4908',
  PNETWORK_ADDRESS: '0x341aA660fD5c280F5a9501E3822bB4a98E816D1b',
  PNETWORK_CHAIN_IDS: {
    ethereumMainnet: '0x005fe7f9',
    interim: '0xffffffff',
    polygonMainnet: '0x0075dd4c'
  },
  PNT_ADDRESS: '0x89Ab32156e46F46D02ade3FEcbe5Fc4243B9AAeD',
  PNT_HOLDER_1_ADDRESS: '0xaeaa8c6ebb17db8056fa30a08fd3097de555f571',
  PNT_HOLDER_2_ADDRESS: '0xae0baf66e8f5bb87a6fd54066e469cdfe93212ec',
  PNT_MAX_TOTAL_SUPPLY: '96775228000000000000000000', // 96,775,228 milions
  REGISTRATION_NULL: '0x00',
  REGISTRATION_SENTINEL_BORROWING: '0x02',
  REGISTRATION_SENTINEL_STAKING: '0x01',
  REGISTRATON_GUARDIAN: '0x03',
  TOKEN_MANAGER_ADDRESS: '0xD7E8E79d318eCE001B39D83Ea891ebD5fC22d254',
  ZERO_ADDRESS: '0x0000000000000000000000000000000000000000'
}
module.exports = constants
