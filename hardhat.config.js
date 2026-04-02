require("@nomicfoundation/hardhat-ethers");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.18",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      mining: {
        auto: true,
      },
      gasPrice: 20000000000, // 20 Gwei (as in paper)
      // High limits to allow large on-chain tree construction in view calls
      blockGasLimit: 300_000_000_000,
      allowUnlimitedContractSize: true,
      accounts: {
        count: 10,
      },
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC || 'https://ethereum-sepolia-rpc.publicnode.com',
      chainId: 11155111,
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      gasPrice: 'auto',
    },
    arbitrumSepolia: {
      url: process.env.ARBITRUM_SEPOLIA_RPC || 'https://sepolia-rollup.arbitrum.io/rpc',
      chainId: 421614,
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      gasPrice: 'auto',
    },
  },
};
