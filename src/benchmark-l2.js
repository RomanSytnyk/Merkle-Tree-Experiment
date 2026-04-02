/**
 * L2 testnet benchmark — measures deployment and integrity verification
 * on a real Arbitrum Sepolia network.
 *
 * Unlike the Hardhat benchmark (auto-mining, zero latency, unlimited gas),
 * this script operates under real network conditions:
 *   - Actual gas costs and limits
 *   - Network latency for tx confirmations
 *   - Block production timing
 *
 * Measurements:
 *   1. Contract deployment gas cost
 *   2. Leaf storage gas cost (batched)
 *   3. Tree construction gas cost
 *   4. Off-chain integrity verification time (same as Hardhat benchmark)
 *   5. On-chain view call verification time (includes RPC round-trip)
 *
 * Usage:
 *   DEPLOYER_PRIVATE_KEY=0x... npx hardhat run src/benchmark-l2.js --network arbitrumSepolia
 *
 * Environment:
 *   DEPLOYER_PRIVATE_KEY  — funded Arbitrum Sepolia wallet (required)
 *   ARBITRUM_SEPOLIA_RPC  — custom RPC endpoint (optional)
 *   L2_DATASET_SIZE       — number of records (default: 100)
 *   L2_NUM_RUNS           — verification runs (default: 10)
 *   L2_BATCH_SIZE         — leaves per tx (default: 100)
 */

const { ethers } = require('hardhat');
const { generateDataset } = require('./generate-data');
const fs = require('fs');
const path = require('path');

// Standalone Merkle utils that don't require hardhat runtime for ethers
// We re-implement the core functions here using the hardhat-injected ethers
function computeLeaf(resourceId, locationData, timestamp, actorAddress) {
  const locationBytes = ethers.toUtf8Bytes(locationData);
  return ethers.solidityPackedKeccak256(
    ['uint256', 'bytes', 'uint256', 'address'],
    [resourceId, locationBytes, timestamp, actorAddress]
  );
}

function computeAllLeaves(records) {
  return records.map(r => computeLeaf(r.resourceId, r.locationData, r.timestamp, r.actorAddress));
}

function buildMerkleTree(leafHashes) {
  let n = leafHashes.length;
  if (n === 0) return ethers.ZeroHash;
  if (n === 1) return leafHashes[0];

  let currentLevel = [...leafHashes];

  while (n > 1) {
    const nextN = Math.floor((n + 1) / 2);
    const nextLevel = new Array(nextN);

    for (let i = 0; i < Math.floor(n / 2); i++) {
      let left = currentLevel[2 * i];
      let right = currentLevel[2 * i + 1];
      if (BigInt(left) > BigInt(right)) {
        [left, right] = [right, left];
      }
      nextLevel[i] = ethers.solidityPackedKeccak256(
        ['bytes32', 'bytes32'],
        [left, right]
      );
    }

    if (n % 2 === 1) {
      nextLevel[nextN - 1] = currentLevel[n - 1];
    }

    currentLevel = nextLevel;
    n = nextN;
  }

  return currentLevel[0];
}

function verifyDatasetIntegrity(records, expectedRoot) {
  const leaves = computeAllLeaves(records);
  const root = buildMerkleTree(leaves);
  return { root, matches: root === expectedRoot };
}

