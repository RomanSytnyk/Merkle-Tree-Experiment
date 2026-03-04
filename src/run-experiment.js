/**
 * Experiment runner — Merkle tree vs MySQL integrity verification benchmark.
 *
 * Datasets: 1,000 / 10,000 / 100,000 records
 * Runs: 10 per configuration (configurable)
 *
 * Environment variables (Hardhat `run` does not forward CLI args):
 *   EXPERIMENT_MODE=full|blockchain|mysql|small
 *   EXPERIMENT_SIZES=1000,10000,100000
 *   EXPERIMENT_RUNS=10
 */

const { runBenchmark: runBlockchain } = require('./benchmark-blockchain');
const Table = require('cli-table3');
const fs = require('fs');
const path = require('path');

const envMode = (process.env.EXPERIMENT_MODE || 'full').toLowerCase();
const blockchainOnly = envMode === 'blockchain';
const mysqlOnly = envMode === 'mysql';
const smallOnly = envMode === 'small';
const numRuns = parseInt(process.env.EXPERIMENT_RUNS || '10');

let datasetSizes;
if (process.env.EXPERIMENT_SIZES) {
  datasetSizes = process.env.EXPERIMENT_SIZES.split(',').map(Number);
} else if (smallOnly) {
  datasetSizes = [1000];
} else {
  datasetSizes = [1000, 10000, 100000];
}

// ── Statistics ──

function confidenceInterval95(values) {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const stddev = Math.sqrt(values.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1));
  const tCritTable = { 5: 2.571, 9: 2.262, 10: 2.228, 15: 2.131, 20: 2.086, 30: 2.042 };
  const tCrit = tCritTable[n - 1] || 1.96;
  const margin = tCrit * stddev / Math.sqrt(n);
  return { mean, lower: mean - margin, upper: mean + margin, margin };
}

function formatTime(sec) {
  if (sec < 0.001) return `${(sec * 1_000_000).toFixed(0)} µs`;
  if (sec < 1) return `${(sec * 1000).toFixed(1)} ms`;
  if (sec < 60) return `${sec.toFixed(2)} s`;
  return `${(sec / 60).toFixed(1)} min`;
}

// ── Main ──

