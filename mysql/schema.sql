-- Supply Chain MySQL Schema
-- Reference system: 5 normalized tables as described in the paper

CREATE DATABASE IF NOT EXISTS supply_chain;
USE supply_chain;

-- Table 1: Users (supply chain participants)
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    address VARCHAR(42) NOT NULL UNIQUE,  -- Ethereum-style address for comparability
    role ENUM('Supplier', 'Manufacturer', 'Transporter', 'Distributor') NOT NULL,
    public_key TEXT NOT NULL,             -- ECDSA public key for signature verification
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Table 2: Resources (tracked assets)
CREATE TABLE IF NOT EXISTS resources (
    id INT AUTO_INCREMENT PRIMARY KEY,
    resource_name VARCHAR(255) NOT NULL,
    description TEXT,
    current_owner_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (current_owner_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- Table 3: Ownership records
CREATE TABLE IF NOT EXISTS ownership_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    resource_id INT NOT NULL,
    from_user_id INT,
    to_user_id INT NOT NULL,
    transferred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    signature TEXT NOT NULL,              -- ECDSA signature over record data
    FOREIGN KEY (resource_id) REFERENCES resources(id),
    FOREIGN KEY (from_user_id) REFERENCES users(id),
    FOREIGN KEY (to_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- Table 4: Location history
CREATE TABLE IF NOT EXISTS location_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    resource_id INT NOT NULL,
    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),
    location_label VARCHAR(255),
    recorded_by INT NOT NULL,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    signature TEXT NOT NULL,              -- ECDSA signature over record data
    FOREIGN KEY (resource_id) REFERENCES resources(id),
    FOREIGN KEY (recorded_by) REFERENCES users(id)
) ENGINE=InnoDB;

-- Table 5: Audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    action_type VARCHAR(50) NOT NULL,
    resource_id INT,
    user_id INT NOT NULL,
    details TEXT,
    signature TEXT NOT NULL,              -- ECDSA signature over log entry
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (resource_id) REFERENCES resources(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- Indexes for JOIN performance
CREATE INDEX idx_ownership_resource ON ownership_records(resource_id);
CREATE INDEX idx_location_resource ON location_history(resource_id);
CREATE INDEX idx_audit_resource ON audit_logs(resource_id);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
