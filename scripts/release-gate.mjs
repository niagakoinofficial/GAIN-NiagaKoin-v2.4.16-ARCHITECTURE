import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const pkg = JSON.parse(read('package.json'));
const server = read('server.ts');
const home = read('src/views/HomeView.tsx');
const promo = read('src/config/licensePromo.ts');
const results = [];
const check = (name, ok, detail) => results.push({ name, ok, detail });

check('version', pkg.version === '2.4.16', pkg.version);
check('live trading default disabled', /LIVE_TRADING_ENABLED=false/.test(read('.env.example')), 'test-safe default');
check('testnet-only default enabled', /LIVE_TRADING_TESTNET_ONLY=true/.test(read('.env.example')), 'testnet gate');
check('exchange identity guard', server.includes('EXCHANGE_ACCOUNT_ALREADY_LINKED'), 'cross-UID protection');
check('runtime position authority', home.includes('activePositionCount') && home.includes('engineBots'), 'Home count source');
check('portfolio source', home.includes('deriveAllocatedAssetUsdt'), 'exchange snapshot source');
check('MM OFF semantics', server.includes('Number.POSITIVE_INFINITY') && server.includes('useMoneyManagement !== false'), 'capital guard conditional');
check('promo source of truth', promo.includes('discountPct: 50') && promo.includes('tradingFeeBonusPct: 40'), '50 + 40');
check('order recovery', server.includes("status: 'unknown' as const"), 'ambiguous order marker');
check('exchange certification stages', server.includes("/api/exchange/certification/stage") && server.includes("authenticated_readonly") && server.includes("sandbox_demo_order") && server.includes("micro_live_order") && server.includes("reconcile") && server.includes("recovery"), 'multi-stage exchange certification path');
check('exchange certification persistence', fs.existsSync(path.join(root,'db/migrations/009_exchange_certification_runs.sql')) && read('src/server/database.ts').includes('createExchangeCertificationRun'), 'durable certification run state');
check('micro-live hard gate', server.includes('EXCHANGE_CERT_MICRO_LIVE_ENABLED') && server.includes('EXCHANGE_CERT_MICRO_LIVE_CONFIRM') && server.includes('LIVE_TRADING_TESTNET_ONLY'), 'micro-live requires explicit server configuration');

check('financial config', fs.existsSync(path.join(root,'src/config/financialConfig.ts')) && server.includes('FINANCIAL_CONFIG'), 'financial source of truth');
check('financial ledger settlement', server.includes('/api/wallet/profit-share') && server.includes('/api/wallet/topup-gas'), 'authoritative financial endpoints');
check('manual layer close authority', server.includes('BOT_CLOSE_QTY_EXCEEDS_POSITION') && server.includes('closedLayerIds'), 'partial/manual close runs through bot runtime');
check('auto refill worker', server.includes('processGasAutoRefills') && server.includes('/api/wallet/auto-refill'), 'persisted auto-refill worker');
check('deposit QR configuration', read('src/components/modals/DepositModal.tsx').includes('QRCode.toDataURL') && !read('src/components/modals/DepositModal.tsx').includes('0x099358c97f96451acdd973Ec44dbb7870580b5c9'), 'no hardcoded deposit QR');
check('backtest research hardening', read('src/services/backtestService.ts').includes('runMonteCarlo') && read('src/services/backtestService.ts').includes('feePct'), 'fee/slippage and Monte Carlo');
check('security audit', fs.existsSync(path.join(root, 'scripts/security-audit.mjs')), 'audit script exists');

check('activation idempotency', read('src/server/database.ts').includes('idempotencyKey') && read('db/migrations/008_activation_idempotency.sql').includes('uq_licenses_idempotency_key'), 'activation replay-safe');
check('coin checker read-only', !read('src/components/modals/ExchangeCoinsCheckerModal.tsx').includes('executeExchangeOrder') && !read('src/components/modals/ExchangeCoinsCheckerModal.tsx').includes('verifyCoinExecution'), 'no direct order placement from checker');
check('deposit cross-account replay guard', read('src/server/database.ts').includes('DEPOSIT_TX_ALREADY_CLAIMED'), 'same transaction cannot credit another account');
check('financial service validation', read('src/server/database.ts').includes('TRANSFER_AMOUNT_INVALID') && read('src/server/database.ts').includes('GAS_TOPUP_AMOUNT_INVALID'), 'critical financial services validate input internally');
check('synthetic pipeline disclosure', read('src/components/ExecutionPipelineTrace.tsx').includes('Bukan Telemetri Runtime'), 'demo telemetry is clearly labeled');
check('price alert limitation disclosed', read('src/components/modals/PriceAlertModal.tsx').includes('alert browser saat aplikasi aktif'), 'browser-side alert limitation is disclosed');

const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ sourceGate: failed.length === 0, results, failedCount: failed.length, externalValidationRequired: true }, null, 2));
process.exitCode = failed.length ? 1 : 0;
