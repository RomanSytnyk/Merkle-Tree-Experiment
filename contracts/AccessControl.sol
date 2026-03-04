// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

/**
 * @title AccessControl
 * @notice Role-based access control for supply chain participants.
 *         Roles: Supplier, Manufacturer, Transporter, Distributor.
 */
contract AccessControl {
    enum Role { None, Supplier, Manufacturer, Transporter, Distributor }

    address public admin;
    mapping(address => Role) public roles;

    event RoleGranted(address indexed account, Role role);
    event RoleRevoked(address indexed account);

    modifier onlyAdmin() {
        require(msg.sender == admin, "AccessControl: caller is not admin");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function grantRole(address account, Role role) external onlyAdmin {
        require(role != Role.None, "AccessControl: invalid role");
        roles[account] = role;
        emit RoleGranted(account, role);
    }

    function revokeRole(address account) external onlyAdmin {
        roles[account] = Role.None;
        emit RoleRevoked(account);
    }

    function checkRole(address account, Role requiredRole) external view returns (bool) {
        return roles[account] == requiredRole;
    }

    function hasAnyRole(address account) external view returns (bool) {
        return roles[account] != Role.None;
    }

    function getRole(address account) external view returns (Role) {
        return roles[account];
    }
}