async function main() {
  console.log('\n╔' + '═'.repeat(66) + '╗');
  console.log('║  MERKLE TREE vs MySQL — INTEGRITY VERIFICATION EXPERIMENT        ║');
  console.log('║  Sytnyk & Hnatushenko (2025)                                     ║');
  console.log('╚' + '═'.repeat(66) + '╝\n');

  console.log(`Configuration:`);
  console.log(`  Dataset sizes: ${datasetSizes.map(s => s.toLocaleString()).join(', ')} records`);
  console.log(`  Runs per test: ${numRuns}`);
  console.log(`  Systems: ${blockchainOnly ? 'Blockchain only' : mysqlOnly ? 'MySQL only' : 'Both'}`);
  console.log(`  Date: ${new Date().toISOString()}`);
  console.log(`  Node: ${process.version}, Platform: ${process.platform} ${process.arch}\n`);

  const allResults = [];

  for (const size of datasetSizes) {
    const sizeResults = { size };

    if (!mysqlOnly) {
      try {
        sizeResults.blockchain = await runBlockchain(size, numRuns);
      } catch (err) {
        console.error(`\n  Blockchain benchmark failed for ${size.toLocaleString()} records:`);
        console.error(`  ${err.message}\n`);
        sizeResults.blockchain = null;
      }
    }

    if (!blockchainOnly) {
      try {
        const { runBenchmark: runMySQL } = require('./benchmark-mysql');
        sizeResults.mysql = await runMySQL(size, numRuns);
      } catch (err) {
        console.error(`\n  MySQL benchmark failed for ${size.toLocaleString()} records:`);
        if (err.code === 'ECONNREFUSED') {
          console.error('  MySQL is not running. Start it with:');
          console.error('    brew services start mysql');
          console.error('  or:');
          console.error('    docker compose up -d\n');
        } else {
          console.error(`  ${err.message}\n`);
        }
        sizeResults.mysql = null;
      }
    }

    allResults.push(sizeResults);
  }

  // ── Combined results ──

  console.log('\n\n╔' + '═'.repeat(66) + '╗');
  console.log('║                       COMBINED RESULTS                           ║');
  console.log('╚' + '═'.repeat(66) + '╝\n');

  const table = new Table({
    head: ['Dataset', 'MySQL (JOIN+ECDSA)', 'Blockchain (Merkle)', 'Ratio', 'Path'],
    colWidths: [14, 24, 24, 9, 12],
    style: { head: ['cyan'] },
  });

  for (const r of allResults) {
    const mysqlStr = r.mysql ? `${formatTime(r.mysql.meanSec)}` : '—';
    const bcStr = r.blockchain ? `${formatTime(r.blockchain.meanSec)}` : '—';
    const ratio = (r.mysql && r.blockchain)
      ? `${(r.mysql.meanMs / r.blockchain.meanMs).toFixed(1)}×`
      : '—';
    const bcPath = r.blockchain ? r.blockchain.primaryPath : '—';
    table.push([`${r.size.toLocaleString()}`, mysqlStr, bcStr, ratio, bcPath]);
  }

  console.log('Integrity verification time:\n');
  console.log(table.toString());

  // ── Extended statistics ──

  console.log('\n\nExtended Statistics:\n');

  for (const r of allResults) {
    console.log(`  ${r.size.toLocaleString()} records:`);

    const systems = [];
    if (r.blockchain) systems.push({ name: 'Blockchain', s: r.blockchain });
    if (r.mysql) systems.push({ name: 'MySQL    ', s: r.mysql });

    for (const sys of systems) {
      const s = sys.s;
      const ci = confidenceInterval95(s.allRuns.map(x => x / 1000));
      console.log(`    ${sys.name}: mean=${formatTime(s.meanSec).padStart(10)} ` +
        `median=${formatTime(s.medianMs / 1000).padStart(10)} ` +
        `σ=${formatTime(s.stddevMs / 1000).padStart(10)} ` +
        `95%CI=±${formatTime(ci.margin)}`);
    }
    console.log();
  }

  // ── Scaling analysis ──

  if (allResults.length >= 2) {
    console.log('Scaling Analysis:\n');
    for (let i = 1; i < allResults.length; i++) {
      const prev = allResults[i - 1];
      const curr = allResults[i];
      const dataRatio = curr.size / prev.size;
      console.log(`  ${prev.size.toLocaleString()} → ${curr.size.toLocaleString()} (${dataRatio}× data):`);

      if (curr.blockchain && prev.blockchain) {
        const timeRatio = curr.blockchain.meanMs / prev.blockchain.meanMs;
        const alpha = Math.log(timeRatio) / Math.log(dataRatio);
        console.log(`    Blockchain: ${timeRatio.toFixed(2)}× time increase (α ≈ ${alpha.toFixed(2)})`);
      }
      if (curr.mysql && prev.mysql) {
        const timeRatio = curr.mysql.meanMs / prev.mysql.meanMs;
        const alpha = Math.log(timeRatio) / Math.log(dataRatio);
        console.log(`    MySQL:      ${timeRatio.toFixed(2)}× time increase (α ≈ ${alpha.toFixed(2)})`);
      }
      console.log();
    }
  }

  // ── Save results ──

  const outputPath = path.join(__dirname, '..', 'results.json');
  const output = {
    meta: {
      date: new Date().toISOString(),
      datasetSizes,
      numRuns,
      platform: `${process.platform} ${process.arch}`,
      nodeVersion: process.version,
    },
    results: allResults.map(r => ({
      size: r.size,
      blockchain: r.blockchain ? {
        primaryPath: r.blockchain.primaryPath,
        crossValidated: r.blockchain.crossValidated,
        meanSec: r.blockchain.meanSec,
        medianSec: r.blockchain.medianMs / 1000,
        stddevSec: r.blockchain.stddevMs / 1000,
        allRunsSec: r.blockchain.allRuns.map(x => x / 1000),
        onChain: r.blockchain.onChain ? {
          meanSec: r.blockchain.onChain.meanSec,
          stddevSec: r.blockchain.onChain.stddevMs / 1000,
          allRunsSec: r.blockchain.onChain.allRuns.map(x => x / 1000),
        } : null,
        offChain: r.blockchain.offChain ? {
          meanSec: r.blockchain.offChain.meanSec,
          stddevSec: r.blockchain.offChain.stddevMs / 1000,
          allRunsSec: r.blockchain.offChain.allRuns.map(x => x / 1000),
        } : null,
      } : null,
      mysql: r.mysql ? {
        meanSec: r.mysql.meanSec,
        medianSec: r.mysql.medianMs / 1000,
        stddevSec: r.mysql.stddevMs / 1000,
        allRunsSec: r.mysql.allRuns.map(x => x / 1000),
      } : null,
    })),
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`Results saved to: ${outputPath}`);

  console.log('\n' + '═'.repeat(68));
  console.log('  Experiment complete.');
  console.log('═'.repeat(68) + '\n');
}

main().then(() => process.exit(0)).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
