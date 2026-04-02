# Full Benchmark Results: Merkle Tree vs MySQL Integrity Verification

**Date:** 2026-04-01  
**Platform:** macOS, Apple Silicon (darwin arm64), Node.js v25.6.1  
**Environment:** Hardhat local network (auto-mining, in-memory EVM)  
**Runs per configuration:** 10  
**Dataset sizes:** 1,000 / 10,000 / 100,000 supply chain records  

---

## Systems Under Test

| System | Integrity Mechanism | Crypto Operations |
|--------|--------------------|--------------------|
| **Blockchain (Merkle)** | Compute all leaf hashes (keccak256), build Merkle tree, compare root | keccak256 only |
| **MySQL (JOIN + ECDSA)** | Multi-table JOIN, per-record SHA-256 hash recompute, per-record ECDSA signature verify | SHA-256 + secp256k1 ECDSA |
| **MySQL (SHA-256 only)** | Multi-table JOIN, per-record SHA-256 hash recompute, **no signature verification** | SHA-256 only |

The SHA-256-only baseline isolates the cost of ECDSA signature verification from the hash-based tamper detection, directly addressing the question: *"Is the 17-20x performance gap attributable to Merkle tree efficiency or to ECDSA being slow?"*

---

## Combined Results

### Verification Time

| Dataset | MySQL (JOIN+ECDSA) | MySQL (SHA-256 only) | Blockchain (Merkle) | ECDSA Ratio | SHA-256 Ratio |
|---------|-------------------|---------------------|--------------------:|------------:|--------------:|
| 1,000 | 1.72 s | 13.9 ms | 94.7 ms | 18.2x | 0.15x |
| 10,000 | 17.32 s | 61.3 ms | 1.03 s | 16.8x | 0.06x |
| 100,000 | 2.83 min | 654 ms | 10.00 s | 17.0x | 0.07x |

> **ECDSA Ratio** = MySQL ECDSA time / Blockchain time (higher = Blockchain faster)  
> **SHA-256 Ratio** = MySQL SHA-256 time / Blockchain time (lower = MySQL SHA-256 faster)

### Key Finding: Decomposing the Performance Gap

The 17-20x speedup of Merkle tree verification over MySQL+ECDSA decomposes into two independent factors:

| Factor | Contribution | Evidence |
|--------|-------------|----------|
| **ECDSA signature verification** | ~99.2% of MySQL time | Removing ECDSA drops MySQL from 1.72s to 13.9ms (124x faster) at 1K records |
| **Hash-based integrity checking** | ~0.8% of MySQL time | SHA-256 per-record hashing is faster than Merkle tree rebuild |

**The MySQL SHA-256-only baseline is actually 7-15x faster than the Merkle tree approach.** This is expected: per-record SHA-256 hash comparison is O(n) with a small constant, while Merkle tree construction is also O(n) but with keccak256 pair-hashing at every tree level.

**This means the paper's Merkle tree advantage is not about raw verification speed — it is about the trust model:**

1. **Merkle trees provide structural integrity** — a single root hash commits to the entire dataset, enabling O(log n) proofs for individual records
2. **Merkle trees enable trustless verification** — any party can verify without access to signing keys
3. **ECDSA per-record signing is the dominant cost** in traditional integrity systems, and the Merkle approach eliminates it entirely by shifting trust to the blockchain consensus

### ECDSA Cost Isolation

| Dataset | MySQL ECDSA | MySQL SHA-256 | ECDSA Overhead |
|---------|------------|--------------|---------------|
| 1,000 | 1,724 ms | 13.9 ms | **124x** (ECDSA is 99.2% of total) |
| 10,000 | 17,316 ms | 61.3 ms | **283x** (ECDSA is 99.6% of total) |
| 100,000 | 169,895 ms | 654 ms | **260x** (ECDSA is 99.6% of total) |

---

## Extended Statistics

### 1,000 Records

| System | Mean | Median | Std Dev | 95% CI |
|--------|------|--------|---------|--------|
| Blockchain (Merkle) | 94.7 ms | 92.0 ms | 9.0 ms | +/-6.4 ms |
| MySQL (JOIN+ECDSA) | 1.72 s | 1.72 s | 12.8 ms | +/-9.2 ms |
| MySQL (SHA-256 only) | 13.9 ms | 12.3 ms | 3.5 ms | +/-2.5 ms |

**Cross-validation:** On-chain and off-chain Merkle roots matched (verified at n<=2,000).

### 10,000 Records

| System | Mean | Median | Std Dev | 95% CI |
|--------|------|--------|---------|--------|
| Blockchain (Merkle) | 1.03 s | 1.04 s | 49.3 ms | +/-35.3 ms |
| MySQL (JOIN+ECDSA) | 17.32 s | 17.23 s | 344.6 ms | +/-246.5 ms |
| MySQL (SHA-256 only) | 61.3 ms | 60.1 ms | 6.3 ms | +/-4.5 ms |

### 100,000 Records

| System | Mean | Median | Std Dev | 95% CI |
|--------|------|--------|---------|--------|
| Blockchain (Merkle) | 10.00 s | 10.09 s | 222.6 ms | +/-159.2 ms |
| MySQL (JOIN+ECDSA) | 169.89 s | 169.99 s | 287.6 ms | +/-205.7 ms |
| MySQL (SHA-256 only) | 654 ms | 625 ms | 80.5 ms | +/-57.6 ms |

---

## Scaling Analysis

### Scaling Exponents (alpha)

For O(n^alpha) behavior: alpha=1.0 is linear, alpha<1.0 is sub-linear.

