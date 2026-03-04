/**
 * Synthetic supply chain data generator.
 *
 * Each order has 8–12 status history entries. Entries include:
 * resourceId, location (lat/lng), timestamp, actor address.
 * All records are ECDSA-signed with secp256k1 keypairs.
 */

const crypto = require('crypto');
const { ec: EC } = require('elliptic');
const ec = new EC('secp256k1');

function generateDataset(numRecords, seed = 42) {
  // Seeded PRNG for reproducibility
  let state = seed;
  function rand() {
    state = (state * 1664525 + 1013904223) & 0xFFFFFFFF;
    return (state >>> 0) / 0xFFFFFFFF;
  }

  // Participant keypairs
  const participants = [];
  const roles = ['Supplier', 'Manufacturer', 'Transporter', 'Distributor'];
  for (let i = 0; i < 20; i++) {
    const keyPair = ec.genKeyPair();
    const privKey = keyPair.getPrivate('hex');
    const pubKey = keyPair.getPublic('hex');
    const pubKeyBytes = Buffer.from(pubKey, 'hex').slice(1);
    const addressHash = crypto.createHash('sha256').update(pubKeyBytes).digest('hex');
    const address = '0x' + addressHash.slice(0, 40);

    participants.push({
      id: i + 1,
      address,
      role: roles[i % 4],
      keyPair,
      privKey,
      pubKey,
    });
  }

  // Generate records grouped into orders (8–12 events each)
  const records = [];
  const resources = [];
  let baseTimestamp = Math.floor(Date.now() / 1000) - numRecords * 100;
  let orderId = 0;

  while (records.length < numRecords) {
    orderId++;
    const resourceId = orderId;
    const maxEvents = 8 + Math.floor(rand() * 5);
    const eventsToAdd = Math.min(maxEvents, numRecords - records.length);

    resources.push({
      id: resourceId,
      name: `Product-${resourceId}`,
      description: `Supply chain item #${resourceId}`,
    });

    for (let e = 0; e < eventsToAdd; e++) {
      const participant = participants[Math.floor(rand() * participants.length)];
      const lat = (48.0 + rand() * 4).toFixed(7);
      const lng = (30.0 + rand() * 10).toFixed(7);
      const locationData = `${lat},${lng}`;
      const timestamp = baseTimestamp + orderId * 100 + e * 10;

      const recordData = `${resourceId}:${locationData}:${timestamp}:${participant.address}`;
      const recordHash = crypto.createHash('sha256').update(recordData).digest('hex');
      const signature = participant.keyPair.sign(recordHash);
      const signatureHex = signature.toDER('hex');

      const actionTypes = [
        'order_created', 'production_started', 'production_complete',
        'pickup', 'checkpoint', 'checkpoint', 'checkpoint',
        'delivery', 'receipt_confirmed', 'quality_check',
        'warehouse_entry', 'final_delivery',
      ];

      records.push({
        resourceId,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        locationData,
        timestamp,
        actorId: participant.id,
        actorAddress: participant.address,
        actorRole: participant.role,
        actorPubKey: participant.pubKey,
        signature: signatureHex,
        recordHash,
        actionType: actionTypes[e % actionTypes.length],
      });
    }
  }

  return { participants, resources, records, numOrders: orderId };
}

function signRecord(keyPair, data) {
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  const sig = keyPair.sign(hash);
  return { hash, signature: sig.toDER('hex'), sigObj: sig };
}

function verifySignature(pubKeyHex, hash, signatureDER) {
  try {
    const key = ec.keyFromPublic(pubKeyHex, 'hex');
    return key.verify(hash, signatureDER);
  } catch {
    return false;
  }
}

module.exports = { generateDataset, signRecord, verifySignature };
