// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;

import "./AccessControl.sol";
import "./MerkleVerification.sol";

/**
 * @title SupplyChainCore
 * @notice Order lifecycle management: creation, production status, receipt confirmation.
 *         Integrates with AccessControl for role enforcement and MerkleVerification
 *         for integrity proof generation within atomic transactions.
 */
contract SupplyChainCore {
    enum OrderStatus { Created, InProduction, Produced, InTransit, Delivered, Confirmed }

    struct Order {
        uint256 id;
        uint256 resourceId;
        address supplier;
        address manufacturer;
        address transporter;
        address distributor;
        OrderStatus status;
        uint256 createdAt;
        uint256 updatedAt;
    }

    AccessControl public accessControl;
    MerkleVerification public merkleVerification;

    mapping(uint256 => Order) public orders;
    uint256 public orderCount;

    event OrderCreated(uint256 indexed orderId, uint256 resourceId, address supplier);
    event OrderStatusUpdated(uint256 indexed orderId, OrderStatus status);

    modifier onlyRole(AccessControl.Role role) {
        require(
            accessControl.checkRole(msg.sender, role),
            "SupplyChainCore: unauthorized role"
        );
        _;
    }

    constructor(address _accessControl, address _merkleVerification) {
        accessControl = AccessControl(_accessControl);
        merkleVerification = MerkleVerification(_merkleVerification);
    }

    function addOrder(
        uint256 resourceId,
        bytes memory locationData,
        address manufacturer,
        address transporter,
        address distributor
    ) external onlyRole(AccessControl.Role.Supplier) returns (uint256) {
        orderCount++;
        orders[orderCount] = Order({
            id: orderCount,
            resourceId: resourceId,
            supplier: msg.sender,
            manufacturer: manufacturer,
            transporter: transporter,
            distributor: distributor,
            status: OrderStatus.Created,
            createdAt: block.timestamp,
            updatedAt: block.timestamp
        });

        // Atomic: update Merkle tree with this event
        merkleVerification.calculateLocationMerkleRoot(
            resourceId,
            locationData,
            block.timestamp,
            msg.sender
        );

        emit OrderCreated(orderCount, resourceId, msg.sender);
        return orderCount;
    }

    function updateProductionStatus(
        uint256 orderId,
        bytes memory locationData
    ) external onlyRole(AccessControl.Role.Manufacturer) {
        Order storage order = orders[orderId];
        require(order.id != 0, "SupplyChainCore: order not found");
        require(order.manufacturer == msg.sender, "SupplyChainCore: not assigned manufacturer");
        require(order.status == OrderStatus.Created, "SupplyChainCore: invalid status transition");

        order.status = OrderStatus.InProduction;
        order.updatedAt = block.timestamp;

        merkleVerification.calculateLocationMerkleRoot(
            order.resourceId,
            locationData,
            block.timestamp,
            msg.sender
        );

        emit OrderStatusUpdated(orderId, OrderStatus.InProduction);
    }

    function confirmReceipt(
        uint256 orderId,
        bytes memory locationData
    ) external onlyRole(AccessControl.Role.Distributor) {
        Order storage order = orders[orderId];
        require(order.id != 0, "SupplyChainCore: order not found");
        require(order.distributor == msg.sender, "SupplyChainCore: not assigned distributor");

        order.status = OrderStatus.Confirmed;
        order.updatedAt = block.timestamp;

        merkleVerification.calculateLocationMerkleRoot(
            order.resourceId,
            locationData,
            block.timestamp,
            msg.sender
        );

        emit OrderStatusUpdated(orderId, OrderStatus.Confirmed);
    }

    function getOrderStatus(uint256 orderId) external view returns (OrderStatus) {
        require(orders[orderId].id != 0, "SupplyChainCore: order not found");
        return orders[orderId].status;
    }
}
