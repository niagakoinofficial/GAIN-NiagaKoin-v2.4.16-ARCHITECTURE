import 'dotenv/config';
import { spawn } from 'node:child_process';
const results = [];
const run = (name, command, args = []) => new Promise((resolve) => {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  let stdout = '', stderr = '';
  child.stdout.on('data', (d) => { stdout += d; process.stdout.write(`[${name}] ${d}`); });
  child.stderr.on('data', (d) => { stderr += d; process.stderr.write(`[${name}] ${d}`); });
  child.on('close', (code) => { const ok = code === 0; results.push({ name, status: ok ? 'PASS' : code === 2 ? 'BLOCKED' : 'FAIL', exitCode: code, stdout: stdout.slice(-4000), stderr: stderr.slice(-2000) }); resolve(ok); });
});
const required = ['DATABASE_URL'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) { console.error(JSON.stringify({ ok: false, status: 'BLOCKED', missing })); process.exit(2); }
await run('network-preflight', process.execPath, ['scripts/network-preflight.mjs']);
await run('postgres-migrate', process.execPath, ['scripts/migrate.mjs']);
await run('postgres-check', process.execPath, ['--import', 'tsx', 'scripts/check-db.ts']);
if (process.env.FIREBASE_INTEGRATION_TEST !== 'false') await run('firebase', process.execPath, ['scripts/firebase-smoke.mjs']); else results.push({ name: 'firebase', status: 'SKIPPED' });
if (process.env.BSC_INTEGRATION_TEST !== 'false') await run('bsc-rpc', process.execPath, ['scripts/bsc-rpc-smoke.mjs']); else results.push({ name: 'bsc-rpc', status: 'SKIPPED' });
if (process.env.BINANCE_TESTNET_INTEGRATION_TEST === 'true') await run('binance-testnet', process.execPath, ['scripts/binance-testnet-smoke.mjs']); else results.push({ name: 'binance-testnet', status: 'SKIPPED', reason: 'Enable explicitly in staging.' });
const blockers = results.filter((r) => r.status === 'BLOCKED');
const failures = results.filter((r) => r.status === 'FAIL');
console.log(JSON.stringify({ ok: failures.length === 0 && blockers.length === 0, generatedAt: new Date().toISOString(), results }, null, 2));
process.exit(failures.length || blockers.length ? 1 : 0);
