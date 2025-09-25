require('dotenv').config();
require('@nomicfoundation/hardhat-toolbox');

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: '0.8.19',
    settings: { optimizer: { enabled: true, runs: 200 } }
  },
  networks: {
    hardhat: {},
    localhost: { url: process.env.PROVIDER_URL || 'http://127.0.0.1:8545' },
    mocachain: {
      url: process.env.MOCA_RPC || '',
      chainId: 222888,
      accounts: process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : []
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC || '',
      accounts: process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : []
    }
  }
};


