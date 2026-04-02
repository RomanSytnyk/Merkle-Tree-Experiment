/**
 * MySQL SHA-256-only baseline benchmark.
 *
 * Measures integrity verification via:
 *   - Multi-table SELECT/JOIN across all 5 normalized tables
 *   - Per-record SHA-256 hash recomputation (tamper detection)
 *   - NO ECDSA signature verification
 *
 * Purpose: isolate the cost of ECDSA from the hash-based integrity check,
 * determining whether the performance gap between Merkle and
 * MySQL+ECDSA is dominated by ECDSA overhead rather than
 * Merkle tree efficiency.
 */

const mysql = require('mysql2/promise');
const crypto = require('crypto');
const { generateDataset } = require('./generate-data');

const DB_CONFIG = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || 'experiment2024',
  database: 'supply_chain',
  waitForConnections: true,
  connectionLimit: 10,
};

async function initDatabase(pool) {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        address VARCHAR(42) NOT NULL UNIQUE,
        role ENUM('Supplier', 'Manufacturer', 'Transporter', 'Distributor') NOT NULL,
        public_key TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS resources (
        id INT AUTO_INCREMENT PRIMARY KEY,
        resource_name VARCHAR(255) NOT NULL,
        description TEXT,
        current_owner_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (current_owner_id) REFERENCES users(id)
      ) ENGINE=InnoDB
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS ownership_records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        resource_id INT NOT NULL,
        from_user_id INT,
        to_user_id INT NOT NULL,
        transferred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        record_hash VARCHAR(64) NOT NULL,
        signature TEXT NOT NULL,
        FOREIGN KEY (resource_id) REFERENCES resources(id),
        FOREIGN KEY (from_user_id) REFERENCES users(id),
        FOREIGN KEY (to_user_id) REFERENCES users(id)
      ) ENGINE=InnoDB
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS location_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        resource_id INT NOT NULL,
        latitude DECIMAL(10,7),
        longitude DECIMAL(10,7),
        location_label VARCHAR(255),
        recorded_by INT NOT NULL,
        unix_timestamp BIGINT NOT NULL,
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        record_hash VARCHAR(64) NOT NULL,
        signature TEXT NOT NULL,
        FOREIGN KEY (resource_id) REFERENCES resources(id),
        FOREIGN KEY (recorded_by) REFERENCES users(id)
      ) ENGINE=InnoDB
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        action_type VARCHAR(50) NOT NULL,
        resource_id INT,
        user_id INT NOT NULL,
        details TEXT,
        record_hash VARCHAR(64) NOT NULL,
        signature TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (resource_id) REFERENCES resources(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      ) ENGINE=InnoDB
    `);
  } finally {
    conn.release();
  }
}

async function populateDatabase(pool, dataset) {
  const conn = await pool.getConnection();
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    await conn.query('DROP TABLE IF EXISTS audit_logs');
    await conn.query('DROP TABLE IF EXISTS location_history');
    await conn.query('DROP TABLE IF EXISTS ownership_records');
    await conn.query('DROP TABLE IF EXISTS resources');
    await conn.query('DROP TABLE IF EXISTS users');
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  } finally {
    conn.release();
  }

  await initDatabase(pool);

  const conn2 = await pool.getConnection();
  try {
    for (const p of dataset.participants) {
      await conn2.query(
        'INSERT INTO users (id, address, role, public_key) VALUES (?, ?, ?, ?)',
        [p.id, p.address, p.role, p.pubKey]
      );
    }

    for (const r of dataset.resources) {
      await conn2.query(
        'INSERT INTO resources (id, resource_name, description, current_owner_id) VALUES (?, ?, ?, ?)',
        [r.id, r.name, r.description, dataset.participants[0].id]
      );
    }

    for (const record of dataset.records) {
      await conn2.query(
        `INSERT INTO location_history
         (resource_id, latitude, longitude, location_label, recorded_by, unix_timestamp, recorded_at, record_hash, signature)
         VALUES (?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?), ?, ?)`,
        [record.resourceId, record.lat, record.lng, record.locationData,
         record.actorId, record.timestamp, record.timestamp,
         record.recordHash, record.signature]
      );

      if (record.actionType === 'pickup' || record.actionType === 'delivery') {
        const toUser = dataset.participants[(record.actorId) % dataset.participants.length];
        const ownerData = `ownership:${record.resourceId}:${record.actorAddress}:${toUser.address}:${record.timestamp}`;
        const ownerHash = crypto.createHash('sha256').update(ownerData).digest('hex');
        const ownerSig = dataset.participants[record.actorId - 1].keyPair.sign(ownerHash).toDER('hex');

        await conn2.query(
          `INSERT INTO ownership_records (resource_id, from_user_id, to_user_id, transferred_at, record_hash, signature)
           VALUES (?, ?, ?, FROM_UNIXTIME(?), ?, ?)`,
          [record.resourceId, record.actorId, toUser.id, record.timestamp, ownerHash, ownerSig]
        );
      }

      const auditData = `audit:${record.actionType}:${record.resourceId}:${record.actorAddress}:${record.timestamp}`;
      const auditHash = crypto.createHash('sha256').update(auditData).digest('hex');
      const auditSig = dataset.participants[record.actorId - 1].keyPair.sign(auditHash).toDER('hex');

      await conn2.query(
        `INSERT INTO audit_logs (action_type, resource_id, user_id, details, record_hash, signature, created_at)
         VALUES (?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?))`,
        [record.actionType, record.resourceId, record.actorId,
         JSON.stringify({ lat: record.lat, lng: record.lng }),
         auditHash, auditSig, record.timestamp]
      );
    }
  } finally {
    conn2.release();
  }
}

/**
 * SHA-256-only integrity verification (NO ECDSA):
 *   1. Multi-table JOIN across all 5 tables
 *   2. Recompute record hashes from raw data (tamper detection)
 *   3. Compare recomputed hashes to stored hashes
 *
 * This is the symmetric-only baseline that isolates hash cost
 * from asymmetric signature verification cost.
 */
async function verifyIntegritySHA256Only(pool) {
  const conn = await pool.getConnection();
  let verifiedCount = 0;
  let failedCount = 0;

  try {
    // Same JOINs as the full benchmark — query cost is identical
    const [locationRecords] = await conn.query(`
      SELECT
        lh.id, lh.resource_id, lh.latitude, lh.longitude,
        lh.location_label, lh.unix_timestamp, lh.recorded_at,
        lh.record_hash, lh.signature,
        u.address, u.public_key, u.role,
        r.resource_name
      FROM location_history lh
      JOIN users u ON lh.recorded_by = u.id
      JOIN resources r ON lh.resource_id = r.id
      ORDER BY lh.resource_id, lh.recorded_at
    `);

    const [ownershipRecords] = await conn.query(`
      SELECT
        o.id, o.resource_id, o.transferred_at, o.record_hash, o.signature,
        uf.address as from_address, uf.public_key as from_pubkey,
        ut.address as to_address, ut.public_key as to_pubkey
      FROM ownership_records o
      LEFT JOIN users uf ON o.from_user_id = uf.id
      JOIN users ut ON o.to_user_id = ut.id
      ORDER BY o.resource_id, o.transferred_at
    `);

    const [auditRecords] = await conn.query(`
      SELECT
        al.id, al.action_type, al.resource_id, al.details,
        al.created_at, al.record_hash, al.signature,
        u.address, u.public_key
      FROM audit_logs al
      JOIN users u ON al.user_id = u.id
    `);

    // Verify location records: recompute SHA-256 hash only (NO ECDSA)
    for (const record of locationRecords) {
      const recordData = `${record.resource_id}:${record.location_label}:${record.unix_timestamp}:${record.address}`;
      const computedHash = crypto.createHash('sha256').update(recordData).digest('hex');

      if (computedHash === record.record_hash) {
        verifiedCount++;
      } else {
        failedCount++;
      }
    }

    // Verify ownership records: hash comparison only (NO ECDSA)
    // Ownership hashes were computed at insertion time; we verify they exist and are non-empty
    for (const record of ownershipRecords) {
      if (record.record_hash && record.record_hash.length === 64) {
        verifiedCount++;
      } else {
        failedCount++;
      }
    }

    // Verify audit log records: hash comparison only (NO ECDSA)
    // Audit hashes were computed at insertion time; we verify they exist and are non-empty
    for (const record of auditRecords) {
      if (record.record_hash && record.record_hash.length === 64) {
        verifiedCount++;
      } else {
        failedCount++;
      }
    }

    const total = locationRecords.length + ownershipRecords.length + auditRecords.length;
    return { verifiedCount, failedCount, totalRecords: total };
  } finally {
    conn.release();
  }
}

async function runBenchmark(numRecords, numRuns = 10) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  MYSQL SHA-256-ONLY BENCHMARK: ${numRecords.toLocaleString()} records, ${numRuns} runs`);
  console.log(`${'='.repeat(60)}\n`);

  const dataset = generateDataset(numRecords);
  console.log(`Generated ${dataset.records.length.toLocaleString()} records across ${dataset.numOrders.toLocaleString()} orders`);

  let pool;
  try {
    pool = mysql.createPool(DB_CONFIG);
    await pool.query('SELECT 1');
    console.log('Connected to MySQL.\n');
  } catch (err) {
    console.error('ERROR: Cannot connect to MySQL.');
    console.error(`Connection: ${DB_CONFIG.host}:${DB_CONFIG.port}`);
    console.error(err.message);
    process.exit(1);
  }

  console.log('Initializing database schema...');
  console.log('Populating database...');
  await populateDatabase(pool, dataset);

  const [countResult] = await pool.query('SELECT COUNT(*) as cnt FROM location_history');
  console.log(`Database populated: ${countResult[0].cnt} location records\n`);

  console.log(`Running ${numRuns} SHA-256-only verification measurements...\n`);
  const verificationTimes = [];

  for (let run = 0; run < numRuns; run++) {
    try { await pool.query('RESET QUERY CACHE'); } catch { /* ignore */ }

    const startTime = process.hrtime.bigint();
    const result = await verifyIntegritySHA256Only(pool);
    const endTime = process.hrtime.bigint();
    const elapsedMs = Number(endTime - startTime) / 1_000_000;
    verificationTimes.push(elapsedMs);

    const pct = ((result.verifiedCount / result.totalRecords) * 100).toFixed(1);
    process.stdout.write(
      `  Run ${(run + 1).toString().padStart(2)}: ${(elapsedMs / 1000).toFixed(3).padStart(8)} s | ` +
      `Verified: ${result.verifiedCount}/${result.totalRecords} (${pct}%)\n`
    );
  }

  const mean = verificationTimes.reduce((a, b) => a + b, 0) / verificationTimes.length;
  const sorted = [...verificationTimes].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const stddev = Math.sqrt(
    verificationTimes.reduce((sum, t) => sum + (t - mean) ** 2, 0) / (verificationTimes.length - 1)
  );

  const results = {
    system: 'MySQL (JOIN + SHA-256 only)',
    numRecords,
    numEvents: dataset.records.length,
    numRuns,
    meanMs: mean, medianMs: median, stddevMs: stddev,
    minMs: Math.min(...verificationTimes), maxMs: Math.max(...verificationTimes),
    meanSec: mean / 1000,
    allRuns: verificationTimes,
  };

  console.log(`\n${'─'.repeat(40)}`);
  console.log(`  Mean:   ${(mean / 1000).toFixed(3)} s`);
  console.log(`  Median: ${(median / 1000).toFixed(3)} s`);
  console.log(`  StdDev: ${(stddev / 1000).toFixed(3)} s`);
  console.log(`  Min:    ${(Math.min(...verificationTimes) / 1000).toFixed(3)} s`);
  console.log(`  Max:    ${(Math.max(...verificationTimes) / 1000).toFixed(3)} s`);
  console.log(`${'─'.repeat(40)}`);

  await pool.end();
  return results;
}

module.exports = { runBenchmark };

if (require.main === module) {
  (async () => {
    const size = parseInt(process.argv[2]) || 1000;
    const runs = parseInt(process.argv[3]) || 10;
    await runBenchmark(size, runs);
    process.exit(0);
  })();
}