| Transition | Blockchain (alpha) | MySQL ECDSA (alpha) | MySQL SHA-256 (alpha) |
|-----------|-------------------|--------------------|-----------------------|
| 1K -> 10K (10x data) | 1.04 | 1.00 | 0.64 |
| 10K -> 100K (10x data) | 0.99 | 0.99 | 1.03 |

**Observations:**
- **Blockchain:** Near-linear scaling (alpha ~1.0). Merkle tree construction is O(n) as expected.
- **MySQL ECDSA:** Linear scaling (alpha ~1.0). Dominated by per-record ECDSA which is O(n).
- **MySQL SHA-256:** Sub-linear at small scale (alpha=0.64 for 1K->10K) due to query overhead amortization, then linear at large scale (alpha=1.03 for 10K->100K). The initial amortization effect is from the fixed-cost multi-table JOIN becoming a smaller fraction of total time.

---

## Individual Run Data

### Blockchain (Merkle) — All Runs (seconds)

| Run | 1,000 | 10,000 | 100,000 |
|-----|-------|--------|---------|
| 1 | 0.1065 | 1.0528 | 9.6760 |
| 2 | 0.0983 | 1.0323 | 9.7993 |
| 3 | 0.1106 | 1.0556 | 9.8398 |
| 4 | 0.1019 | 1.0399 | 9.8707 |
| 5 | 0.0920 | 1.1228 | 9.7967 |
| 6 | 0.0900 | 1.0884 | 10.2652 |
| 7 | 0.0876 | 0.9926 | 10.0904 |
| 8 | 0.0875 | 0.9914 | 10.1980 |
| 9 | 0.0866 | 0.9684 | 10.2033 |
| 10 | 0.0861 | 0.9851 | 10.2406 |

### MySQL (JOIN+ECDSA) — All Runs (seconds)

| Run | 1,000 | 10,000 | 100,000 |
|-----|-------|--------|---------|
| 1 | 1.7575 | 17.8615 | 170.042 |
| 2 | 1.7169 | 17.9571 | 169.986 |
| 3 | 1.7173 | 17.0123 | 169.874 |
| 4 | 1.7234 | 17.0262 | 169.758 |
| 5 | 1.7295 | 17.4575 | 170.251 |
| 6 | 1.7130 | 17.2930 | 169.705 |
| 7 | 1.7264 | 17.1359 | 169.498 |
| 8 | 1.7251 | 16.9828 | 169.472 |
| 9 | 1.7142 | 17.2264 | 170.054 |
| 10 | 1.7205 | 17.2061 | 170.309 |

### MySQL (SHA-256 only) — All Runs (seconds)

| Run | 1,000 | 10,000 | 100,000 |
|-----|-------|--------|---------|
| 1 | 0.0177 | 0.0781 | 0.8765 |
| 2 | 0.0186 | 0.0627 | 0.6795 |
| 3 | 0.0122 | 0.0578 | 0.6072 |
| 4 | 0.0143 | 0.0576 | 0.6229 |
| 5 | 0.0116 | 0.0580 | 0.6198 |
| 6 | 0.0107 | 0.0603 | 0.6221 |
| 7 | 0.0123 | 0.0601 | 0.6311 |
| 8 | 0.0112 | 0.0590 | 0.6337 |
| 9 | 0.0196 | 0.0564 | 0.6254 |
| 10 | 0.0106 | 0.0626 | 0.6220 |

---

## On-Chain vs Off-Chain Verification (1,000 Records)

| Run | On-Chain (EVM view) | Off-Chain (JS) |
|-----|--------------------:|---------------:|
| 1 | 20.3 ms | 106.5 ms |
| 2 | 11.9 ms | 98.3 ms |
| 3 | 12.8 ms | 110.6 ms |
| 4 | 12.7 ms | 101.9 ms |
| 5 | 39.0 ms | 92.0 ms |
| 6 | 11.2 ms | 90.0 ms |
| 7 | 11.4 ms | 87.6 ms |
| 8 | 10.7 ms | 87.5 ms |
| 9 | 10.9 ms | 86.6 ms |
| 10 | 10.8 ms | 86.1 ms |
| **Mean** | **15.2 ms** | **94.7 ms** |

The EVM view call is ~6.2x faster than the JS off-chain implementation due to native keccak256 execution in the EVM.

---

## Interpretation

The 17-20x performance advantage of Merkle tree verification over MySQL+ECDSA is almost entirely attributable to eliminating per-record ECDSA signature verification:

1. **The Merkle tree approach eliminates per-record asymmetric signatures.** The blockchain consensus mechanism provides the trust guarantee that ECDSA signatures provide in the MySQL system — a fundamental architectural advantage.

2. **Comparing hash operations directly (keccak256 vs SHA-256), per-record hash checking is faster** due to simpler computation (no tree construction). But it provides weaker guarantees — no structural commitment, no O(log n) individual proofs, no trustless third-party verification.

3. **The four-contract atomic Merkle tree pattern** trades ~15x in raw hash verification speed for structural integrity guarantees (single-root commitment, logarithmic proofs, trustless verification) while eliminating the 124-283x ECDSA overhead that traditional systems require.

---

## Methodology

- **30 measurements per configuration** (10 runs x 3 dataset sizes)
- **3 systems tested** in same session, same hardware, same synthetic dataset (seed=42)
- **Confidence intervals:** 95% CI using t-distribution
- **Scaling exponents:** alpha = log(time_ratio) / log(data_ratio)
- **Cache control:** MySQL query cache reset between runs
- **Synthetic data:** Seeded PRNG (seed=42) for reproducibility, 8-12 events per order, 20 ECDSA-signed participants, 4 supply chain roles

## Raw Data

Full JSON results: [`results/hardhat/results-2026-04-01.json`](results/hardhat/results-2026-04-01.json)
