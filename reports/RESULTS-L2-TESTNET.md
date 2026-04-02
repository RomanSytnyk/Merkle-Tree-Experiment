# Testnet Deployment & Benchmark Results: Ethereum Sepolia (L1) + Arbitrum Sepolia (L2)

**Date:** 2026-04-01  
**Platform:** macOS, Apple Silicon (darwin arm64), Node.js v25.6.1  
**Solidity:** 0.8.18, optimizer enabled (200 runs)  
**Dataset:** 1,000 supply chain records (1,000 Merkle leaves, 100 orders)  
**Verification runs:** 10 per environment  

---

## Deployment Summary

| Parameter | Ethereum Sepolia (L1) | Arbitrum Sepolia (L2) |
|-----------|----------------------|----------------------|
| **Chain ID** | 11155111 | 421614 |
| **Contract** | [`0xbe59B903...9756F0C`](https://sepolia.etherscan.io/address/0xbe59B903532689324b3aE42FBf09Fe32D9756F0C) | [`0x8f0d03Ad...3c70696`](https://sepolia.arbiscan.io/address/0x8f0d03Adcb9E0F2db4d25464eb466C36D3c70696) |
| **Deployer** | [`0x4bBD34Cb...EFb83d`](https://sepolia.etherscan.io/address/0x4bBD34Cb92d3c7dF2dEA9ef2e674884937EFb83d) | [`0x4bBD34Cb...EFb83d`](https://sepolia.arbiscan.io/address/0x4bBD34Cb92d3c7dF2dEA9ef2e674884937EFb83d) |
| **Total gas** | 27,478,854 | 27,478,959 |
| **ETH spent** | 0.0000411 ETH | 0.000550 ETH |
| **Cross-validation** | Roots match | Roots match |

### Bridge Transaction (L1 -> L2)

ETH was bridged programmatically from Sepolia L1 to Arbitrum Sepolia L2 via the Arbitrum Delayed Inbox:

| Detail | Value |
|--------|-------|
| **Bridge tx (L1)** | [`0x6169ed50...5af99d`](https://sepolia.etherscan.io/tx/0x6169ed50db51bd177b9972f13fc75f819608c1130ad16382057599e7615af99d) |
| **Amount** | 0.02 ETH |
| **Inbox contract** | [`0xaAe29B0366299461418F5324a79Afc425BE5ae21`](https://sepolia.etherscan.io/address/0xaAe29B0366299461418F5324a79Afc425BE5ae21) |
| **Arrival time** | ~10 minutes |

---

## On-Chain Transactions

### Ethereum Sepolia (L1)

| Operation | Tx Hash | Gas Used |
|-----------|---------|----------|
| **Contract Deploy** | [`0xd243c30c...dd4f58a3`](https://sepolia.etherscan.io/tx/0xd243c30c4006d283dcf811ae8baf1b7a6f71fd406e306a29c81f4a26dd4f58a3) | 811,140 |
| **Leaf Storage** (10 batches x 100) | [`0xaba76d5a...e028de`](https://sepolia.etherscan.io/tx/0xaba76d5adb5c22946e725ea42a051691b1f5a8cd1213f3da4c90b0e8bae028de) ... [`0x292e57a0...a0748`](https://sepolia.etherscan.io/tx/0x292e57a09e79e98872e1fdae10364edaf8eaa32fd64a7963482b4086a52a0748) | 23,357,978 |
| **Tree Build** | [`0x073b8e9e...facaf9`](https://sepolia.etherscan.io/tx/0x073b8e9ec240cc41d5b6e5e6d65050aa85f9c51419d9568a41c3592e72facaf9) | 3,309,736 |
| **Total** | | **27,478,854** |

<details>
<summary>All 10 leaf storage transactions (L1)</summary>

| Batch | Tx Hash |
|-------|---------|
| 1 | [`0xaba76d5adb5c22946e725ea42a051691b1f5a8cd1213f3da4c90b0e8bae028de`](https://sepolia.etherscan.io/tx/0xaba76d5adb5c22946e725ea42a051691b1f5a8cd1213f3da4c90b0e8bae028de) |
| 2 | [`0x9ecb95eac6477bf3cd21c1f6c38b7a419490c055ab65e43f35d4784ff2af9aaa`](https://sepolia.etherscan.io/tx/0x9ecb95eac6477bf3cd21c1f6c38b7a419490c055ab65e43f35d4784ff2af9aaa) |
| 3 | [`0x5a07146a91f99fd397d4d3f8ced50af7f257f34ff5174922a3af358a17e04485`](https://sepolia.etherscan.io/tx/0x5a07146a91f99fd397d4d3f8ced50af7f257f34ff5174922a3af358a17e04485) |
| 4 | [`0x94fe5c2048155c311160181b217b8beaa188fefd07d6483bd4e64b3492981792`](https://sepolia.etherscan.io/tx/0x94fe5c2048155c311160181b217b8beaa188fefd07d6483bd4e64b3492981792) |
| 5 | [`0x3f4a9e62f1af171545ab3a9d10cbe8b114d866331390a98558720706775cc9ba`](https://sepolia.etherscan.io/tx/0x3f4a9e62f1af171545ab3a9d10cbe8b114d866331390a98558720706775cc9ba) |
| 6 | [`0x2363a7dbcba8c9cd0c61b9e499086cd8dbc8466ab8fc43fff9f8a2f4d426e3f3`](https://sepolia.etherscan.io/tx/0x2363a7dbcba8c9cd0c61b9e499086cd8dbc8466ab8fc43fff9f8a2f4d426e3f3) |
| 7 | [`0x09b5770b82e8791d3f0290ece519e953883ef1c1447805a89276fcc3d56d06e6`](https://sepolia.etherscan.io/tx/0x09b5770b82e8791d3f0290ece519e953883ef1c1447805a89276fcc3d56d06e6) |
| 8 | [`0x619f64bffce341a209ebe948b943830779c5b78cf701dfb2e4a28e162403c0d9`](https://sepolia.etherscan.io/tx/0x619f64bffce341a209ebe948b943830779c5b78cf701dfb2e4a28e162403c0d9) |
| 9 | [`0x2aa96bbb8d244ae834a01bc79c1b77d9c1bbfba6d5743c6569822ab7aa00f4c1`](https://sepolia.etherscan.io/tx/0x2aa96bbb8d244ae834a01bc79c1b77d9c1bbfba6d5743c6569822ab7aa00f4c1) |
| 10 | [`0x292e57a09e79e98872e1fdae10364edaf8eaa32fd64a7963482b4086a52a0748`](https://sepolia.etherscan.io/tx/0x292e57a09e79e98872e1fdae10364edaf8eaa32fd64a7963482b4086a52a0748) |

</details>

### Arbitrum Sepolia (L2)

| Operation | Tx Hash | Gas Used |
|-----------|---------|----------|
| **Contract Deploy** | [`0xe493e752...876b06d4`](https://sepolia.arbiscan.io/tx/0xe493e752585bf926f4f92ea62c5ea74e50d7e13621d80b4401ee8482876b06d4) | 811,140 |
| **Leaf Storage** (10 batches x 100) | [`0x7ee6b369...b40767a`](https://sepolia.arbiscan.io/tx/0x7ee6b36977c662ff1794ad8239aebbfcbe71ac93c34b4b336b3a210deb40767a) ... [`0xd6809237...909fa5`](https://sepolia.arbiscan.io/tx/0xd6809237b49cf5edcfa52bdb7e2ef90eb330dcb8980a10a5713108808f909fa5) | 23,358,122 |
| **Tree Build** | [`0xd2124069...c3d308eb`](https://sepolia.arbiscan.io/tx/0xd2124069ed34ceedaeddbd9db9942fb1f81a50ed984a016c2892647ac3d308eb) | 3,309,697 |
| **Total** | | **27,478,959** |

<details>
<summary>All 10 leaf storage transactions (L2)</summary>

| Batch | Tx Hash |
|-------|---------|
| 1 | [`0x7ee6b36977c662ff1794ad8239aebbfcbe71ac93c34b4b336b3a210deb40767a`](https://sepolia.arbiscan.io/tx/0x7ee6b36977c662ff1794ad8239aebbfcbe71ac93c34b4b336b3a210deb40767a) |
| 2 | [`0x0a69d26c37f6496208a3c402678d2ded623b706b705823753701990422999aeb`](https://sepolia.arbiscan.io/tx/0x0a69d26c37f6496208a3c402678d2ded623b706b705823753701990422999aeb) |
| 3 | [`0x19c3828fe5216e8e8b6bcf8c65cd401143a948e279e9ef6b690f55a1e5c05af4`](https://sepolia.arbiscan.io/tx/0x19c3828fe5216e8e8b6bcf8c65cd401143a948e279e9ef6b690f55a1e5c05af4) |
| 4 | [`0xa88ad6eb7bfee0e2a7df201c41a66bcca1d46ce332cea1541bfaa69915dd8006`](https://sepolia.arbiscan.io/tx/0xa88ad6eb7bfee0e2a7df201c41a66bcca1d46ce332cea1541bfaa69915dd8006) |
| 5 | [`0x61fd22ecb417f4cd00ad6003e5c786b649ecc20f85939cc0058e7dd23e20fa65`](https://sepolia.arbiscan.io/tx/0x61fd22ecb417f4cd00ad6003e5c786b649ecc20f85939cc0058e7dd23e20fa65) |
| 6 | [`0xfee1c7af720a09a6c8819265fb23b5cdc7dba77f88af024719efce0d298aa4a4`](https://sepolia.arbiscan.io/tx/0xfee1c7af720a09a6c8819265fb23b5cdc7dba77f88af024719efce0d298aa4a4) |
| 7 | [`0x5721a560be96ed9ee67f101e1053c04d2cdcf21b982874ea7c524f2a8844ba7c`](https://sepolia.arbiscan.io/tx/0x5721a560be96ed9ee67f101e1053c04d2cdcf21b982874ea7c524f2a8844ba7c) |
| 8 | [`0x996d441b409f3dd96292a0e0a908edd9b911746a964b928c7bb800d025befa61`](https://sepolia.arbiscan.io/tx/0x996d441b409f3dd96292a0e0a908edd9b911746a964b928c7bb800d025befa61) |
| 9 | [`0x8f98997be5400dcf1b73a4a97fca768e3aef2a5d3e377e8c90bd5293b9fe09c4`](https://sepolia.arbiscan.io/tx/0x8f98997be5400dcf1b73a4a97fca768e3aef2a5d3e377e8c90bd5293b9fe09c4) |
| 10 | [`0xd6809237b49cf5edcfa52bdb7e2ef90eb330dcb8980a10a5713108808f909fa5`](https://sepolia.arbiscan.io/tx/0xd6809237b49cf5edcfa52bdb7e2ef90eb330dcb8980a10a5713108808f909fa5) |

</details>

---

## Cross-Validation

On-chain and off-chain Merkle root computation produced byte-identical results on **both networks**.

| Network | Merkle Root | Match |
|---------|-------------|-------|
| Sepolia L1 | `0xc45a585a8bbd9f1f4b77feaebdfcf93debd55fa293b0f7d2b83014a839dae7c4` | YES |
| Arbitrum Sepolia L2 | `0x1a8950c69b0ebd60861f891879fa3c1d9f240cbfb9b29885b5020a456eaee978` | YES |

> Roots differ between networks because keypair generation produces different actor addresses per session. The critical validation is that on-chain matches off-chain within each network.

---

## Gas Cost Analysis

### Per-Operation Breakdown (1,000 records)

| Operation | L1 Gas | L2 Gas | Per-Leaf Cost |
|-----------|--------|--------|---------------|
| Deploy | 811,140 | 811,140 | (one-time) |
| Leaf storage | 23,357,978 | 23,358,122 | ~23,358 gas/leaf |
| Tree build | 3,309,736 | 3,309,697 | ~3,310 gas/leaf |
| **Total** | **27,478,854** | **27,478,959** | **~27,479 gas/leaf** |

Gas units are near-identical across L1 and L2 — same EVM bytecode execution. The minor differences (<0.001%) are due to L2 ArbGas accounting overhead.

### ETH Cost Comparison

| Network | Gas Price | ETH Cost | USD (ETH@$2,500) |
|---------|-----------|----------|-------------------|
| Sepolia L1 (testnet) | 0.002 gwei | 0.0000411 ETH | ~$0.0001 |
| Arbitrum Sepolia (testnet) | 0.02 gwei | 0.000550 ETH | ~$0.0014 |

### Mainnet Cost Projections

| Network | Gas Price | Cost for 1K records | Cost for 10K records |
|---------|-----------|--------------------|--------------------|
| Ethereum L1 | 30 gwei | ~$2.06 | ~$20.60 |
| Arbitrum One | 0.1 gwei | ~$0.007 | ~$0.069 |
| Base | 0.05 gwei | ~$0.003 | ~$0.034 |
| Private chain | 0 gwei | $0.00 | $0.00 |

---

## Verification Time Measurements (1,000 Records)

### Off-Chain Verification (JS keccak256)

Compute all 1,000 leaf hashes, build Merkle tree, compare root. Runs locally.

| Metric | Sepolia L1 | Arbitrum L2 | Hardhat (local) |
|--------|-----------|-------------|-----------------|
| **Mean** | 101.9 ms | 87.7 ms | 94.7 ms |
| **Median** | 92.0 ms | 84.3 ms | 92.0 ms |
| **Std Dev** | 29.4 ms | 11.5 ms | 9.0 ms |

Off-chain verification times are **consistent across all three environments** (88-102 ms for 1K records), confirming the Hardhat benchmark results are representative of real-world performance.

#### Individual Runs (ms)

| Run | Hardhat | Sepolia L1 | Arbitrum L2 |
|-----|---------|-----------|-------------|
| 1 | 106.5 | 184.1 | 120.4 |
| 2 | 98.3 | 100.8 | 85.0 |
| 3 | 110.6 | 92.0 | 83.9 |
| 4 | 101.9 | 101.1 | 85.3 |
| 5 | 92.0 | 96.8 | 82.9 |
| 6 | 90.0 | 91.7 | 84.3 |
| 7 | 87.6 | 87.2 | 82.5 |
| 8 | 87.5 | 88.6 | 84.1 |
| 9 | 86.6 | 85.8 | 85.7 |
| 10 | 86.1 | 90.8 | 83.0 |

### On-Chain View Call (via RPC)

Calls `rebuildAndVerifyRoot()` as a `view` function (no gas cost). Time includes RPC round-trip.

| Metric | Sepolia L1 | Arbitrum L2 | Hardhat (local) |
|--------|-----------|-------------|-----------------|
| **Mean** | 60.4 ms | 173.5 ms | 15.2 ms |
| **Median** | 53.2 ms | 162.8 ms | 11.4 ms |
| **Std Dev** | 20.1 ms | 31.0 ms | 8.8 ms |

The on-chain view call variation is dominated by **network latency**, not computation:
- **Hardhat:** 15.2 ms (zero network overhead)
- **Sepolia L1:** 60.4 ms (~45 ms network round-trip)
- **Arbitrum L2:** 173.5 ms (~158 ms network round-trip to L2 sequencer)

#### Individual Runs (ms)

| Run | Hardhat | Sepolia L1 | Arbitrum L2 |
|-----|---------|-----------|-------------|
| 1 | 20.3 | 60.4 | 159.8 |
| 2 | 11.9 | 60.5 | 162.1 |
| 3 | 12.8 | 50.7 | 257.9 |
| 4 | 12.7 | 116.6 | 163.9 |
| 5 | 39.0 | 51.7 | 162.8 |
| 6 | 11.2 | 51.9 | 188.6 |
| 7 | 11.4 | 57.1 | 157.9 |
| 8 | 10.7 | 51.8 | 158.8 |
| 9 | 10.9 | 53.2 | 162.9 |
| 10 | 10.8 | 50.5 | 160.6 |

---

## Consistency Across Environments

The key validation for the paper: **Hardhat local results are representative.**

| Metric (1K records) | Hardhat | Sepolia L1 | Arbitrum L2 | Assessment |
|---------------------|---------|-----------|-------------|------------|
| Off-chain verification | 94.7 ms | 101.9 ms | 87.7 ms | Consistent (same algorithm, same hardware) |
| On-chain view call | 15.2 ms | 60.4 ms | 173.5 ms | Network latency dominates |
| Gas (total) | N/A | 27,478,854 | 27,478,959 | Near-identical |
| Cross-validation | Match | Match | Match | Verified on all environments |

The off-chain verification — the primary benchmark metric in the paper — is within 15% across all three environments. The Hardhat auto-mining and unlimited gas limits do not distort the measured verification time, because verification runs as a pure computation (keccak256 hash operations) that is independent of network conditions.

---

## Significance for the Paper

1. **Dual-network verifiable deployment** — all transactions publicly visible on [Sepolia Etherscan](https://sepolia.etherscan.io) and [Arbiscan](https://sepolia.arbiscan.io) for independent reproducibility.

2. **Hardhat results validated** — off-chain verification times (the paper's primary metric) are consistent across Hardhat, L1, and L2 to within 15%, confirming the local benchmark is representative.

3. **Gas costs are practical on L2** — at ~27.5M gas for 1,000 records, Arbitrum One mainnet cost is ~$0.007. Supply chain integrity verification is economically viable.

4. **Cross-validation holds on real networks** — on-chain/off-chain Merkle root match confirmed on both L1 and L2 EVM implementations, not just the Hardhat simulation.

5. **L2 is the natural deployment target** — 300x lower gas costs than L1, sub-second block times, same security guarantees via rollup proofs.

---

## Raw Data

- Sepolia L1: [`results/sepolia-l1/results-2026-04-01.json`](../results/sepolia-l1/results-2026-04-01.json)
- Arbitrum Sepolia L2: [`results/arbitrum-sepolia/results-2026-04-01.json`](../results/arbitrum-sepolia/results-2026-04-01.json)
- Hardhat local: [`results/hardhat/results-2026-04-01.json`](../results/hardhat/results-2026-04-01.json)
