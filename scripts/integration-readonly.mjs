import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import crypto from 'node:crypto';
import ccxt from 'ccxt';
import pg from 'pg';
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { redisAvailable } from '../src/server/redis.ts';

const siblingEnvFiles = (() => {
  try {
    const parent = path.resolve(process.cwd(), '..');
    return fs.readdirSync(parent, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('gain-niagakoin-v4-'))
      .map((entry) => path.join(parent, entry.name, '.env'));
  } catch { return []; }
})();
const envCandidates = [process.env.GAIN24_ENV_FILE, '.env', ...siblingEnvFiles].filter(Boolean);
const envFile = envCandidates.find((p) => fs.existsSync(p));
if (envFile) dotenv.config({ path: envFile });

const { Client } = pg;
const results = [];
let firebaseRunners = [];
const pass = (name, detail = {}) => results.push({ name, status: 'PASS', ...detail });
const fail = (name, error) => results.push({ name, status: 'FAIL', error: String(error?.message || error).slice(0, 500) });
const blocked = (name, reason) => results.push({ name, status: 'BLOCKED', reason });

function decryptCredential(record) {
  const key = Buffer.from(process.env.ENCRYPTION_MASTER_KEY || '', 'utf8');
  if (key.length !== 32) throw new Error('ENCRYPTION_MASTER_KEY is not a 32-byte key');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(record.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(record.auth_tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  const parsed = JSON.parse(plaintext);
  if (!parsed?.apiKey || !parsed?.secret) throw new Error('Decrypted bot credential is incomplete');
  return parsed;
}

async function checkPostgres() {
  if (!process.env.DATABASE_URL) return blocked('postgres', 'DATABASE_URL not configured');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const ping = await client.query('SELECT 1 AS ok');
    const tables = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_name = ANY($1::text[])
      ORDER BY table_name
    `, [['orders','fills','positions','bots','exchange_credentials']]);
    pass('postgres', { connected: true, queryOk: ping.rows[0]?.ok === 1, requiredTables: tables.rows.map((r) => r.table_name) });
  } catch (error) { fail('postgres', error); }
  finally { await client.end().catch(() => {}); }
}

async function checkRedis() {
  if (!process.env.REDIS_URL) {
    if (process.env.REDIS_REQUIRED === 'true') return blocked('redis', 'REDIS_REQUIRED=true but REDIS_URL is missing');
    return blocked('redis', 'REDIS_URL not configured and Redis is not required');
  }
  try { if (!(await redisAvailable())) throw new Error('Redis PING failed'); pass('redis', { ping: 'PONG' }); }
  catch (error) { fail('redis', error); }
}

async function checkFirebase() {
  try {
    if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || undefined });
    const [users, runners] = await Promise.all([
      getAuth().listUsers(1),
      getFirestore().collectionGroup('botRunners').limit(50).get(),
    ]);
    const db = getFirestore();
    firebaseRunners = await Promise.all(runners.docs.map(async (doc) => {
      const d = doc.data() || {};
      const uid = doc.ref.parent.parent?.id || null;
      const leaseSnap = uid ? await db.collection('users').doc(uid).collection('botLocks').doc(doc.id).get() : null;
      const lease = leaseSnap?.data() || {};
      const summary = {
        runnerId: doc.id,
        uid,
        botId: typeof d.botId === 'string' ? d.botId : null,
        exchange: typeof d.exchange === 'string' ? d.exchange : null,
        pair: typeof d.pair === 'string' ? d.pair : null,
        mode: typeof d.mode === 'string' ? d.mode : null,
        isSandbox: d.isSandbox === true,
        status: typeof d.status === 'string' ? d.status : null,
        positionQty: Number(d.positionQty || 0),
        pendingOrderStatus: d.pendingOrder?.status || null,
        pendingClientOrderIdPresent: Boolean(d.pendingOrder?.clientOrderId),
        resumeAfterReconciliation: d.resumeAfterReconciliation === true,
        leasePresent: Boolean(leaseSnap?.exists),
        leaseOwnerPresent: Boolean(lease.owner),
        leaseActive: Number(lease.expiresAt || 0) > Date.now(),
      };
      return summary;
    }));
    pass('firebase', { authConnected: true, sampleUserCount: users.users.length, runnerCountSampled: firebaseRunners.length, runners: firebaseRunners.map(({ uid, ...safe }) => safe) });
  } catch (error) { fail('firebase', error); }
}

async function checkBinanceReadOnlyViaStoredCredential() {
  const runner = firebaseRunners.find((r) => r.mode === 'testnet' && r.exchange && r.uid);
  if (!runner) return blocked('binance-testnet-readonly', 'No testnet runner with exchange/uid was found in Firestore');
  if (!process.env.DATABASE_URL) return blocked('binance-testnet-readonly', 'DATABASE_URL required to load the stored bot credential');
  if (!(process.env.ENCRYPTION_MASTER_KEY || '')) return blocked('binance-testnet-readonly', 'ENCRYPTION_MASTER_KEY required to decrypt the stored bot credential');
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await db.connect();
    const result = await db.query(`SELECT ec.ciphertext, ec.iv, ec.auth_tag, ec.sandbox, ec.status
      FROM exchange_credentials ec JOIN users u ON u.id=ec.user_id
      WHERE u.firebase_uid=$1 AND ec.exchange=$2 AND ec.status='ACTIVE' LIMIT 1`, [runner.uid, runner.exchange.toLowerCase()]);
    if (!result.rows[0]) return blocked('binance-testnet-readonly', `No active stored credential found for runner exchange=${runner.exchange}`);
    const credential = decryptCredential(result.rows[0]);
    if (result.rows[0].sandbox !== true && runner.isSandbox !== true) return blocked('binance-testnet-readonly', 'Stored credential/runner is not marked sandbox; refusing any exchange call');
    const exchangeName = runner.exchange.toLowerCase();
    if (exchangeName !== 'binance') return blocked('binance-testnet-readonly', `Runner exchange is ${exchangeName}, not binance`);
    const exchange = new ccxt.binance({
      apiKey: credential.apiKey,
      secret: credential.secret,
      password: credential.password,
      enableRateLimit: true,
      options: { defaultType: 'spot', adjustForTimeDifference: true },
      timeout: Number(process.env.BINANCE_TESTNET_TIMEOUT_MS || 15000),
    });
    exchange.setSandboxMode(true);
    try {
      await exchange.loadMarkets();
      const [balance, openOrders] = await Promise.all([
        exchange.fetchBalance(),
        exchange.fetchOpenOrders(runner.pair || 'BTC/USDT'),
      ]);
      const btc = balance?.BTC || {};
      pass('binance-testnet-readonly', {
        authenticated: true,
        sandbox: true,
        pair: runner.pair || 'BTC/USDT',
        btcTotal: Number(btc.total || 0),
        btcFree: Number(btc.free || 0),
        openOrders: openOrders.length,
        openOrderIds: openOrders.map((o) => ({ id: o.id, clientOrderId: o.clientOrderId || o.info?.clientOrderId || o.info?.origClientOrderId || null, status: o.status })),
      });
    } finally { exchange.close(); }
  } catch (error) { fail('binance-testnet-readonly', error); }
  finally { await db.end().catch(() => {}); }
}

await checkPostgres();
await checkRedis();
await checkFirebase();
await checkBinanceReadOnlyViaStoredCredential();

const failures = results.filter((r) => r.status === 'FAIL');
const blockedResults = results.filter((r) => r.status === 'BLOCKED');
console.log(JSON.stringify({
  readOnly: true,
  exchangeWrites: 0,
  generatedAt: new Date().toISOString(),
  envFile: envFile || null,
  results,
  verdict: failures.length ? 'FAIL' : blockedResults.length ? 'BLOCKED' : 'PASS',
}, null, 2));
process.exit(failures.length ? 1 : blockedResults.length ? 2 : 0);
