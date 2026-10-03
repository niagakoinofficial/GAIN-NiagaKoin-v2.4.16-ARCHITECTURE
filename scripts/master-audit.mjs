import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
const server = read('server.ts');

check('Pending-order transaction guard',
  /runnerSnapshot\.data\(\)\?\.pendingOrder/.test(server) && /BOT_ORDER_STATUS_UNCERTAIN/.test(server),
  'order admission rejects a persisted pendingOrder');
check('Deterministic clientOrderId',
  /buildClientOrderId\(bot\.uid, bot\.botId, bot\.id, side, bot\.orderSequence\)/.test(server),
  'bot order identity is derived from stable runner sequence');
check('Ambiguous create recovery before retry',
  /findBotExchangeOrderByClientOrderId\(client, bot\.pair, clientOrderId\)/.test(server),
  'timeout/network failures resolve the existing order before another create');
check('Ambiguous lookup pauses instead of blind retry',
  /throw new BotExecutionFailure\('ORDER_STATUS_UNCERTAIN', false\)/.test(server),
  'uncertain lookup is fail-closed');
check('Binance exact client-order lookup',
  /fetchOrder\('0', symbol, \{ origClientOrderId: clientOrderId \}\)/.test(server),
  'Binance lookup uses origClientOrderId');
check('Lease asserted before exchange write',
  /lease\?\.owner !== SERVER_INSTANCE_ID/.test(server) && /statusAllowed = runnerStatus === 'active'/.test(server) && /transaction\.create\(orderDocument/.test(server),
  'exchange order admission is gated by an atomic persisted runner/lease check');
check('Lifecycle compensation',
  /BOT_LIFECYCLE_COMPENSATION_FAILED/.test(server) && /BOT_LIFECYCLE_FIRESTORE_ROLLBACK_FAILED/.test(server),
  'PostgreSQL-first lifecycle transition compensates both stores');
check('Startup pending protection',
  /lastErrorReason = 'ORDER_STATUS_UNCERTAIN'/.test(server) && /resumeAfterReconciliation = false/.test(server),
  'startup pauses runners with unresolved pending orders');
check('Startup reconciliation gate',
  /STARTUP_RECONCILIATION_PENDING/.test(server) && /reconcileLiveBotPosition\(bot\)/.test(server),
  'previously-active testnet/live runners require reconciliation');
check('Startup auto-resume is opt-in',
  /BOT_STARTUP_AUTO_RESUME_CONFIRM/.test(server) && /STARTUP_RESUME_REQUIRED/.test(server) && /MANUAL_RESUME_REQUIRED/.test(server),
  'startup recovery remains manual unless explicitly opted in');
check('Redis required fail-closed',
  /REDIS_REQUIRED/.test(server) && /REDIS_UNAVAILABLE/.test(server),
  'required Redis is treated as unavailable rather than silently bypassed');


check('Firebase config is environment-driven',
  !server.includes("from './firebase-applet-config.json'") && /VITE_FIREBASE_PROJECT_ID/.test(server),
  'server does not depend on a legacy Firebase config JSON file');

const failed = checks.filter((x) => !x.ok);
console.log(JSON.stringify({ ok: failed.length === 0, checks, failedCount: failed.length }, null, 2));
process.exitCode = failed.length ? 1 : 0;
