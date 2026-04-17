/**
 * MySQL reference system benchmark — @noble/curves variant.
 *
 * Same structure as benchmark-mysql-native.js but verification uses
 * @noble/curves/secp256k1 (audited, used internally by ethers v6 / viem).
 * This second data point defends against the objection "maybe node:crypto
 * is unusually fast/slow".
 *
 * Install: npm install @noble/curves
 */

const mysql = require('mysql2/promise');
const crypto = require('crypto');
const { ec: EC } = require('elliptic');
const ec = new EC('secp256k1');
const { secp256k1 } = require('@noble/curves/secp256k1');
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

function verifyNoble(pubKeyHex, hashHex, sigDerHex) {
  // noble accepts DER signatures via Signature.fromDER(...).
  // lowS: false — elliptic does not enforce low-s normalization (BIP-146);
  // the signatures in the dataset are valid ECDSA but not necessarily low-s.
  // Without this option noble rejects ~50% of signatures as malleable.
  const sig = secp256k1.Signature.fromDER(sigDerHex);
  const pub = pubKeyHex;
  return secp256k1.verify(sig, hashHex, pub, { lowS: false });
}

async function initDatabase(pool) {
  const conn = await pool.getConnection();
  try {
    await conn.query(`CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      address VARCHAR(42) NOT NULL UNIQUE,
      role ENUM('Supplier','Manufacturer','Transporter','Distributor') NOT NULL,
      public_key TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB`);
    await conn.query(`CREATE TABLE IF NOT EXISTS resources (
      id INT AUTO_INCREMENT PRIMARY KEY,
      resource_name VARCHAR(255) NOT NULL,
      description TEXT, current_owner_id INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (current_owner_id) REFERENCES users(id)) ENGINE=InnoDB`);
    await conn.query(`CREATE TABLE IF NOT EXISTS ownership_records (
      id INT AUTO_INCREMENT PRIMARY KEY, resource_id INT NOT NULL,
      from_user_id INT, to_user_id INT NOT NULL,
      transferred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      record_hash VARCHAR(64) NOT NULL, signature TEXT NOT NULL,
      FOREIGN KEY (resource_id) REFERENCES resources(id),
      FOREIGN KEY (from_user_id) REFERENCES users(id),
      FOREIGN KEY (to_user_id) REFERENCES users(id)) ENGINE=InnoDB`);
    await conn.query(`CREATE TABLE IF NOT EXISTS location_history (
      id INT AUTO_INCREMENT PRIMARY KEY, resource_id INT NOT NULL,
      latitude DECIMAL(10,7), longitude DECIMAL(10,7),
      location_label VARCHAR(255), recorded_by INT NOT NULL,
      unix_timestamp BIGINT NOT NULL,
      recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      record_hash VARCHAR(64) NOT NULL, signature TEXT NOT NULL,
      FOREIGN KEY (resource_id) REFERENCES resources(id),
      FOREIGN KEY (recorded_by) REFERENCES users(id)) ENGINE=InnoDB`);
    await conn.query(`CREATE TABLE IF NOT EXISTS audit_logs (
      id INT AUTO_INCREMENT PRIMARY KEY, action_type VARCHAR(50) NOT NULL,
      resource_id INT, user_id INT NOT NULL, details TEXT,
      record_hash VARCHAR(64) NOT NULL, signature TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (resource_id) REFERENCES resources(id),
      FOREIGN KEY (user_id) REFERENCES users(id)) ENGINE=InnoDB`);
  } finally { conn.release(); }
}

async function populateDatabase(pool, dataset) {
  const conn = await pool.getConnection();
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of ['audit_logs','location_history','ownership_records','resources','users']) {
      await conn.query(`DROP TABLE IF EXISTS ${t}`);
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  } finally { conn.release(); }
  await initDatabase(pool);
  const conn2 = await pool.getConnection();
  try {
    for (const p of dataset.participants) {
      await conn2.query('INSERT INTO users (id,address,role,public_key) VALUES (?,?,?,?)',
        [p.id, p.address, p.role, p.pubKey]);
    }
    for (const r of dataset.resources) {
      await conn2.query('INSERT INTO resources (id,resource_name,description,current_owner_id) VALUES (?,?,?,?)',
        [r.id, r.name, r.description, dataset.participants[0].id]);
    }
    for (const record of dataset.records) {
      await conn2.query(`INSERT INTO location_history
        (resource_id,latitude,longitude,location_label,recorded_by,unix_timestamp,recorded_at,record_hash,signature)
        VALUES (?,?,?,?,?,?,FROM_UNIXTIME(?),?,?)`,
        [record.resourceId, record.lat, record.lng, record.locationData,
         record.actorId, record.timestamp, record.timestamp,
         record.recordHash, record.signature]);
      if (record.actionType === 'pickup' || record.actionType === 'delivery') {
        const toUser = dataset.participants[(record.actorId) % dataset.participants.length];
        const ownerData = `ownership:${record.resourceId}:${record.actorAddress}:${toUser.address}:${record.timestamp}`;
        const ownerHash = crypto.createHash('sha256').update(ownerData).digest('hex');
        const ownerSig = dataset.participants[record.actorId - 1].keyPair.sign(ownerHash).toDER('hex');
        await conn2.query(`INSERT INTO ownership_records
          (resource_id,from_user_id,to_user_id,transferred_at,record_hash,signature)
          VALUES (?,?,?,FROM_UNIXTIME(?),?,?)`,
          [record.resourceId, record.actorId, toUser.id, record.timestamp, ownerHash, ownerSig]);
      }
      const auditData = `audit:${record.actionType}:${record.resourceId}:${record.actorAddress}:${record.timestamp}`;
      const auditHash = crypto.createHash('sha256').update(auditData).digest('hex');
      const auditSig = dataset.participants[record.actorId - 1].keyPair.sign(auditHash).toDER('hex');
      await conn2.query(`INSERT INTO audit_logs
        (action_type,resource_id,user_id,details,record_hash,signature,created_at)
        VALUES (?,?,?,?,?,?,FROM_UNIXTIME(?))`,
        [record.actionType, record.resourceId, record.actorId,
         JSON.stringify({ lat: record.lat, lng: record.lng }),
         auditHash, auditSig, record.timestamp]);
    }
  } finally { conn2.release(); }
}

