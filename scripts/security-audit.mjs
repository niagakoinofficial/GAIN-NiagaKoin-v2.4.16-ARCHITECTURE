import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const checks = [];
function check(name, ok, detail) { checks.push({ name, ok, detail }); }

const server = read('server.ts');
const securityModal = read('src/components/modals/SecurityVerificationModal.tsx');
const authApi = read('src/api/authApi.ts');
const app = read('src/App.tsx');
const home = read('src/views/HomeView.tsx');
const rules = read('firestore.rules');
const pkg = JSON.parse(read('package.json'));
const migration = read('db/migrations/005_gain24_hardening.sql');
const database = read('src/server/database.ts');
const financialConfig = read('src/config/financialConfig.ts');

check('Release version is 2.4.16', pkg.version === '2.4.16', `package.version=${pkg.version}`);

check('Exchange identity hardening migration exists', fs.existsSync(path.join(root, 'db/migrations/006_exchange_account_identity_hardening.sql')) && server.includes('EXCHANGE_ACCOUNT_ALREADY_LINKED'), 'cross-UID exchange ownership guard present');
check('Credential history is persisted', database.includes('exchange_credential_history') && server.includes('/api/bot/credentials/history'), 'credential version/history path present');
check('Runtime is position authority', server.includes('/api/bot/engine-status') && home.includes('activePositionCount'), 'Home active position count uses runtime engine');
check('Portfolio allocation is exchange-derived', home.includes('portfolioAssets') && home.includes('deriveAllocatedAssetUsdt'), 'exchange portfolio snapshot is primary allocation source');
check('MM OFF removes GAIN capital ceiling', server.includes('bot.useMoneyManagement !== false') && server.includes('Number.POSITIVE_INFINITY'), 'platform capital guardrails are conditional on MM');

