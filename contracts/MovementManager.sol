// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "./AccessControl.sol";
import "./MerkleVerification.sol";

/**
 * @title MovementManager
 * @notice Immutable location and ownership transfer history for supply chain assets.
 *         Records are integrity-protected via MerkleVerification integration.
 */
contract MovementManager {
    struct LocationRecord {
        uint256 resourceId;
        bytes locationData;
        uint256 timestamp;
        address actor;
    }

    struct OwnershipRecord {
        uint256 resourceId;
        address from;
        address to;
        uint256 timestamp;
    }

    AccessControl public accessControl;
    MerkleVerification public merkleVerification;

    // resourceId => location history
    mapping(uint256 => LocationRecord[]) public locationHistories;

    // resourceId => ownership history
    mapping(uint256 => OwnershipRecord[]) public ownershipHistories;

    // resourceId => current owner
    mapping(uint256 => address) public currentOwners;

    event LocationApplied(uint256 indexed resourceId, address indexed actor, uint256 timestamp);
    event OwnershipTransferred(uint256 indexed resourceId, address indexed from, address indexed to);

    constructor(address _accessControl, address _merkleVerification) {
        accessControl = AccessControl(_accessControl);
        merkleVerification = MerkleVerification(_merkleVerification);
    }

    function applyLocation(
        uint256 resourceId,
        bytes memory locationData
    ) external returns (bytes32) {
        require(
            accessControl.hasAnyRole(msg.sender),
            "MovementManager: caller has no role"
        );

        locationHistories[resourceId].push(LocationRecord({
            resourceId: resourceId,
            locationData: locationData,
            timestamp: block.timestamp,
            actor: msg.sender
        }));

        // Atomic: update Merkle tree
        bytes32 newRoot = merkleVerification.calculateLocationMerkleRoot(
            resourceId,
            locationData,
            block.timestamp,
            msg.sender
        );

        emit LocationApplied(resourceId, msg.sender, block.timestamp);
        return newRoot;
    }

    function transferOwnership(
        uint256 resourceId,
        address to,
        bytes memory locationData
    ) external returns (bytes32) {
        require(
            accessControl.hasAnyRole(msg.sender),
            "MovementManager: caller has no role"
        );
        require(
            accessControl.hasAnyRole(to),
            "MovementManager: recipient has no role"
        );

        address from = currentOwners[resourceId];
        currentOwners[resourceId] = to;

        ownershipHistories[resourceId].push(OwnershipRecord({
            resourceId: resourceId,
            from: from,
            to: to,
            timestamp: block.timestamp
        }));

        // Atomic: update Merkle tree with transfer event
        bytes32 newRoot = merkleVerification.calculateLocationMerkleRoot(
            resourceId,
            locationData,
            block.timestamp,
            msg.sender
        );

        emit OwnershipTransferred(resourceId, from, to);
        return newRoot;
    }

    function getLocationHistory(uint256 resourceId) external view returns (LocationRecord[] memory) {
        return locationHistories[resourceId];
    }

    function getOwnershipHistory(uint256 resourceId) external view returns (OwnershipRecord[] memory) {
        return ownershipHistories[resourceId];
    }

    function getLocationCount(uint256 resourceId) external view returns (uint256) {
        return locationHistories[resourceId].length;
    }
}