async function verifyIntegrity(pool) {
  const conn = await pool.getConnection();
  let verified = 0, failed = 0;
  try {
    const [loc] = await conn.query(`SELECT lh.id,lh.resource_id,lh.location_label,lh.unix_timestamp,
      lh.record_hash,lh.signature,u.address,u.public_key
      FROM location_history lh JOIN users u ON lh.recorded_by=u.id
      JOIN resources r ON lh.resource_id=r.id
      ORDER BY lh.resource_id, lh.recorded_at`);
    const [own] = await conn.query(`SELECT o.record_hash,o.signature,
      uf.public_key as from_pubkey, ut.public_key as to_pubkey
      FROM ownership_records o
      LEFT JOIN users uf ON o.from_user_id=uf.id
      JOIN users ut ON o.to_user_id=ut.id ORDER BY o.resource_id, o.transferred_at`);
    const [aud] = await conn.query(`SELECT al.record_hash,al.signature,u.public_key
      FROM audit_logs al JOIN users u ON al.user_id=u.id`);

    for (const r of loc) {
      const data = `${r.resource_id}:${r.location_label}:${r.unix_timestamp}:${r.address}`;
      const h = crypto.createHash('sha256').update(data).digest('hex');
      if (h !== r.record_hash) { failed++; continue; }
      try {
        if (verifyNoble(r.public_key, r.record_hash, r.signature)) verified++; else failed++;
      } catch { failed++; }
    }
    for (const r of own) {
      try {
        const pk = r.from_pubkey || r.to_pubkey;
        if (verifyNoble(pk, r.record_hash, r.signature)) verified++; else failed++;
      } catch { failed++; }
    }
    for (const r of aud) {
      try {
        if (verifyNoble(r.public_key, r.record_hash, r.signature)) verified++; else failed++;
      } catch { failed++; }
    }
    return { verifiedCount: verified, failedCount: failed, totalRecords: loc.length + own.length + aud.length };
  } finally { conn.release(); }
}

async function runBenchmark(numRecords, numRuns = 10) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  MYSQL NOBLE-ECDSA BENCHMARK: ${numRecords.toLocaleString()} records, ${numRuns} runs`);
  console.log(`  (verify: @noble/curves secp256k1)`);
  console.log(`${'='.repeat(60)}\n`);

  const dataset = generateDataset(numRecords);

  {
    const p = dataset.participants[0];
    const hash = crypto.createHash('sha256').update('selftest').digest('hex');
    const sigDer = p.keyPair.sign(hash).toDER('hex');
    if (!verifyNoble(p.pubKey, hash, sigDer)) {
      throw new Error('Cross-library self-test FAILED: noble cannot verify elliptic signature');
    }
    console.log('Cross-library self-test: OK');
  }

  const pool = mysql.createPool(DB_CONFIG);
  await pool.query('SELECT 1');
  console.log('Populating database...');
  await populateDatabase(pool, dataset);

  const times = [];
  for (let w = 0; w < 2; w++) await verifyIntegrity(pool);
  for (let run = 0; run < numRuns; run++) {
    try { await pool.query('RESET QUERY CACHE'); } catch {}
    const t0 = process.hrtime.bigint();
    const r = await verifyIntegrity(pool);
    const t1 = process.hrtime.bigint();
    const ms = Number(t1 - t0) / 1e6;
    times.push(ms);
    process.stdout.write(`  Run ${String(run+1).padStart(2)}: ${(ms/1000).toFixed(3).padStart(8)} s | ${r.verifiedCount}/${r.totalRecords}\n`);
  }

  const mean = times.reduce((a,b)=>a+b,0)/times.length;
  const sorted = [...times].sort((a,b)=>a-b);
  const median = sorted[Math.floor(sorted.length/2)];
  const stddev = Math.sqrt(times.reduce((s,t)=>s+(t-mean)**2,0)/(times.length-1));
  console.log(`\n  Mean: ${(mean/1000).toFixed(3)} s, Median: ${(median/1000).toFixed(3)} s, StdDev: ${(stddev/1000).toFixed(3)} s`);
  await pool.end();
  return { system:'MySQL (JOIN + @noble/curves ECDSA)', numRecords, numRuns,
    meanMs:mean, medianMs:median, stddevMs:stddev,
    minMs:Math.min(...times), maxMs:Math.max(...times), allRuns:times };
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