check('Financial configuration is centralized', fs.existsSync(path.join(root, 'src/config/financialConfig.ts')) && server.includes('FINANCIAL_CONFIG'), 'referral, gas promo, withdrawal and auto-refill semantics are versioned');
check('Gas top-up is backend authoritative', database.includes('topupGasAtomic') && database.includes('GAS_TOPUP') && server.includes('/api/wallet/topup-gas'), 'client does not calculate real wallet credit');
check('Gas top-up is idempotent', database.includes('idempotency_key') && database.includes('replayed: true'), 'duplicate top-up requests are replay-safe');
check('Referral trading fee settlement is ledger-backed', database.includes('REFERRAL_TRADING_FEE') && database.includes("event_type='TRADING_FEE'"), '20% cash referral trading fee reward is settled server-side');
check('Referral top-up non-cash settlement is ledger-backed', database.includes('REFERRAL_TOPUP_GAS') && database.includes("event_type='TOPUP'"), '10% non-cash top-up referral reward is settled server-side');
check('Profit Share UI reads backend', fs.existsSync(path.join(root,'src/components/modals/ProfitShareModal.tsx')) && read('src/components/modals/ProfitShareModal.tsx').includes('getProfitShare'), 'no placeholder-only Profit Share modal');
check('Auto-refill is persisted and worker-backed', database.includes('gas_auto_refill_configs') && database.includes('processGasAutoRefills') && server.includes('/api/wallet/auto-refill'), 'auto-refill config and scheduled worker exist');
check('Manual layer close uses authoritative runner', app.includes('forceTakeProfit(targetPos.botId || targetPos.id, targetPos.pair, quantity, layerId)') && !app.includes('Manual Close Layer #${layerToClose.layerStep}'), 'layer close no longer mutates wallet/Firestore directly');
check('Withdrawal UI does not mark review as success locally', app.includes("status: String(queueDetails?.status || 'REVIEW')") && !app.includes("title: 'Withdrawal BEP-20'"), 'withdrawal balance/status remains backend authoritative');
check('Deposit QR is real and configured', read('src/components/modals/DepositModal.tsx').includes("QRCode.toDataURL") && !read('src/components/modals/DepositModal.tsx').includes('0x099358c97f96451acdd973Ec44dbb7870580b5c9'), 'QR encodes configured server deposit address only');
check('Referral QR is real', read('src/components/account/NetworkReferralSection.tsx').includes('QRCode.toDataURL') && !read('src/components/account/NetworkReferralSection.tsx').includes('Simulated Clean QR'), 'referral QR encodes the real referral URL');
check('No fake financial fallbacks in wallet', !read('src/views/WalletView.tsx').includes('?? 30.00') && !read('src/views/WalletView.tsx').includes('?? 10.00') && !app.includes('usdtBalance ?? 70'), 'missing financial data renders zero/unknown instead of invented balances');
check('Backtest includes fee/slippage and Monte Carlo', read('src/services/backtestService.ts').includes('runMonteCarlo') && read('src/services/backtestService.ts').includes('feePct'), 'research layer includes transaction cost sensitivity');
check('Promo configuration is centralized', fs.existsSync(path.join(root, 'src/config/licensePromo.ts')) && server.includes('getLicenseTierConfig'), 'license/promo financial parameters share one versioned config');
check('Promo headline matches requested campaign', read('src/config/licensePromo.ts').includes('discountPct: 50') && read('src/config/licensePromo.ts').includes('tradingFeeBonusPct: 40'), '50% + 40% = 90% campaign configuration');
check('Client observability allowlist covers Google auth event', server.includes("'auth.google.authenticated'") && read('src/api/observabilityApi.ts').includes("'auth.google.authenticated'"), 'prevents known 400 observability event');
check('No exchange secret persisted in localStorage', !app.includes('gain_active_api_creds') || app.includes('removeItem'), 'legacy client credential keys are explicitly removed');
check('Security elevation OTP is server verified', server.includes("/api/auth/verify-login-code") && authApi.includes('verifySecurityVerificationCode') && server.includes('handleSecurityVerifyCode'), 'the legacy alias now verifies the on-demand security elevation challenge server-side');
check('Dashboard is not gated by paid-user OTP', !read('src/App.tsx').includes('isUser1Paid') && !read('src/App.tsx').includes('<LoginVerificationModal'), 'Architecture 25 removes the paid-user dashboard login gate');
check('Security verification modal is explicit', securityModal.includes('Verifikasi Keamanan') && securityModal.includes('Bukan kode login'), 'protected actions use a dedicated security-elevation modal');
check('2FA configuration is protected by security elevation', server.includes("app.post('/api/security/2fa'") && server.includes("await requireSecuritySession(req, identity.uid);"), '2FA enrollment/disablement requires an elevated security session');
check('Session elevation uses HttpOnly cookie', server.includes('HttpOnly; SameSite=Lax') && server.includes('gain_session_elevation'), 'HttpOnly elevation cookie present');
check('Manual order has global live gate', server.includes("LIVE_TRADING_DISABLED") && server.includes('requestedSandbox'), 'manual execution checks live gate');
check('Manual order uses stored credential', server.includes('loadBotCredential(identity.uid, validatedExchange)') && !app.includes('apiKey: activeApiCreds.apiKey'), 'execution path does not send stored secret from UI');
check('Live manual order requires TOTP', server.includes('TRADE_2FA_REQUIRED') && server.includes('TRADE_2FA_INVALID'), 'TOTP required for non-sandbox order');
check('V2 API authenticated', server.includes("app.use('/api/v2/engine', async") && server.includes('v2:${identity.uid}'), 'V2 routes require Firebase identity and rate limit');
check('Referral list reads authoritative backend', server.includes("/api/referrals/direct") && read('src/services/memberService.ts').includes('fetchDirectReferrals'), 'referral directory is PostgreSQL-backed');
check('Client cannot create referral directory records', rules.includes('allow create: if false;') && !app.includes('registerMemberInDirectory'), 'member directory is server-authoritative');
check('Sponsor relation is PostgreSQL-backed', migration.includes('sponsor_user_id'), 'authoritative sponsor relationship');
check('Activation referral is ledger-backed', server.includes('referralBonus') && server.includes('referralEventId'), 'activation result exposes backend referral event');
check('Withdrawal rejection has compensating ledger', database.includes('WITHDRAWAL_REJECTED_REVERSAL') && database.includes('rejection_reversal_ledger_id'), 'immutable reversal path present');
check('Withdrawal settlement verifies BSC transfer', server.includes('SETTLEMENT_TRANSFER_NOT_FOUND') && server.includes('SETTLEMENT_AMOUNT_MISMATCH'), 'on-chain settlement verification present');
check('Global kill switch persists', server.includes("setSystemSetting('live_trading_enabled'") && server.includes("getSystemSetting<{enabled?:boolean}>('live_trading_enabled')"), 'DB-backed runtime gate');
check('Startup auto-resume is opt-in and fail-closed',
  /STARTUP_AUTO_RESUME_CONFIRM/.test(server) && /BOT_STARTUP_AUTO_RESUME_DISABLED/.test(server) && /STARTUP_RESUME_REQUIRED/.test(server) && /MANUAL_RESUME_REQUIRED/.test(server),
  'restart never resumes a prior bot unless the two-part opt-in is explicitly configured');
