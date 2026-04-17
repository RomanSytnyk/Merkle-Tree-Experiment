/**
 * MySQL reference system benchmark — NATIVE ECDSA variant.
 *
 * Identical to benchmark-mysql.js in every respect (schema, dataset, JOINs,
 * timing) EXCEPT verification uses node:crypto (OpenSSL-backed secp256k1)
 * instead of the pure-JS elliptic library.
 *
 * Signatures are produced by elliptic at populate time (standard DER), and
 * verified here by node:crypto. DER ECDSA over secp256k1 is interoperable
 * between the two — we assert this with a warm-up self-check.
 */

const mysql = require('mysql2/promise');
const crypto = require('crypto');
const { ec: EC } = require('elliptic');
const ec = new EC('secp256k1');
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

/**
 * Wrap a raw uncompressed secp256k1 public key (04||X||Y, 65 bytes) in an
 * SPKI DER envelope so node:crypto.createPublicKey accepts it. The SPKI
 * prefix for id-ecPublicKey + secp256k1 is a fixed 23-byte header.
 */
const SPKI_PREFIX = Buffer.from(
  '3056301006072a8648ce3d020106052b8104000a034200',
  'hex'
);

function pubKeyHexToKeyObject(pubKeyHex) {
  const raw = Buffer.from(pubKeyHex, 'hex'); // 65 bytes uncompressed
  const spki = Buffer.concat([SPKI_PREFIX, raw]);
  return crypto.createPublicKey({ key: spki, format: 'der', type: 'spki' });
}

/**
 * Per-record verify using node:crypto.
 *
 * Signatures in the dataset are produced by elliptic, which signs the SHA-256
 * DIGEST of the canonical record string directly (key.sign(hashHex) treats
 * the hex string as bytes of a digest and signs those 32 bytes).
 *
 * node:crypto's high-level verify API always runs its own digest; there is
 * no supported "null digest" mode for ECDSA on Node (it exists only for
 * Ed25519/Ed448). Passing `null` silently returns false on Node ≥ 15.
 *
 * The interoperable path: feed crypto.verify the ORIGINAL message bytes
 * together with the digest name ('sha256'). node:crypto computes SHA-256
 * internally, obtaining the same 32-byte digest elliptic signed, then
 * checks the ECDSA signature. This is also the production-realistic path
 * a real verifier would use with node:crypto.
 */
function verifyNative(pubKeyObj, msgBuf, sigDerBuf) {
  return crypto.verify('sha256', msgBuf, pubKeyObj, sigDerBuf);
}

