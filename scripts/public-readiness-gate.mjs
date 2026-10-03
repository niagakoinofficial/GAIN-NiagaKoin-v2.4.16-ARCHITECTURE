import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));
const results = [];
const check = (name, ok, detail, gate = 'SOURCE') => results.push({ name, ok: Boolean(ok), detail, gate });

const pkg = JSON.parse(read('package.json'));
const server = read('server.ts');
const db = read('src/server/database.ts');
const checker = read('src/components/modals/ExchangeCoinsCheckerModal.tsx');
const trace = read('src/components/ExecutionPipelineTrace.tsx');
const alerts = read('src/services/priceAlertService.ts');
const app = read('src/App.tsx');
const matrix = read('src/components/modals/AveragingMatrixModal.tsx');
const registry = read('src/config/exchangeRegistry.ts');
const exchangeScript = read('scripts/exchange-certification.mjs');

check('release version', pkg.version === '2.4.16', pkg.version);
check('test-safe defaults', /LIVE_TRADING_ENABLED=false/.test(read('.env.example')) && /LIVE_TRADING_TESTNET_ONLY=true/.test(read('.env.example')), 'live disabled + testnet only');
check('startup bot auto-resume disabled by default', /BOT_STARTUP_AUTO_RESUME=false/.test(read('.env.example')) && /BOT_STARTUP_AUTO_RESUME_CONFIRM=/.test(read('.env.example')) && /MANUAL_RESUME_REQUIRED/.test(server), 'previously-active runners stay paused after restart unless explicitly opted in');
check('activation idempotency', db.includes('activateLicenseAtomic') && db.includes('idempotencyKey') && exists('db/migrations/008_activation_idempotency.sql'), 'activation uses persisted idempotency key');
check('activation replay side effects guarded', server.includes('if (!result.replayed)') && server.includes('wallet.activation.completed'), 'replay does not mirror duplicate financial side effects');
check('deposit unique/replay protection', exists('db/migrations/008_activation_idempotency.sql') && db.includes('DEPOSIT_TX_ALREADY_CLAIMED'), 'same network+tx hash cannot credit another account');
check('financial mutation validation at DB layer', db.includes('TRANSFER_AMOUNT_INVALID') && db.includes('GAS_TOPUP_AMOUNT_INVALID') && db.includes('WITHDRAW_AMOUNT_INVALID'), 'defense in depth beyond route validation');
check('coin checker read-only', !checker.includes('executeExchangeOrder') && !checker.includes('verifyCoinExecution') && checker.includes('Tidak ada order yang dikirim'), 'no exchange order execution path');
check('coin checker no fake live fallback', checker.includes('Live belum tersedia') && checker.includes('Tidak ada data live yang digunakan sebagai fallback'), 'no static compatibility data presented as live');
check('pipeline trace clearly synthetic', trace.includes('DEMO ARSITEKTUR') && trace.includes('Bukan Telemetri Runtime'), 'demo UI is explicitly labeled');
check('price alert disclosure', alerts.includes('checkPriceAlerts') && fs.existsSync(path.join(root,'src/components/modals/PriceAlertModal.tsx')), 'browser-side alert engine exists and UI is separately disclosed');
check('matrix coin price uses live ticker map', matrix.includes('currentPrices[c.pair]') && matrix.includes('Memuat harga…'), 'coin pairing cards render exchange-derived price instead of static zero catalog values');
check('Binance public ticker fallback exists', server.includes('fetchBinancePublicSpotPrices') && server.includes('binance-public-rest'), 'public Binance market-data fallback is credential-free and read-only');
check('release metadata version is consistent', read('index.html').includes(`GAIN-Niaga-Koin-v${pkg.version}`), `HTML title/meta matches package release version ${pkg.version}`);
check('credential secrets not persisted', !app.includes("localStorage.setItem('gain_active_api_creds"), 'exchange secrets remain memory-only');
check('security audit script', exists('scripts/security-audit.mjs'), 'source security gate exists');
check('exchange registry', registry.includes("id: 'bitget'") && registry.includes("id: 'reku'") && registry.includes("id: 'triv'"), 'Bitget/Reku/Triv are represented in the central capability registry');
check('exchange certification lab', exists('scripts/exchange-certification.mjs') && exchangeScript.includes('noOrdersSubmitted'), 'read-only multi-exchange certification runner exists');
check('exchange certification stages', server.includes('/api/exchange/certification/stage') && server.includes('exchange.certification.micro_live_order'), 'authenticated read-only, sandbox/demo, micro-live, reconciliation and recovery stages exist');
check('certification persistence migration', exists('db/migrations/009_exchange_certification_runs.sql') && db.includes('createExchangeCertificationRun'), 'durable certification lifecycle persistence');
check('micro-live disabled by default', /EXCHANGE_CERT_MICRO_LIVE_ENABLED=false/.test(read('.env.example')) && /EXCHANGE_CERT_MICRO_LIVE_CONFIRM=I_UNDERSTAND_MICRO_LIVE_CERTIFICATION/.test(read('.env.example')), 'live exchange certification is opt-in');
check('Reku public adapter is read-only', server.includes('fetchRekuPublicPrices') && server.includes('reku-public-api') && !registry.includes("id: 'reku', name: 'Reku', ccxtId: 'reku'"), 'Reku uses explicit public market-data adapter and no fabricated CCXT trading adapter');
check('Triv blocked until native API verified', registry.includes("certificationMode: 'BLOCKED_PENDING_NATIVE_API'") && registry.includes("id: 'triv'"), 'Triv cannot reach a fake order path without verified native API docs');
check('Bitget current public websocket', read('src/v2/engines/marketData/WebSocketManager.ts').includes('topic:\'ticker\'') && read('src/v2/engines/marketData/WebSocketManager.ts').includes('symbol:bitgetSymbol(symbol)'), 'Bitget UTA websocket uses current topic/symbol ticker contract');
check('transactional email hardening', exists('src/server/emailDelivery.ts') && server.includes('sendTransactionalEmail') && server.includes('buildEmailIdempotencyKey'), 'email OTP delivery uses centralized Resend handling and idempotency');
check('email sender preflight', exists('scripts/resend-email-preflight.mjs') && Boolean(pkg.scripts?.['test:email']), 'email delivery configuration can be preflighted without sending a message');

const external = [
  ['npm ci', 'dependency installation must succeed in the target environment'],
  ['lint/typecheck', 'run npm run lint'],
  ['unit/integration tests', 'run npm test and npm run test:core'],
  ['database migration', 'run npm run db:migrate against staging DB'],
  ['Binance Testnet E2E', 'run npm run test:binance with dedicated testnet credentials'],
  ['financial replay matrix', 'duplicate activation/deposit/withdrawal/transfer/gas requests'],
  ['chaos/recovery', 'restart API/worker/Redis and reconcile orders/positions'],
  ['24-72h soak', 'continuous testnet operation with monitoring'],
  ['backup/restore', 'restore staging database and verify ledger/order consistency'],
];

const failed = results.filter(r => !r.ok);
console.log(JSON.stringify({
  sourceGate: failed.length === 0,
  failedCount: failed.length,
  results,
  externalValidationRequired: true,
  externalGates: external.map(([name, detail]) => ({ name, status: 'NOT_VERIFIED', detail })),
  finalStatus: failed.length ? 'BLOCKED_BY_SOURCE_FINDINGS' : 'EXTERNAL_VALIDATION_REQUIRED'
}, null, 2));
process.exitCode = failed.length ? 1 : 0;
