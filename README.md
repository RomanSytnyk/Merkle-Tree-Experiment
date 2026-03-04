# Merkle Tree vs MySQL — Supply Chain Integrity Verification

Experiment companion for:
**"Implementing Application-Level Merkle Tree Verification in EVM Smart Contracts for Supply Chain Data Integrity"**
*R.S. Sytnyk (2025)*

## What This Measures

End-to-end integrity verification time for two systems:

| System | Verification Method |
|--------|-------------------|
| **Blockchain** | Rebuild Merkle tree from all leaf hashes → compare root (O(n) rebuild, O(1) comparison) |
| **MySQL** | Multi-table JOIN across 5 tables + per-record ECDSA signature verification |

Datasets: **1,000 / 10,000 / 100,000** records, **10 runs** each.

## Quick Start

### Prerequisites
- **Node.js** ≥ 18
- **Docker** (for MySQL; not needed for blockchain-only mode)

### One-command run

```bash
chmod +x run.sh
./run.sh              # Full (blockchain + MySQL via Docker)
./run.sh blockchain   # Blockchain only — no Docker needed
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
| `MerkleVerification.sol` | On-chain Merkle tree construction, proof generation & verification |
| `SupplyChainCore.sol` | Order lifecycle, production status, ownership state |
| `MovementManager.sol` | Location & ownership transfer history |

All four contracts execute atomically within a single EVM transaction.

### Verification Paths

Two paths are measured (same keccak256 algorithm):

1. **On-chain** — EVM `view` call to `rebuildAndVerifyRoot()` (includes EVM overhead)
2. **Off-chain** — JavaScript implementation via `ethers.js` keccak256

Cross-validation confirms both produce byte-identical Merkle roots. The off-chain path is used as the primary metric across all dataset sizes.

## Output

Results printed to console and saved to `results.json`:

- Mean, median, standard deviation, min, max
- 95% confidence intervals
- Scaling analysis with estimated complexity exponents
- Cross-validation between on-chain and off-chain paths

## License

Apache License 2.0