check('Startup websocket is not opened for paused recovered bots',
  /GAIN_V2_ENABLED && bot.status === 'active'/.test(server) && /v2WebSocketManager\.connect/.test(server),
  'recovered paused runners do not subscribe to exchange market feeds before explicit resume');
check('Redis integration exists', fs.existsSync(path.join(root,'src/server/redis.ts')) && server.includes('checkRedisRateLimit'), 'Redis-backed coordination/rate limiting');
check('Redis required in Docker', read('docker-compose.yml').includes('REDIS_REQUIRED=true'), 'production compose requires Redis');

check('Activation is idempotent', read('src/server/database.ts').includes('idempotencyKey') && read('db/migrations/008_activation_idempotency.sql').includes('uq_licenses_idempotency_key'), 'activation replay protection is persisted server-side');
check('Coin checker is read-only', !read('src/components/modals/ExchangeCoinsCheckerModal.tsx').includes('executeExchangeOrder') && !read('src/components/modals/ExchangeCoinsCheckerModal.tsx').includes('verifyCoinExecution') && read('src/components/modals/ExchangeCoinsCheckerModal.tsx').includes('Tidak ada order yang dikirim'), 'coin compatibility checker cannot place exchange orders');
check('Exchange certification stage persistence', database.includes('createExchangeCertificationRun') && database.includes('updateExchangeCertificationRun') && fs.existsSync(path.join(root, 'db/migrations/009_exchange_certification_runs.sql')), 'durable per-exchange certification records');
check('Micro-live requires explicit gates', server.includes('EXCHANGE_CERT_MICRO_LIVE_ENABLED') && server.includes('EXCHANGE_CERT_MICRO_LIVE_CONFIRM') && server.includes('TRADE_2FA_REQUIRED') && server.includes('LIVE_TRADING_TESTNET_ONLY'), 'live certification cannot bypass server safety gates');
check('Coin checker does not fake live volume', !/volume24h:\s*'\$/.test(read('src/components/modals/ExchangeCoinsCheckerModal.tsx')), 'fallback market volume is not presented as current live data');
check('Deposit replay cannot cross-credit accounts', database.includes('DEPOSIT_TX_ALREADY_CLAIMED') && database.includes('existing.rows[0].user_id'), 'a previously credited tx hash is rejected for another user');
check('Financial mutation validation is defense-in-depth', database.includes('TRANSFER_AMOUNT_INVALID') && database.includes('GAS_TOPUP_AMOUNT_INVALID') && database.includes('WITHDRAW_AMOUNT_INVALID'), 'critical financial services validate their own inputs');
check('Activation replay does not duplicate read-model side effects', server.includes('if (!result.replayed)') && server.includes('wallet.activation.completed'), 'activation mirror/audit runs only on first settlement');
check('Pipeline trace is explicitly synthetic', read('src/components/ExecutionPipelineTrace.tsx').includes('DEMO ARSITEKTUR') && read('src/components/ExecutionPipelineTrace.tsx').includes('Bukan Telemetri Runtime'), 'demo trace cannot be mistaken for production telemetry');
check('Price alert runtime limitation is disclosed', read('src/components/modals/PriceAlertModal.tsx').includes('alert browser saat aplikasi aktif'), 'browser-only trigger limitation is visible to users');
check('Matrix coin cards use live price source', read('src/components/modals/AveragingMatrixModal.tsx').includes('currentPrices[c.pair]') && read('src/components/modals/AveragingMatrixModal.tsx').includes('Memuat harga…'), 'pairing selector does not display catalog price=0 as a live price');
check('Binance market price fallback is read-only', server.includes('fetchBinancePublicSpotPrices') && server.includes('binance-public-rest') && server.includes("/api/v3/ticker/price"), 'public ticker fallback only reads market data');
check('Release HTML metadata matches package version', read('index.html').includes(`GAIN-Niaga-Koin-v${pkg.version}`), `HTML title/meta matches release version ${pkg.version}`);

const failed = checks.filter((c) => !c.ok);
console.log(JSON.stringify({ ok: failed.length === 0, checks, failedCount: failed.length }, null, 2));
process.exitCode = failed.length ? 1 : 0;
