# Slither Static Analysis Report

**Tool:** Slither v0.11.5  
**Solidity compiler:** solc 0.8.18  
**Contracts analyzed:** 4 (AccessControl, MerkleVerification, SupplyChainCore, MovementManager)  
**Detectors run:** 101  
**Date:** 2026-04-01  

## Summary

| Severity | Count | Category |
|----------|-------|----------|
| High | 0 | — |
| Medium | 0 | — |
| Low | 3 | Unused return values (3 instances in SupplyChainCore) |
| Informational | 15 | Reentrancy-events (5), timestamp comparisons (3), solc version (1), naming convention (1), immutable candidates (5) |
| **Total** | **18** | |

**No critical or high-severity vulnerabilities detected.**

## Detailed Findings

### 1. Unused Return Values (Low) — 3 instances

`SupplyChainCore.addOrder()`, `updateProductionStatus()`, and `confirmReceipt()` ignore the return value of `merkleVerification.calculateLocationMerkleRoot()`.

**Assessment:** By design. The Merkle root is updated on-chain via state mutation inside `calculateLocationMerkleRoot()`; the return value is informational. The root is always accessible via `merkleVerification.currentRoot()`.

### 2. Reentrancy-Events (Informational) — 5 instances

Events emitted after external calls to `MerkleVerification.calculateLocationMerkleRoot()` in `SupplyChainCore` and `MovementManager`.

**Assessment:** Not exploitable. `MerkleVerification` is a trusted contract deployed by the same system, not an arbitrary external address. The external call target is set at construction time and cannot be changed. No ETH transfers or token approvals are involved.

### 3. Timestamp Comparisons (Informational) — 3 instances

`block.timestamp` used in `SupplyChainCore` status transition functions.

**Assessment:** Acceptable. Timestamp is used for audit trail recording, not for time-sensitive financial logic. Minor miner manipulation of `block.timestamp` (±15 seconds) does not affect supply chain integrity guarantees.

### 4. Solidity Version (Informational) — 1 instance

Compiler `^0.8.18` has known bugs: `VerbatimInvalidDeduplication`, `FullInlinerNonExpressionSplitArgumentEvaluationOrder`, `MissingSideEffectsOnSelectorAccess`.

**Assessment:** None of these bugs affect the contracts. No `verbatim` usage, no complex inline assembly, no `.selector` access patterns. Consider upgrading to 0.8.24+ for production deployment.

### 5. Immutable State Variables (Informational) — 5 instances

`AccessControl.admin`, `SupplyChainCore.accessControl`, `SupplyChainCore.merkleVerification`, `MovementManager.accessControl`, `MovementManager.merkleVerification` could be declared `immutable`.

**Assessment:** Valid optimization suggestion. Declaring these as `immutable` would save ~2,100 gas per access (SLOAD → code embedding). Recommended for production.

### 6. Naming Convention (Informational) — 1 instance

Parameter `_leaves` in `storeLeavesBatch(bytes32[] calldata _leaves)` uses underscore prefix.

**Assessment:** Cosmetic. Underscore prefix is a common Solidity convention to avoid shadowing.

## Conclusion

Slither found **no high or medium severity vulnerabilities** in the four-contract system. The 3 low-severity findings are by-design patterns. The 15 informational findings include valid gas optimizations (immutable variables) and standard static analysis noise for trusted inter-contract calls. The contract system is suitable for deployment with the noted optimizations applied.
