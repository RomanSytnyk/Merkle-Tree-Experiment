/**
 * Off-chain Merkle tree implementation — mirrors MerkleVerification.sol exactly.
 *
 * Leaf encoding: keccak256(abi.encodePacked(resourceId, locationData, timestamp, actor))
 * Tree construction: canonical sorted pair ordering, keccak256
 *
 * Produces byte-identical roots to the on-chain contract (cross-validated).
 */

const { ethers } = require('hardhat');

/** Compute a leaf hash. Matches MerkleVerification.computeLeaf(). */
function computeLeaf(resourceId, locationData, timestamp, actorAddress) {
  const locationBytes = ethers.toUtf8Bytes(locationData);
  return ethers.solidityPackedKeccak256(
    ['uint256', 'bytes', 'uint256', 'address'],
    [resourceId, locationBytes, timestamp, actorAddress]
  );
}

function computeAllLeaves(records) {
  return records.map(r => computeLeaf(r.resourceId, r.locationData, r.timestamp, r.actorAddress));
}

/**
 * Build a Merkle tree from leaf hashes.
 * Canonical sorted pairs: parent = keccak256(min(a,b) || max(a,b)).
 * Odd nodes promoted without hashing. O(n) construction.
 */
function buildMerkleTree(leafHashes) {
  let n = leafHashes.length;
  if (n === 0) return ethers.ZeroHash;
  if (n === 1) return leafHashes[0];

  let currentLevel = [...leafHashes];

  while (n > 1) {
    const nextN = Math.floor((n + 1) / 2);
    const nextLevel = new Array(nextN);

    for (let i = 0; i < Math.floor(n / 2); i++) {
      let left = currentLevel[2 * i];
      let right = currentLevel[2 * i + 1];
      if (BigInt(left) > BigInt(right)) {
        [left, right] = [right, left];
      }
      nextLevel[i] = ethers.solidityPackedKeccak256(
        ['bytes32', 'bytes32'],
        [left, right]
      );
    }

    if (n % 2 === 1) {
      nextLevel[nextN - 1] = currentLevel[n - 1];
    }

    currentLevel = nextLevel;
    n = nextN;
  }

  return currentLevel[0];
}

/** Compute leaves → build tree → compare root. Returns { root, matches }. */
function verifyDatasetIntegrity(records, expectedRoot) {
  const leaves = computeAllLeaves(records);
  const root = buildMerkleTree(leaves);
  return { root, matches: root === expectedRoot };
}

module.exports = {
  computeLeaf,
  computeAllLeaves,
  buildMerkleTree,
  verifyDatasetIntegrity,
};
