// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

/**
 * @title MerkleVerification
 * @notice Application-level Merkle tree construction and verification for
 *         supply chain data integrity. Implements domain-specific leaf encoding,
 *         on-chain tree construction with canonical (sorted) pair ordering,
 *         and O(log n) proof verification.
 *
 *         Builds upon the canonical verification pattern from OpenZeppelin's
 *         MerkleProof library, extended with:
 *         - Domain-specific leaf encoding (resourceId, locationData, timestamp, actor)
 *         - Full on-chain tree construction (not just verification)
 *         - Integration hooks for atomic multi-contract execution
 */
contract MerkleVerification {
    bytes32 public currentRoot;
    bytes32[] public leaves;
    mapping(bytes32 => bool) public rootSnapshots;

    event LeafAdded(bytes32 indexed leafHash, uint256 index);
    event RootUpdated(bytes32 indexed oldRoot, bytes32 indexed newRoot);
    event SnapshotStored(bytes32 indexed root, uint256 leafCount);

    /**
     * @notice Compute a leaf hash from supply chain event parameters.
     * @dev leaf = keccak256(abi.encodePacked(resourceId, locationData, timestamp, actor))
     */
    function computeLeaf(
        uint256 resourceId,
        bytes memory locationData,
        uint256 timestamp,
        address actor
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(resourceId, locationData, timestamp, actor));
    }

    /**
     * @notice Entry point for generating integrity proofs from business operations.
     * @dev Called by SupplyChainCore and MovementManager during atomic transactions.
     */
    function calculateLocationMerkleRoot(
        uint256 resourceId,
        bytes memory locationData,
        uint256 timestamp,
        address actor
    ) external returns (bytes32) {
        bytes32 leaf = computeLeaf(resourceId, locationData, timestamp, actor);
        leaves.push(leaf);
        emit LeafAdded(leaf, leaves.length - 1);

        bytes32 oldRoot = currentRoot;
        currentRoot = buildMerkleTree(leaves);
        emit RootUpdated(oldRoot, currentRoot);

        return currentRoot;
    }

    /**
     * @notice Store a batch of pre-computed leaf hashes WITHOUT rebuilding tree.
     * @dev Separates storage from tree construction for efficient batch population.
     *      Call buildRoot() once after all batches are stored.
     */
    function storeLeavesBatch(bytes32[] calldata _leaves) external {
        for (uint256 i = 0; i < _leaves.length; i++) {
            leaves.push(_leaves[i]);
        }
    }

    /**
     * @notice Build Merkle tree from all stored leaves and set currentRoot.
     * @dev O(n) construction. Call once after all leaves are stored via storeLeavesBatch.
     */
    function buildRoot() external returns (bytes32) {
        bytes32 oldRoot = currentRoot;
        currentRoot = buildMerkleTree(leaves);
        emit RootUpdated(oldRoot, currentRoot);
        return currentRoot;
    }

    /**
     * @notice Build a complete binary Merkle tree from leaf hashes.
     * @dev Canonical (sorted) pair ordering: parent = keccak256(min(a,b) || max(a,b)).
     *      Odd nodes promoted without hashing. O(n) construction.
     */
    function buildMerkleTree(bytes32[] memory leafHashes) public pure returns (bytes32) {
        uint256 n = leafHashes.length;
        if (n == 0) return bytes32(0);
        if (n == 1) return leafHashes[0];

        bytes32[] memory currentLevel = new bytes32[](n);
        for (uint256 i = 0; i < n; i++) {
            currentLevel[i] = leafHashes[i];
        }

        while (n > 1) {
            uint256 nextN = (n + 1) / 2;
            bytes32[] memory nextLevel = new bytes32[](nextN);

            for (uint256 i = 0; i < n / 2; i++) {
                bytes32 left = currentLevel[2 * i];
                bytes32 right = currentLevel[2 * i + 1];
                if (left > right) {
                    (left, right) = (right, left);
                }
                nextLevel[i] = keccak256(abi.encodePacked(left, right));
            }

            if (n % 2 == 1) {
                nextLevel[nextN - 1] = currentLevel[n - 1];
            }

            currentLevel = nextLevel;
            n = nextN;
        }

        return currentLevel[0];
    }

    /**
     * @notice Verify a Merkle proof for a single leaf. O(log n).
     */
    function verifyMerkleProof(
        bytes32[] memory proof,
        bytes32 root,
        bytes32 leaf
    ) public pure returns (bool) {
        bytes32 computedHash = leaf;

        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 proofElement = proof[i];
            if (computedHash <= proofElement) {
                computedHash = keccak256(abi.encodePacked(computedHash, proofElement));
            } else {
                computedHash = keccak256(abi.encodePacked(proofElement, computedHash));
            }
        }

        return computedHash == root;
    }

    function storeSnapshot() external {
        rootSnapshots[currentRoot] = true;
        emit SnapshotStored(currentRoot, leaves.length);
    }

    function verifyAgainstSnapshot(bytes32 snapshotRoot) external view returns (bool) {
        return currentRoot == snapshotRoot && rootSnapshots[snapshotRoot];
    }

    /**
     * @notice Rebuild the tree from stored leaves (view call — no gas cost on-chain).
     *         This is the measured verification operation.
     */
    function rebuildAndVerifyRoot() external view returns (bytes32) {
        return buildMerkleTree(leaves);
    }

    /**
     * @notice Full integrity check: rebuild tree, compare to stored root.
     */
    function verifyDatasetIntegrity() external view returns (bool matches, bytes32 recomputedRoot) {
        recomputedRoot = buildMerkleTree(leaves);
        matches = (recomputedRoot == currentRoot);
    }

    function getLeafCount() external view returns (uint256) {
        return leaves.length;
    }

    function getLeaf(uint256 index) external view returns (bytes32) {
        require(index < leaves.length, "MerkleVerification: index out of bounds");
        return leaves[index];
    }
}
