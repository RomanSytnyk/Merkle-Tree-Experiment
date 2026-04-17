# Merkle Tree vs MySQL -- Supply Chain Integrity Verification

Experiment companion for:
**"Implementing Application-Level Merkle Tree Verification in EVM Smart Contracts for Supply Chain Data Integrity"**
*R.S. Sytnyk, V.V. Hnatushenko (2025)*

## What This Measures

End-to-end integrity verification time for four systems:

| System | Verification Method |
|--------|-------------------|
| **Blockchain (Merkle)** | Rebuild Merkle tree from all leaf hashes (keccak256), compare root |
| **MySQL (JOIN + ECDSA)** | Multi-table JOIN across 5 tables + per-record ECDSA signature verification |
| **MySQL (SHA-256 only)** | Multi-table JOIN across 5 tables + per-record SHA-256 hash recomputation (no signatures) |

The MySQL+ECDSA path is measured against three independent secp256k1 libraries so the cost
is not attributed to any single implementation:

| Variant | Library | Notes |
|---------|---------|-------|
| `benchmark-mysql.js` | `elliptic` v6.x | pure-JS, the original baseline |
| `benchmark-mysql-native.js` | `node:crypto` (OpenSSL) | C, the fastest production-grade option on Node |
| `benchmark-mysql-noble.js` | `@noble/curves` v1.9.7 | audited pure-TypeScript (used internally by ethers v6 / viem) |

The SHA-256-only baseline isolates the cost of ECDSA from hash-based tamper detection.

Datasets: **1,000 / 10,000 / 100,000** records, **10 runs** each. The node:crypto and
@noble/curves variants were measured at 1,000 and 10,000 records; the 100,000-record point
was not re-measured, as per-record ECDSA cost scales linearly (verified at the 1K→10K step).

## Quick Start

### Prerequisites
- **Node.js** >= 18
- **Docker** (for MySQL; not needed for blockchain-only mode)

### One-command run

```bash
chmod +x run.sh
./run.sh              # Full (blockchain + MySQL via Docker)
./run.sh blockchain   # Blockchain only -- no Docker needed
./run.sh sha256       # MySQL SHA-256-only baseline
./run.sh small        # Quick: 1K records only
```

### Manual setup

```bash
npm install
npx hardhat compile

# Blockchain only
EXPERIMENT_MODE=blockchain npx hardhat run src/run-experiment.js --network hardhat

# Full (start MySQL first)
docker compose up -d
# wait ~15s for MySQL
EXPERIMENT_MODE=full npx hardhat run src/run-experiment.js --network hardhat
```

### MySQL + ECDSA across three libraries

```bash
docker compose up -d mysql

npm run mysql-only        # elliptic   (pure-JS)
npm run mysql-native      # node:crypto (OpenSSL)
npm run mysql-noble       # @noble/curves

# Or directly with explicit dataset size and run count:
node src/benchmark-mysql.js         10000 10
node src/benchmark-mysql-native.js  10000 10
node src/benchmark-mysql-noble.js   10000 10
```

The native and noble variants each run a cross-library self-test at startup
(sign with `elliptic`, verify with the alternate library). A failing self-test
aborts the run — signature interoperability is a precondition, not a result.

### Configuration

```bash
EXPERIMENT_SIZES=1000,10000,100000 npx hardhat run src/run-experiment.js --network hardhat
EXPERIMENT_RUNS=20 EXPERIMENT_MODE=blockchain npx hardhat run src/run-experiment.js --network hardhat
```

## Architecture

### Smart Contracts

| Contract | Role |
|----------|------|
| `AccessControl.sol` | Role-based access: Supplier, Manufacturer, Transporter, Distributor |
| `MerkleVerification.sol` | On-chain Merkle tree construction, proof generation and verification |
| `SupplyChainCore.sol` | Order lifecycle, production status, ownership state |
| `MovementManager.sol` | Location and ownership transfer history |

All four contracts execute atomically within a single EVM transaction.

### Verification Paths

Two paths are measured (same keccak256 algorithm):

1. **On-chain** -- EVM `view` call to `rebuildAndVerifyRoot()` (includes EVM overhead)
2. **Off-chain** -- JavaScript implementation via `ethers.js` keccak256

