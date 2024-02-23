module.exports = {
  ADDRESSES: {
    ZERO_ADDRESS: '0x0000000000000000000000000000000000000000',
    GNOSIS: {
      ACL_ADDRESS: '0x50b2b8e429cB51bD43cD3E690e5BEB9eb674f6d7',
      DANDELION_VOTING_ADDRESS: '0x0cf759bcCfEf5f322af58ADaE2D28885658B5e02',
      STAKING_MANAGER: '0xdEE8ebE2b7152ECCd935fd67134BF1bad55302BC',
      STAKING_MANAGER_LM: '0x74107f07765A918890c7a0E9d420Dc587539aD42',
      STAKING_MANAGER_RM: '0x9ce64A5c880153CD15C097C8D90c39cB073aE945',
      EPOCHS_MANAGER: '0xFDD7d2f23F771F05C6CEbFc9f9bC2A771FAE302e',
      LENDING_MANAGER: '0xEf3A54f764F58848e66BaDc427542b44C44b5553',
      REGISTRATION_MANAGER: '0x08342a325630bE00F55A7Bc5dD64D342B1D3d23D',
      FEES_MANAGER: '0x053b3d59F06601dF87D9EdD24CB2a81FAE93405f',
      REWARDS_MANAGER: '0x2ec44F9F31a55b52b3c1fF98647E38d63f829fb7',
      SAFE_ADDRESS: '0xfE8BCE5b156D9bCD28b5373CDC6b4F08B4b9646a',
      FINANCE_VAULT: '0x6239968e6231164687CB40f8389d933dD7f7e0A5',
      FINANCE: '0x3d749Bc0eb27795Da58d2f67a2D6527A95567aEC',
      FORWARDER_ON_GNOSIS: '0x49157Ddc1cA1907AC7b1f6e871Aa90e93567aDa4',
      PNT_ON_GNOSIS_ADDRESS: '0x0259461eed4d76d4f0f900f9035f6c4dfb39159a',
      DAOPNT_ON_GNOSIS_ADDRESS: '0xFF8Ce5Aca26251Cc3f31e597291c71794C06092a',
      TOKEN_MANAGER_ADDRESS: '0xCec0058735D50de98d3715792569921FEb9EfDC1'
    },
    POLYGON: {
      PNT_ON_POLYGON_ADDRESS: '0xb6bcae6468760bc0cdfb9c8ef4ee75c9dd23e1ed',
      FORWARDER_ON_POLYGON: '0xC85cd78555DF9991245F15c7AA6c4eDBb7791c19'
    },
    BSC: {
      PNT_ON_BSC_ADDRESS: '0xdaacB0Ab6Fb34d24E8a67BfA14BF4D95D4C7aF92',
      FORWARDER_ON_BSC: '0x0000000000000000000000000000000000000000'
    },
    MAINNET: {
      PNT_ON_ETH_ADDRESS: '0x89Ab32156e46F46D02ade3FEcbe5Fc4243B9AAeD',
      ETHPNT_ADDRESS: '0xf4ea6b892853413bd9d9f1a5d3a620a0ba39c5b2',
      FORWARDER_ON_MAINNET: '0x0000000000000000000000000000000000000000',
      ERC20_VAULT: '0xe396757EC7E6aC7C8E5ABE7285dde47b98F22db8',
      DANDELION_VOTING_ADDRESS: '0x2211bfd97b1c02ae8ac305d206e9780ba7d8bff4',
      ACL_ADDRESS: '0xFDcae423E5e92B76FE7D1e2bcabd36fca8a6a8Fe',
      PNETWORK_ADDRESS: '0x341aA660fD5c280F5a9501E3822bB4a98E816D1b',
      ASSOCIATION_ON_ETH_ADDRESS: '0xf1f6568a76559d85cF68E6597fA587544184dD46'
    }
  },
  VOTE_STATUS: {
    ABSENT: 0,
    YES: 1,
    NO: 2
  },
  REGISTRATION_TYPE: {
    REGISTRATION_NULL: '0x00',
    REGISTRATION_SENTINEL_BORROWING: '0x02',
    REGISTRATION_SENTINEL_STAKING: '0x01',
    REGISTRATON_GUARDIAN: '0x03'
  },
  PNETWORK_NETWORK_IDS: {
    MAINNET: '0x005fe7f9',
    INTERIM: '0xffffffff',
    POLYGON: '0x0075dd4c',
    GNOSIS: '0x00f1918e'
  },
  MISC: {
    BORROW_AMOUNT_FOR_SENTINEL_REGISTRATION: '200000000000000000000000',
    LEND_MAX_EPOCHS: 24,
    MINIMUM_BORROWING_FEE: 0.3 * 10 ** 6, // 30%
    MIN_LOCK_DURATION: 604800,
    PNT_MAX_TOTAL_SUPPLY: '96775228000000000000000000', // 96,775,228 milions
    START_FIRST_EPOCH_TIMESTAMP: 1701331199,
    EPOCH_DURATION: 60 * 60 * 24 * 30,
    ONE_HOUR_IN_S: 3600,
    ONE_DAY: 86400,
    ONE_MONTH: 86400 * 30,
    INFINITE: '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
  }
}