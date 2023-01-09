require('dotenv').config()
require('@nomiclabs/hardhat-ethers')
require('@nomiclabs/hardhat-etherscan')
require('@openzeppelin/hardhat-upgrades')
require('hardhat-gas-reporter')
require('@nomicfoundation/hardhat-chai-matchers')
require('hardhat-spdx-license-identifier')

const getEnvironmentVariable = (_envVar) => process.env[_envVar]

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    version: '0.8.17',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {
      forking: {
        url: `${getEnvironmentVariable('ETH_MAINNET_NODE')}`,
        accounts: [getEnvironmentVariable('PK')]
      }
    },
    local: {
      url: 'http://localhost:8545'
    }
    /*polygon: {
      url: getEnvironmentVariable('POLYGON_MAINNET_NODE'),
      accounts: [getEnvironmentVariable('POLYGON_MAINNET_PRIVATE_KEY')],
      gasPrice: 7e9,
      gas: 200e9,
    },*/
  },
  etherscan: {
    apiKey: getEnvironmentVariable('ETHERSCAN_API_KEY')
  },
  gasReporter: {
    enabled: true
  },
  spdxLicenseIdentifier: {
    overwrite: false,
    runOnCompile: false
  },
  mocha: {
    timeout: 100000000
  }
}