Cross-validation confirms both produce byte-identical Merkle roots. The off-chain path is used as the primary metric across all dataset sizes.

### Testnet Deployments

The system was deployed and validated on two public testnets:

| Network | Contract | Chain ID |
|---------|----------|----------|
| Ethereum Sepolia (L1) | `0xbe59B903532689324b3aE42FBf09Fe32D9756F0C` | 11155111 |
| Arbitrum Sepolia (L2) | `0x8f0d03Adcb9E0F2db4d25464eb466C36D3c70696` | 421614 |

Off-chain verification times are consistent across Hardhat, L1, and L2 to within 15%, confirming local benchmark results are representative.

## Output

Results printed to console and saved to `results/`:

- Mean, median, standard deviation, min, max
- 95% confidence intervals
- Scaling analysis with estimated complexity exponents
- Cross-validation between on-chain and off-chain paths
- ECDSA cost isolation (SHA-256 baseline comparison)

### Results Summary

MySQL + ECDSA (elliptic, pure-JS baseline):

| Dataset | MySQL (JOIN+ECDSA) | MySQL (SHA-256 only) | Blockchain (Merkle) | ECDSA Ratio |
|---------|-------------------|---------------------|--------------------:|------------:|
| 1,000 | 1.72 s | 13.9 ms | 94.7 ms | 18.2x |
| 10,000 | 17.32 s | 61.3 ms | 1.03 s | 16.8x |
| 100,000 | 2.83 min | 654 ms | 10.00 s | 17.0x |

MySQL + ECDSA across three secp256k1 libraries (10 runs, 100% verified, 10,000-record headline):

| Dataset | elliptic (pure-JS) | node:crypto (OpenSSL) | @noble/curves v1.9.7 | vs Blockchain (fastest) |
|---------|-------------------:|----------------------:|---------------------:|------------------------:|
| 1,000 | 1.69 s | 312 ms | 1.95 s | 3.4× |
| 10,000 | 17.02 s | 3.06 s | 18.64 s | 3.0× |

The 6× spread between `node:crypto` (3.06 s) and `@noble/curves` (18.64 s) at 10,000 records
is the well-known gap between OpenSSL's C secp256k1 and pure-JS/TypeScript ports. Even
against the fastest available Model B library, on-chain Merkle construction (Model C,
1.03 s at 10,000 records) retains a 3.0× structural advantage — so the Model B / Model C
gap is a property of the algorithm, not of the ECDSA library choice.

Raw logs: [`results/modelB/`](results/modelB/) (one `.log` per variant × dataset size).
Full results: [`reports/RESULTS-FULL-BENCHMARK.md`](reports/RESULTS-FULL-BENCHMARK.md)
Testnet results: [`reports/RESULTS-L2-TESTNET.md`](reports/RESULTS-L2-TESTNET.md)

## Static Analysis

Slither v0.11.5 (101 detectors): **0 high-severity, 0 medium-severity** vulnerabilities.
See [`reports/slither-report-summary.md`](reports/slither-report-summary.md).

## Repository Structure

```
contracts/          Solidity smart contracts (4 contracts)
src/                Benchmark scripts and utilities
  benchmark-blockchain.js        Merkle tree verification benchmark
  benchmark-mysql.js             MySQL + ECDSA verification (elliptic, pure-JS baseline)
  benchmark-mysql-native.js      MySQL + ECDSA via node:crypto (OpenSSL)
  benchmark-mysql-noble.js       MySQL + ECDSA via @noble/curves (audited pure-TS)
  benchmark-mysql-sha256only.js  MySQL SHA-256-only baseline
  benchmark-l2.js                L2 testnet deployment and benchmark
  generate-data.js               Synthetic supply chain data generator
  merkle-utils.js                Off-chain Merkle tree implementation
  run-experiment.js              Unified experiment runner
reports/            Detailed results and analysis
results/            Raw measurement data (per-run)
  hardhat/          Local Hardhat network results (JSON)
  sepolia-l1/       Ethereum Sepolia testnet results
  arbitrum-sepolia/ Arbitrum Sepolia testnet results
  modelB/           MySQL + ECDSA across three libraries (per-variant .log)
mysql/              Database schema for the reference system
```

## License

Apache-2.0
