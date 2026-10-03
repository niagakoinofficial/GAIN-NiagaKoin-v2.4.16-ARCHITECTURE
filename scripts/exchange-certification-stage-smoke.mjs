import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const server = read('server.ts');
const database = read('src/server/database.ts');
const migration = read('db/migrations/009_exchange_certification_runs.sql');
const registry = read('src/config/exchangeRegistry.ts');
const envExample = read('.env.example');

const checks = [
  ['stage endpoint exists', server.includes("/api/exchange/certification/stage")],
  ['latest endpoint exists', server.includes("/api/exchange/certification/latest")],
  ['all five stages declared', ['authenticated_readonly','sandbox_demo_order','micro_live_order','reconcile','recovery'].every((s) => server.includes(`'${s}'`))],
  ['certification persistence helpers', database.includes('createExchangeCertificationRun') && database.includes('updateExchangeCertificationRun') && database.includes('getLatestExchangeCertificationRun')],
  ['certification migration', migration.includes('exchange_certification_runs') && migration.includes('exchange_order_id')],
  ['live certification double gate', server.includes('EXCHANGE_CERT_MICRO_LIVE_ENABLED') && server.includes('LIVE_TRADING_TESTNET_ONLY') && server.includes('EXCHANGE_CERT_MICRO_LIVE_CONFIRM')],
  ['live certification 2FA gate', server.includes('TRADE_2FA_REQUIRED') && server.includes('consumeTotpCounter')],
  ['registry includes Indonesia and global target set', ['binance','bitget','okx','bybit','coinbase','kraken','indodax','tokocrypto','bittime','pintupro','reku','triv'].every((id) => registry.includes(`id: '${id}'`))],
  ['safe micro-live defaults documented', envExample.includes('EXCHANGE_CERT_MICRO_LIVE_ENABLED=false') && envExample.includes('EXCHANGE_CERT_MICRO_LIVE_CONFIRM=I_UNDERSTAND_MICRO_LIVE_CERTIFICATION')],
];

const failed = checks.filter(([, ok]) => !ok);
console.log(JSON.stringify({ sourceGate: failed.length === 0, checks: checks.map(([name, ok]) => ({ name, ok })), failedCount: failed.length, noOrdersSubmittedBySmoke: true }, null, 2));
process.exitCode = failed.length ? 1 : 0;