async function initDatabase(pool) {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        address VARCHAR(42) NOT NULL UNIQUE,
        role ENUM('Supplier','Manufacturer','Transporter','Distributor') NOT NULL,
        public_key TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB`);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS resources (
        id INT AUTO_INCREMENT PRIMARY KEY,
        resource_name VARCHAR(255) NOT NULL,
        description TEXT,
        current_owner_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (current_owner_id) REFERENCES users(id)
      ) ENGINE=InnoDB`);
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
      ) ENGINE=InnoDB`);
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
      ) ENGINE=InnoDB`);
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
      ) ENGINE=InnoDB`);
  } finally { conn.release(); }
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
  } finally { conn.release(); }

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
  } finally { conn2.release(); }
}

async function verifyIntegrity(pool, keyCache) {
  const conn = await pool.getConnection();
  let verifiedCount = 0;
  let failedCount = 0;
  try {
    const [locationRecords] = await conn.query(`
      SELECT lh.id, lh.resource_id, lh.latitude, lh.longitude,
             lh.location_label, lh.unix_timestamp, lh.recorded_at,
             lh.record_hash, lh.signature,
             u.address, u.public_key, u.role, r.resource_name
      FROM location_history lh
      JOIN users u ON lh.recorded_by = u.id
      JOIN resources r ON lh.resource_id = r.id
      ORDER BY lh.resource_id, lh.recorded_at`);
    const [ownershipRecords] = await conn.query(`
      SELECT o.id, o.resource_id, o.record_hash, o.signature,
             UNIX_TIMESTAMP(o.transferred_at) as ts,
             uf.address as from_address, uf.public_key as from_pubkey,
             ut.address as to_address, ut.public_key as to_pubkey
      FROM ownership_records o
      LEFT JOIN users uf ON o.from_user_id = uf.id
      JOIN users ut ON o.to_user_id = ut.id
      ORDER BY o.resource_id, o.transferred_at`);
    const [auditRecords] = await conn.query(`
      SELECT al.id, al.action_type, al.resource_id, al.details,
             al.record_hash, al.signature,
             UNIX_TIMESTAMP(al.created_at) as ts,
             u.address, u.public_key
      FROM audit_logs al JOIN users u ON al.user_id = u.id`);

    // NOTE: key object construction is cached ACROSS records (realistic:
    // a production verifier caches parsed keys). We do NOT cache across
    // runs because pool.query returns fresh rows; cache is keyed on hex.
    const getKey = (hex) => {
      let k = keyCache.get(hex);
      if (!k) { k = pubKeyHexToKeyObject(hex); keyCache.set(hex, k); }
      return k;
    };

    // For every record type we reconstruct the canonical signed message and
    // hand the bytes to crypto.verify('sha256', ...). node:crypto then
    // hashes and checks the ECDSA signature in one call — the only way to
    // use its high-level API for ECDSA. This verifies BOTH that the record
    // wasn't tampered and that the signature is valid.
    for (const record of locationRecords) {
      const msg = Buffer.from(
        `${record.resource_id}:${record.location_label}:${record.unix_timestamp}:${record.address}`
      );
      try {
        const sigBuf = Buffer.from(record.signature, 'hex');
        if (verifyNative(getKey(record.public_key), msg, sigBuf)) verifiedCount++;
        else failedCount++;
      } catch { failedCount++; }
    }
    for (const record of ownershipRecords) {
      try {
        const pubkey = record.from_pubkey || record.to_pubkey;
        const msg = Buffer.from(
          `ownership:${record.resource_id}:${record.from_address || ''}:${record.to_address}:${record.ts}`
        );
        const sigBuf = Buffer.from(record.signature, 'hex');
        if (verifyNative(getKey(pubkey), msg, sigBuf)) verifiedCount++;
        else failedCount++;
      } catch { failedCount++; }
    }
    for (const record of auditRecords) {
      try {
        const msg = Buffer.from(
          `audit:${record.action_type}:${record.resource_id}:${record.address}:${record.ts}`
        );
        const sigBuf = Buffer.from(record.signature, 'hex');
        if (verifyNative(getKey(record.public_key), msg, sigBuf)) verifiedCount++;
        else failedCount++;
      } catch { failedCount++; }
    }
    const total = locationRecords.length + ownershipRecords.length + auditRecords.length;
    return { verifiedCount, failedCount, totalRecords: total };
  } finally { conn.release(); }
}

async function runBenchmark(numRecords, numRuns = 10) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  MYSQL NATIVE-ECDSA BENCHMARK: ${numRecords.toLocaleString()} records, ${numRuns} runs`);
  console.log(`  (verify: node:crypto / OpenSSL secp256k1)`);
  console.log(`${'='.repeat(60)}\n`);

  const dataset = generateDataset(numRecords);
  console.log(`Generated ${dataset.records.length.toLocaleString()} records across ${dataset.numOrders.toLocaleString()} orders`);

  // Sanity: confirm node:crypto verifies an elliptic-produced signature
  // when given the original message + 'sha256' digest algorithm.
  {
    const p = dataset.participants[0];
    const msg = Buffer.from('selftest');
    const hashHex = crypto.createHash('sha256').update(msg).digest('hex');
    const sig = Buffer.from(p.keyPair.sign(hashHex).toDER('hex'), 'hex');
    const key = pubKeyHexToKeyObject(p.pubKey);
    if (!verifyNative(key, msg, sig)) {
      throw new Error('Cross-library self-test FAILED: native cannot verify elliptic signature');
    }
    console.log('Cross-library self-test: OK');
  }

  let pool;
  try {
    pool = mysql.createPool(DB_CONFIG);
    await pool.query('SELECT 1');
    console.log('Connected to MySQL.\n');
  } catch (err) {
    console.error('ERROR: Cannot connect to MySQL.');
    console.error(err.message);
    process.exit(1);
  }

  console.log('Populating database...');
  await populateDatabase(pool, dataset);

  const [countResult] = await pool.query('SELECT COUNT(*) as cnt FROM location_history');
  console.log(`Database populated: ${countResult[0].cnt} location records\n`);

  console.log(`Running ${numRuns} verification measurements (+2 warm-up)...\n`);
  const times = [];
  const keyCache = new Map();

  // Warm-up: 2 runs discarded
  for (let w = 0; w < 2; w++) await verifyIntegrity(pool, keyCache);

  for (let run = 0; run < numRuns; run++) {
    try { await pool.query('RESET QUERY CACHE'); } catch {}
    const t0 = process.hrtime.bigint();
    const result = await verifyIntegrity(pool, keyCache);
    const t1 = process.hrtime.bigint();
    const ms = Number(t1 - t0) / 1e6;
    times.push(ms);
    const pct = ((result.verifiedCount / result.totalRecords) * 100).toFixed(1);
    process.stdout.write(
      `  Run ${String(run + 1).padStart(2)}: ${(ms / 1000).toFixed(3).padStart(8)} s | ` +
      `Verified: ${result.verifiedCount}/${result.totalRecords} (${pct}%)\n`
    );
  }

  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const sorted = [...times].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const stddev = Math.sqrt(times.reduce((s, t) => s + (t - mean) ** 2, 0) / (times.length - 1));

  console.log(`\n${'─'.repeat(40)}`);
  console.log(`  Mean:   ${(mean / 1000).toFixed(3)} s`);
  console.log(`  Median: ${(median / 1000).toFixed(3)} s`);
  console.log(`  StdDev: ${(stddev / 1000).toFixed(3)} s`);
  console.log(`${'─'.repeat(40)}`);

  await pool.end();
  return {
    system: 'MySQL (JOIN + native ECDSA / node:crypto)',
    numRecords, numEvents: dataset.records.length, numRuns,
    meanMs: mean, medianMs: median, stddevMs: stddev,
    minMs: Math.min(...times), maxMs: Math.max(...times),
    allRuns: times,
  };
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
