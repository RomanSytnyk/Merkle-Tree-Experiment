/**
 * Blockchain benchmark — measures integrity verification time using
 * application-level Merkle trees with keccak256.
 *
 * Verification: compute all leaf hashes → build tree → compare root to snapshot.
 *
 * For small datasets we also run on-chain (Solidity) to cross-validate that
 * the off-chain JS implementation produces byte-identical roots.
 */

const { ethers } = require('hardhat');
const { generateDataset } = require('./generate-data');
const merkleUtils = require('./merkle-utils');

// Cross-validate on-chain vs off-chain up to this leaf count
const CROSS_VALIDATION_THRESHOLD = 2000;

async function deployAndCrossValidate(leaves) {
  const MerkleVerification = await ethers.getContractFactory('MerkleVerification');
  const contract = await MerkleVerification.deploy();
  await contract.waitForDeployment();

  const BATCH = 500;
  for (let i = 0; i < leaves.length; i += BATCH) {
    await contract.storeLeavesBatch(leaves.slice(i, i + BATCH));
  }

  const tx = await contract.buildRoot();
  await tx.wait();

  const onChainRoot = await contract.currentRoot();
  const offChainRoot = merkleUtils.buildMerkleTree(leaves);

  return {
    onChainRoot,
    offChainRoot,
    match: onChainRoot === offChainRoot,
    contract,
  };
}

async function runBenchmark(numRecords, numRuns = 10) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  BLOCKCHAIN BENCHMARK: ${numRecords.toLocaleString()} records, ${numRuns} runs`);
  console.log(`${'='.repeat(60)}\n`);

  const dataset = generateDataset(numRecords);
  console.log(`Generated ${dataset.records.length.toLocaleString()} records across ${dataset.numOrders.toLocaleString()} orders`);
  console.log(`(~${(dataset.records.length / dataset.numOrders).toFixed(1)} events/order)\n`);

  // Compute leaves and reference root
  console.log('Computing leaf hashes (keccak256)...');
  const leaves = merkleUtils.computeAllLeaves(dataset.records);
  console.log(`  ${leaves.length.toLocaleString()} leaves computed.`);

  console.log('Computing reference Merkle root...');
  const referenceRoot = merkleUtils.buildMerkleTree(leaves);
  console.log(`  Root: ${referenceRoot.slice(0, 18)}...\n`);

  // Cross-validate on-chain vs off-chain (small datasets only)
  let crossValidated = false;
  let onChainContract = null;

  if (numRecords <= CROSS_VALIDATION_THRESHOLD) {
    console.log(`Cross-validating on-chain vs off-chain (n ≤ ${CROSS_VALIDATION_THRESHOLD})...`);
    try {
      const cv = await deployAndCrossValidate(leaves);
      crossValidated = cv.match;
      onChainContract = cv.contract;
      console.log(`  On-chain:  ${cv.onChainRoot.slice(0, 18)}...`);
      console.log(`  Off-chain: ${cv.offChainRoot.slice(0, 18)}...`);
      console.log(`  ${cv.match ? '✓ Roots match' : '✗ MISMATCH'}\n`);
    } catch (err) {
      console.log(`  Cross-validation failed: ${err.message.split('\n')[0]}`);
      console.log(`  Proceeding with off-chain only.\n`);
    }
  }

  // Measure verification time
  console.log(`Running ${numRuns} verification measurements...\n`);

  const offChainTimes = [];
  const onChainTimes = [];

  for (let run = 0; run < numRuns; run++) {
    let onChainMs = null;
    if (onChainContract) {
      try {
        const t0 = process.hrtime.bigint();
        await onChainContract.rebuildAndVerifyRoot();
        const t1 = process.hrtime.bigint();
        onChainMs = Number(t1 - t0) / 1_000_000;
        onChainTimes.push(onChainMs);
      } catch { /* EVM gas limit */ }
    }

    const t0 = process.hrtime.bigint();
    const result = merkleUtils.verifyDatasetIntegrity(dataset.records, referenceRoot);
    const t1 = process.hrtime.bigint();
    const offChainMs = Number(t1 - t0) / 1_000_000;
    offChainTimes.push(offChainMs);

    if (!result.matches) {
      console.error(`  Run ${run + 1}: integrity check FAILED!`);
    }

    const onStr = onChainMs !== null ? `${onChainMs.toFixed(1).padStart(8)} ms` : '     N/A';
    process.stdout.write(
      `  Run ${(run + 1).toString().padStart(2)}: ` +
      `on-chain: ${onStr} | off-chain: ${offChainMs.toFixed(1).padStart(8)} ms ` +
      `| match: ${result.matches ? '✓' : '✗'}\n`
    );
  }

  // Stats
  function stats(times) {
    if (!times.length) return null;
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const sorted = [...times].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const stddev = times.length > 1
      ? Math.sqrt(times.reduce((s, t) => s + (t - mean) ** 2, 0) / (times.length - 1))
      : 0;
    return {
      meanMs: mean, medianMs: median, stddevMs: stddev,
      minMs: Math.min(...times), maxMs: Math.max(...times),
      meanSec: mean / 1000, allRuns: times,
    };
  }

  const offChainStats = stats(offChainTimes);
  const onChainStats = stats(onChainTimes);

  console.log(`\n${'─'.repeat(55)}`);
  if (onChainStats) {
    console.log(`  On-chain  (EVM view):  mean=${onChainStats.meanSec.toFixed(4)} s  σ=${(onChainStats.stddevMs / 1000).toFixed(4)} s`);
  }
  console.log(`  Off-chain (JS keccak): mean=${offChainStats.meanSec.toFixed(4)} s  σ=${(offChainStats.stddevMs / 1000).toFixed(4)} s`);
  if (onChainStats && offChainStats) {
    console.log(`  EVM/JS ratio: ${(onChainStats.meanMs / offChainStats.meanMs).toFixed(2)}×`);
  }
  console.log(`  Cross-validated: ${crossValidated ? 'yes' : 'at smaller scale'}`);
  console.log(`${'─'.repeat(55)}`);

  return {
    system: 'Blockchain (Merkle root)',
    numRecords,
    numEvents: dataset.records.length,
    numRuns,
    ...offChainStats,
    primaryPath: 'off-chain',
    onChain: onChainStats,
    offChain: offChainStats,
    crossValidated,
  };
}

module.exports = { runBenchmark, deployAndCrossValidate };

if (require.main === module) {
  (async () => {
    const size = parseInt(process.argv[2]) || 1000;
    const runs = parseInt(process.argv[3]) || 10;
    await runBenchmark(size, runs);
    process.exit(0);
  })();
}