async function runL2Benchmark() {
  const numRecords = parseInt(process.env.L2_DATASET_SIZE || '100');
  const numRuns = parseInt(process.env.L2_NUM_RUNS || '10');
  const BATCH_SIZE = parseInt(process.env.L2_BATCH_SIZE || '100');

  console.log('\n' + '='.repeat(66));
  console.log('  ARBITRUM SEPOLIA L2 BENCHMARK');
  console.log('='.repeat(66));

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  const network = await ethers.provider.getNetwork();

  console.log(`  Network:    ${network.name} (chainId: ${network.chainId})`);
  console.log(`  Deployer:   ${deployer.address}`);
  console.log(`  Balance:    ${ethers.formatEther(balance)} ETH`);
  console.log(`  Records:    ${numRecords.toLocaleString()}`);
  console.log(`  Runs:       ${numRuns}`);
  console.log(`  Batch size: ${BATCH_SIZE}\n`);

  if (balance === 0n) {
    console.error('ERROR: Deployer wallet has no ETH.');
    console.error('Get Arbitrum Sepolia ETH from:');
    console.error('  https://faucet.quicknode.com/arbitrum/sepolia');
    console.error('  https://www.alchemy.com/faucets/arbitrum-sepolia');
    process.exit(1);
  }

  // Generate dataset
  console.log('Generating dataset...');
  const dataset = generateDataset(numRecords);
  const leaves = computeAllLeaves(dataset.records);
  const referenceRoot = buildMerkleTree(leaves);
  console.log(`  ${leaves.length} leaves, reference root: ${referenceRoot.slice(0, 18)}...\n`);

  // ── Deploy contract ──
  console.log('Deploying MerkleVerification to Arbitrum Sepolia...');
  const MerkleVerification = await ethers.getContractFactory('MerkleVerification');
  const deployTx = await MerkleVerification.deploy();
  const contract = await deployTx.waitForDeployment();
  const deployReceipt = await deployTx.deploymentTransaction().wait();

  const contractAddress = await contract.getAddress();
  console.log(`  Contract:   ${contractAddress}`);
  console.log(`  Deploy tx:  ${deployReceipt.hash}`);
  console.log(`  Gas used:   ${deployReceipt.gasUsed.toString()}`);
  console.log(`  Gas price:  ${ethers.formatUnits(deployReceipt.gasPrice || 0n, 'gwei')} gwei\n`);

  // ── Store leaves in batches ──
  console.log(`Storing ${leaves.length} leaves in batches of ${BATCH_SIZE}...`);
  let totalStorageGas = 0n;
  const storageTxHashes = [];

  for (let i = 0; i < leaves.length; i += BATCH_SIZE) {
    const batch = leaves.slice(i, i + BATCH_SIZE);
    const tx = await contract.storeLeavesBatch(batch);
    const receipt = await tx.wait();
    totalStorageGas += receipt.gasUsed;
    storageTxHashes.push(receipt.hash);
    process.stdout.write(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(leaves.length / BATCH_SIZE)}: ${receipt.gasUsed.toString()} gas\n`);
  }
  console.log(`  Total storage gas: ${totalStorageGas.toString()}\n`);

  // ── Build tree on-chain ──
  console.log('Building Merkle tree on-chain...');
  const buildTx = await contract.buildRoot();
  const buildReceipt = await buildTx.wait();
  const onChainRoot = await contract.currentRoot();
  console.log(`  Build gas:   ${buildReceipt.gasUsed.toString()}`);
  console.log(`  On-chain root: ${onChainRoot.slice(0, 18)}...`);
  console.log(`  Roots match:   ${onChainRoot === referenceRoot ? 'YES' : 'NO'}\n`);

  // ── Measure off-chain verification (same as Hardhat benchmark) ──
  console.log(`Running ${numRuns} off-chain verification measurements...\n`);
  const offChainTimes = [];

  for (let run = 0; run < numRuns; run++) {
    const t0 = process.hrtime.bigint();
    const result = verifyDatasetIntegrity(dataset.records, referenceRoot);
    const t1 = process.hrtime.bigint();
    const ms = Number(t1 - t0) / 1_000_000;
    offChainTimes.push(ms);
    process.stdout.write(
      `  Run ${(run + 1).toString().padStart(2)}: ${ms.toFixed(1).padStart(8)} ms | match: ${result.matches ? 'Y' : 'N'}\n`
    );
  }

  // ── Measure on-chain view call (includes RPC round-trip) ──
  console.log(`\nRunning ${numRuns} on-chain view call measurements (includes RPC latency)...\n`);
  const onChainTimes = [];

  for (let run = 0; run < numRuns; run++) {
    const t0 = process.hrtime.bigint();
    await contract.rebuildAndVerifyRoot();
    const t1 = process.hrtime.bigint();
    const ms = Number(t1 - t0) / 1_000_000;
    onChainTimes.push(ms);
    process.stdout.write(
      `  Run ${(run + 1).toString().padStart(2)}: ${ms.toFixed(1).padStart(8)} ms\n`
    );
  }

  // ── Stats ──
  function stats(times) {
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const sorted = [...times].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const stddev = times.length > 1
      ? Math.sqrt(times.reduce((s, t) => s + (t - mean) ** 2, 0) / (times.length - 1))
      : 0;
    return { meanMs: mean, medianMs: median, stddevMs: stddev, allRuns: times };
  }

  const offStats = stats(offChainTimes);
  const onStats = stats(onChainTimes);

  // ── Final balance ──
  const finalBalance = await ethers.provider.getBalance(deployer.address);
  const ethSpent = ethers.formatEther(balance - finalBalance);

  // ── Report ──
  console.log(`\n${'─'.repeat(60)}`);
  console.log('  L2 BENCHMARK RESULTS');
  console.log(`${'─'.repeat(60)}`);
  console.log(`  Network:           Arbitrum Sepolia (chainId ${network.chainId})`);
  console.log(`  Contract:          ${contractAddress}`);
  console.log(`  Dataset:           ${numRecords.toLocaleString()} records (${leaves.length} leaves)`);
  console.log(`  Roots match:       ${onChainRoot === referenceRoot}`);
  console.log();
  console.log('  Gas costs:');
  console.log(`    Deploy:          ${deployReceipt.gasUsed.toString()}`);
  console.log(`    Leaf storage:    ${totalStorageGas.toString()}`);
  console.log(`    Tree build:      ${buildReceipt.gasUsed.toString()}`);
  console.log(`    Total:           ${(deployReceipt.gasUsed + totalStorageGas + buildReceipt.gasUsed).toString()}`);
  console.log(`    ETH spent:       ${ethSpent} ETH`);
  console.log();
  console.log('  Verification time:');
  console.log(`    Off-chain (JS):  mean=${(offStats.meanMs).toFixed(1)} ms  σ=${offStats.stddevMs.toFixed(1)} ms`);
  console.log(`    On-chain (view): mean=${(onStats.meanMs).toFixed(1)} ms  σ=${onStats.stddevMs.toFixed(1)} ms`);
  console.log(`      (on-chain includes RPC round-trip latency)`);
  console.log(`${'─'.repeat(60)}\n`);

  // ── Save results ──
  const results = {
    meta: {
      date: new Date().toISOString(),
      network: 'arbitrum-sepolia',
      chainId: Number(network.chainId),
      contract: contractAddress,
      deployer: deployer.address,
      platform: `${process.platform} ${process.arch}`,
      nodeVersion: process.version,
    },
    dataset: {
      numRecords,
      numLeaves: leaves.length,
      numOrders: dataset.numOrders,
    },
    gas: {
      deploy: deployReceipt.gasUsed.toString(),
      leafStorage: totalStorageGas.toString(),
      treeBuild: buildReceipt.gasUsed.toString(),
      total: (deployReceipt.gasUsed + totalStorageGas + buildReceipt.gasUsed).toString(),
      ethSpent,
      deployTxHash: deployReceipt.hash,
      storageTxHashes,
      buildTxHash: buildReceipt.hash,
    },
    crossValidation: {
      onChainRoot,
      offChainRoot: referenceRoot,
      match: onChainRoot === referenceRoot,
    },
    verification: {
      offChain: {
        meanMs: offStats.meanMs,
        medianMs: offStats.medianMs,
        stddevMs: offStats.stddevMs,
        allRunsMs: offStats.allRuns,
      },
      onChainView: {
        meanMs: onStats.meanMs,
        medianMs: onStats.medianMs,
        stddevMs: onStats.stddevMs,
        allRunsMs: onStats.allRuns,
        note: 'Includes RPC round-trip latency',
      },
      numRuns,
    },
  };

  // Determine output directory based on network
  const networkName = network.chainId === 421614n ? 'arbitrum-sepolia' : 'sepolia-l1';
  const outputDir = path.join(__dirname, '..', 'results', networkName);
  fs.mkdirSync(outputDir, { recursive: true });
  const dateStr = new Date().toISOString().slice(0, 10);
  const outputPath = path.join(outputDir, `results-${dateStr}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`Results saved to: ${outputPath}`);

  return results;
}

runL2Benchmark()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
