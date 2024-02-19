/* eslint-disable node/no-unpublished-require */
require('dotenv').config()
require('@nomicfoundation/hardhat-ethers')
require('@nomicfoundation/hardhat-verify')
require('@openzeppelin/hardhat-upgrades')
require('hardhat-gas-reporter')
require('@nomicfoundation/hardhat-chai-matchers')
require('hardhat-spdx-license-identifier')
require('hardhat-tracer')

require('./tasks/decode-forwarder-metadata.js')
require('./tasks/acl-assign-permission.js')
require('./tasks/deploy-dao.js')
require('./tasks/deploy_forwarder_bsc.js')
require('./tasks/deploy_forwarder_gnosis.js')
require('./tasks/deploy_forwarder_mainnet.js')
require('./tasks/deploy_forwarder_polygon.js')
require('./tasks/set_permissions.js')
require('./tasks/upgrade.js')

const { execSync } = require('child_process')

const getEnvironmentVariable = (_envVar) => process.env[_envVar]

const decodeGpgFile = (_file) =>
  execSync(`gpg --decrypt -q ${_file}`, {
    encoding: 'utf-8'
  }).trim()

const maybeGetAccountsFromGpgFile = (_file) => {
  if (!_file) return undefined
  try {
    const _key = decodeGpgFile(_file)
    return [_key]
  } catch (_err) {
    return undefined
  }
}

const accounts = maybeGetAccountsFromGpgFile(getEnvironmentVariable('PK'))
/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    version: '0.8.17',
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        details: {
          yul: true
        }
      }
    }
  },
  networks: {
    hardhat: {
      chainId: 100,
      forking: {
        url: getEnvironmentVariable('GNOSIS_NODE'),
        blockNumber: parseInt(getEnvironmentVariable('BLOCK_NUMBER')),
        accounts
      }
    },
    local: {
      url: 'http://localhost:8545'
    },
    mainnet: {
      url: getEnvironmentVariable('MAINNET_NODE'),
      accounts,
      gasPrice: 20e9
    },
    polygon: {
      url: getEnvironmentVariable('POLYGON_NODE'),
      accounts,
      gasPrice: 250e9
    },
    gnosis: {
      url: getEnvironmentVariable('GNOSIS_NODE'),
      accounts,
      gasPrice: 15e9,
      gas: 5e6
    },
    bsc: {
      url: getEnvironmentVariable('BSC_NODE'),
      accounts,
      gasPrice: 5e9
    }
  },
  etherscan: {
    apiKey: {
      mainnet: getEnvironmentVariable('ETHERSCAN_API_KEY'),
      polygon: getEnvironmentVariable('POLYGONSCAN_API_KEY'),
      gnosis: getEnvironmentVariable('GNOSISSCAN_API_KEY')
    },
    customChains: [
      {
        network: 'polygon',
        chainId: 137,
        urls: {
          apiURL: 'https://api.polygonscan.com/api',
          browserURL: 'https://polygonscan.com'
        }
      }
    ]
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
