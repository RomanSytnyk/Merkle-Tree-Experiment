/**
 * O(log n) Merkle proof verification benchmark.
 *
 * Measures:
 *   1. Off-chain proof generation time
 *   2. Off-chain proof verification time
 *   3. On-chain proof verification gas cost (via Hardhat EVM)
 *
 * For each dataset size, generates a single proof for a randomly selected leaf
 * and measures verification across multiple runs.
 */

const { ethers } = require('hardhat');
const { generateDataset } = require('./generate-data');
const merkleUtils = require('./merkle-utils');
const fs = require('fs');
const path = require('path');

const numRuns = parseInt(process.env.PROOF_RUNS || '100');
const WARMUP_RUNS = 2;

async function runProofBenchmark() {
  const datasetSizes = [1000, 10000, 100000];

  console.log('\n' + '='.repeat(66));
  console.log('  O(log n) MERKLE PROOF VERIFICATION BENCHMARK');
  console.log('='.repeat(66));
  console.log(`  Runs per test: ${numRuns} (first ${WARMUP_RUNS} discarded as warmup)`);
  console.log(`  Date: ${new Date().toISOString()}\n`);

  const allResults = [];

  for (const size of datasetSizes) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  Dataset: ${size.toLocaleString()} records`);
    console.log(`${'─'.repeat(60)}\n`);

    // Generate dataset and build tree with layers
    const dataset = generateDataset(size);
    const leaves = merkleUtils.computeAllLeaves(dataset.records);
    const { root, layers } = merkleUtils.buildMerkleTreeWithLayers(leaves);
    const proofDepth = layers.length - 1;

    console.log(`  Leaves: ${leaves.length}, Tree depth: ${proofDepth}`);

    // Select a leaf near the middle for a representative proof
    const targetIndex = Math.floor(leaves.length / 2);
    const targetLeaf = leaves[targetIndex];

    // Generate proof
    const proofGenStart = process.hrtime.bigint();
    const proof = merkleUtils.generateProof(layers, targetIndex);
    const proofGenEnd = process.hrtime.bigint();
    const proofGenUs = Number(proofGenEnd - proofGenStart) / 1000;

    console.log(`  Proof length: ${proof.length} hashes (= log₂(${leaves.length}) ≈ ${Math.ceil(Math.log2(leaves.length))})`);
    console.log(`  Proof generation: ${proofGenUs.toFixed(1)} µs`);

    // Verify proof correctness off-chain
    const valid = merkleUtils.verifyProof(proof, root, targetLeaf);
    console.log(`  Proof valid: ${valid}`);
    if (!valid) {
      console.error('  ERROR: Proof verification failed!');
      continue;
    }

    // ── Off-chain verification benchmark ──
    console.log(`\n  Off-chain verification (${numRuns} runs)...`);
    const offChainTimes = [];

    for (let run = 0; run < numRuns; run++) {
      const t0 = process.hrtime.bigint();
      merkleUtils.verifyProof(proof, root, targetLeaf);
      const t1 = process.hrtime.bigint();
      offChainTimes.push(Number(t1 - t0) / 1000); // microseconds
    }

    // Drop warmup
    const offChainClean = offChainTimes.slice(WARMUP_RUNS);
    const offMean = offChainClean.reduce((a, b) => a + b, 0) / offChainClean.length;
    const offStddev = Math.sqrt(
      offChainClean.reduce((s, x) => s + (x - offMean) ** 2, 0) / (offChainClean.length - 1)
    );

    console.log(`  Off-chain: mean=${offMean.toFixed(1)} µs  σ=${offStddev.toFixed(1)} µs`);

    // ── On-chain verification benchmark (Hardhat EVM) ──
    let onChainGas = null;
    let onChainTimes = [];

    // Only deploy for cross-validation at smallest size to save time;
    // gas is deterministic so one measurement suffices
    if (size <= 100000) {
      console.log(`\n  Deploying contract for on-chain verification...`);

      const MerkleVerification = await ethers.getContractFactory('MerkleVerification');
      const contract = await MerkleVerification.deploy();
      await contract.waitForDeployment();

      // Verify on-chain
      const onChainValid = await contract.verifyMerkleProof(proof, root, targetLeaf);
      console.log(`  On-chain verification result: ${onChainValid}`);

      // Measure gas via estimateGas
      onChainGas = await contract.verifyMerkleProof.estimateGas(proof, root, targetLeaf);
      console.log(`  On-chain gas: ${onChainGas.toString()}`);

      // Measure wall-clock time for on-chain view call
      for (let run = 0; run < Math.min(numRuns, 20); run++) {
        const t0 = process.hrtime.bigint();
        await contract.verifyMerkleProof(proof, root, targetLeaf);
        const t1 = process.hrtime.bigint();
        onChainTimes.push(Number(t1 - t0) / 1000); // µs
      }

      const onClean = onChainTimes.slice(WARMUP_RUNS);
      const onMean = onClean.reduce((a, b) => a + b, 0) / onClean.length;
      console.log(`  On-chain view call: mean=${(onMean / 1000).toFixed(2)} ms (${onClean.length} runs after warmup)`);
    }

    allResults.push({
      size,
      proofDepth,
      proofLength: proof.length,
      proofGenUs,
      offChain: {
        meanUs: offMean,
        stddevUs: offStddev,
        runs: offChainClean.length,
      },
      onChain: onChainGas ? {
        gas: Number(onChainGas),
        meanUs: onChainTimes.length > WARMUP_RUNS
          ? onChainTimes.slice(WARMUP_RUNS).reduce((a, b) => a + b, 0) / (onChainTimes.length - WARMUP_RUNS)
          : null,
      } : null,
    });
  }

  // ── Summary ──
  console.log('\n\n' + '='.repeat(66));
  console.log('  PROOF VERIFICATION SUMMARY');
  console.log('='.repeat(66) + '\n');

  console.log('  Dataset    | Proof Depth | Off-chain (mean) | On-chain Gas');
  console.log('  ' + '-'.repeat(62));

  for (const r of allResults) {
    const offStr = r.offChain.meanUs < 1000
      ? `${r.offChain.meanUs.toFixed(1)} µs`
      : `${(r.offChain.meanUs / 1000).toFixed(2)} ms`;
    const gasStr = r.onChain ? r.onChain.gas.toLocaleString() : 'N/A';
    console.log(`  ${r.size.toLocaleString().padStart(9)}  | ${String(r.proofDepth).padStart(11)} | ${offStr.padStart(16)} | ${gasStr.padStart(12)}`);
  }

  // Save results
  const outputPath = path.join(__dirname, '..', 'results', 'hardhat', 'proof-benchmark.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    meta: {
      date: new Date().toISOString(),
      numRuns,
      warmupDropped: WARMUP_RUNS,
      platform: `${process.platform} ${process.arch}`,
      nodeVersion: process.version,
    },
    results: allResults,
  }, null, 2));

  console.log(`\n  Results saved to: ${outputPath}\n`);
}

runProofBenchmark()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
