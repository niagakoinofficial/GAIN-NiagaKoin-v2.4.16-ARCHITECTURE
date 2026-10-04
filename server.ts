import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import ccxt from 'ccxt';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { redisGet, redisSetEx, redisSetNxEx, redisDel, redisIncr, redisExpire, redisAvailable } from './src/server/redis';
import {
  applyBuyFill,
  applyRecoveredFill,
  applySellFill,
  BotExecutionFailure,
  buildClientOrderId,
  botRegistryKey,
  classifyBotExecutionError,
  deriveBotRunnerId,
  getRunnerFailureState,
  isFreshPrice,
  retryBotExchangeAction,
  selectOwnedBotEntries,
  shouldExecuteTakeProfit,
  validateMarketOrderLimits,
} from './src/services/botEngineCore';
import v2EngineApi from './src/v2/api/v2EngineApi';
import { generateDcaLayers, evaluateDca } from './src/v2/engines/strategy/DcaEngine';
import { getBotRecoveryStatus, isStartupAutoResumeEnabled } from './src/services/botRecovery';
import { generateGridLevels, evaluateGrid, pairGridLevel } from './src/v2/engines/strategy/GridEngine';
import { assessStrategyRisk } from './src/utils/strategyRiskGuardrails';
import { evaluateRisk } from './src/v2/engines/risk/RiskEngine';
import type { DcaLayer, GridLevel, MarketSnapshot as V2MarketSnapshot } from './src/v2/domain/strategy/types';
import { MarketDataEngine } from './src/v2/engines/marketData/MarketDataEngine';
import { WebSocketManager } from './src/v2/engines/marketData/WebSocketManager';
import { normalizeOhlcvRows, aggregateOhlcv, nativeStrategyTimeframe, selectLastTwoClosedCandles, toClosedStrategyCandle } from './src/v2/engines/strategy/candleDriven';
import { checkDatabase, dbQuery, ensureUser, getUserByFirebaseUid, getUserByMemberId, getWalletSnapshot, createWalletIfMissing, appendLedgerEntry, createAuditEvent, createOrderRecord, finalizeOrderWithFill, saveTwoFactorSecret, getTwoFactorSecretRecord, consumeTotpCounter, activateLicenseAtomic, transferFundsAtomic, createWithdrawalRequest, recordConfirmedDeposit, topupGasAtomic, getProfitShareSummary, getGasAutoRefillConfig, upsertGasAutoRefillConfig, processGasAutoRefills, settleWithdrawal, rejectWithdrawal, upsertBotRuntime, updateBotRuntimeStatus, saveExchangeCredential, getExchangeCredential, getExchangeConnection, findExchangeIdentityOwner, getExchangeCredentialHistory, deleteExchangeCredential, getSystemSetting, setSystemSetting, createExchangeCertificationRun, updateExchangeCertificationRun, getLatestExchangeCertificationRun } from './src/server/database';
import { getLicenseTierConfig, getReferralActivationBonus } from './src/config/licensePromo';
import { FINANCIAL_CONFIG } from './src/config/financialConfig';
import { EXCHANGE_REGISTRY, getExchangeDescriptor, getExchangeIds } from './src/config/exchangeRegistry';
import { buildEmailIdempotencyKey, getEmailDeliveryConfig, sendTransactionalEmail, EmailDeliveryError } from './src/server/emailDelivery';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const SERVER_STARTED_AT = Date.now();
const requestRateLimitMap = new Map<string, { count: number; resetTime: number }>();
const apiRequestMetrics = new Map<string, { count: number; failures: number; totalDurationMs: number; slowRequests: number }>();
const SUPPORTED_EXCHANGES = new Set(getExchangeIds());
const EXCHANGE_RETRY_ATTEMPTS = 2;
const EXCHANGE_TIMEOUT_MS = 7000;
const BOT_ORDER_RETRY_ATTEMPTS = 3;
const BOT_FAILURE_PAUSE_THRESHOLD = 3;
const BOT_RECONCILIATION_INTERVAL_MS = 5 * 60_000;
const circuitBreakerMap = new Map<string, { failures: number; openedAt: number; cooldownMs: number }>();
const IS_DEVELOPMENT = process.env.NODE_ENV !== 'production';
const ALLOWED_CORS_ORIGINS = new Set((process.env.CORS_ALLOWED_ORIGINS || (IS_DEVELOPMENT
  ? 'http://localhost:3000,http://127.0.0.1:3000,https://localhost:3000,https://127.0.0.1:3000'
  : '')).split(',').map((origin) => origin.trim()).filter(Boolean));
const FIREBASE_PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || '';
const FIREBASE_AUTH_DOMAIN = (process.env.VITE_FIREBASE_AUTH_DOMAIN || (FIREBASE_PROJECT_ID ? `${FIREBASE_PROJECT_ID}.firebaseapp.com` : '')).replace(/^https?:\/\//, '');
const FIRESTORE_DATABASE_ID = process.env.VITE_FIREBASE_DATABASE_ID || '(default)';
if (!FIREBASE_PROJECT_ID) {
  throw new Error('[FIREBASE_CONFIG_INVALID] Missing VITE_FIREBASE_PROJECT_ID/FIREBASE_PROJECT_ID.');
}
const LOCAL_ADC_CREDENTIALS_PATH = join(homedir(), '.config', 'gcloud', 'application_default_credentials.json');
const FIREBASE_ADMIN_CREDENTIALS_CONFIGURED = Boolean(
  (process.env.GOOGLE_APPLICATION_CREDENTIALS && existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS))
  || existsSync(LOCAL_ADC_CREDENTIALS_PATH)
  || process.env.K_SERVICE
  || process.env.GAE_ENV
  || process.env.FIREBASE_ADMIN_ENABLED === 'true'
);
const firebaseAdminApp = getApps()[0] ?? initializeApp({
  credential: applicationDefault(),
  projectId: FIREBASE_PROJECT_ID,
});
const firebaseAdminAuth = getAuth(firebaseAdminApp);
const firebaseAdminFirestore = getFirestore(firebaseAdminApp, FIRESTORE_DATABASE_ID);
let runtimeLiveTradingEnabled = process.env.LIVE_TRADING_ENABLED === 'true';
const LIVE_TRADING_TESTNET_ONLY = process.env.LIVE_TRADING_TESTNET_ONLY !== 'false';
function positiveEnvLimit(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
const MAX_BOT_ORDER_USDT = positiveEnvLimit('BOT_MAX_ORDER_USDT', 50);
const MAX_BOT_EXPOSURE_USDT = positiveEnvLimit('BOT_MAX_EXPOSURE_USDT', 250);
const MAX_USER_EXPOSURE_USDT = positiveEnvLimit('BOT_USER_MAX_EXPOSURE_USDT', 500);
const MAX_USER_DAILY_LOSS_USDT = positiveEnvLimit('BOT_USER_MAX_DAILY_LOSS_USDT', 25);
const MAX_USER_ORDERS_PER_MINUTE = positiveEnvLimit('BOT_USER_MAX_ORDERS_PER_MINUTE', 5);
const GAIN_V2_ENABLED = process.env.GAIN_V2_ENABLED === 'true';
const BOT_STARTUP_AUTO_RESUME = isStartupAutoResumeEnabled(
  process.env.BOT_STARTUP_AUTO_RESUME,
  process.env.BOT_STARTUP_AUTO_RESUME_CONFIRM,
);
const V2_MAX_COMMITTED_CAPITAL_USDT = positiveEnvLimit('BOT_MAX_COMMITTED_CAPITAL_USDT', MAX_BOT_EXPOSURE_USDT);
const V2_MAX_DRAWDOWN_PCT = positiveEnvLimit('BOT_MAX_DRAWDOWN_PCT', 20);
const V2_MAX_SPREAD_PCT = positiveEnvLimit('BOT_MAX_SPREAD_PCT', 0.5);
const V2_MAX_SLIPPAGE_PCT = positiveEnvLimit('BOT_MAX_SLIPPAGE_PCT', 0.35);
const V2_MARKET_DATA_MAX_AGE_MS = positiveEnvLimit('BOT_MARKET_DATA_MAX_AGE_MS', 10000);
const emailVerificationChallenges = new Map<string, { codeHash: string; expiresAt: number; attempts: number; sentAt: number }>();
const loginVerificationChallenges = new Map<string, { codeHash: string; expiresAt: number; attempts: number; sentAt: number }>();
const localSessionElevation = new Map<string, { uid: string; expiresAt: number }>();
const SECURITY_CSP = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  `script-src 'self' https://apis.google.com${IS_DEVELOPMENT ? " 'unsafe-inline' 'unsafe-eval'" : ''}`,
  "img-src 'self' data: https:",
  `connect-src 'self' https: wss://stream.binance.com:9443 wss://stream.testnet.binance.vision${IS_DEVELOPMENT ? ' ws://localhost:* ws://127.0.0.1:*' : ''}`,
  "font-src 'self' data: https://fonts.gstatic.com",
  `frame-src 'self' https://${FIREBASE_AUTH_DOMAIN}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self' https://*.google.com https://*.googleusercontent.com https://*.run.app",
  "form-action 'self'",
].join('; ');
const CLIENT_OBSERVABILITY_EVENTS = new Set([
  'auth.login.success',
  'auth.login.failed',
  'auth.logout.success',
  'auth.logout.failed',
  'auth.permission.changed',
  'auth.google.authenticated',
  'wallet.deposit.verified',
  'wallet.withdraw.submitted',
  'wallet.transfer.completed',
  'admin.action.attempted',
  'exchange.error',
  'client.render.error',
  'client.unhandled.rejection',
]);
const WEB_VITAL_NAMES = new Set(['CLS', 'FCP', 'INP', 'LCP', 'TTFB']);
const SAFE_OBSERVABILITY_ATTRIBUTES = new Set([
  'provider', 'enabled', 'target', 'network', 'exchange', 'symbol', 'side',
  'statusCode', 'errorName', 'errorCode', 'action', 'rating', 'metricName', 'metricId', 'value',
]);

class ApiError extends Error {
  statusCode: number;
  code: string;
  category: string;
  userMessage?: string;

  constructor(statusCode: number, code: string, category: string, message: string, userMessage?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.category = category;
    this.userMessage = userMessage;
  }
}

interface FirebaseIdentity {
  uid: string;
  email: string;
  emailVerified: boolean;
}

function hashVerificationCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function parseCookies(header = ''): Record<string, string> {
  return Object.fromEntries(header.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const i = part.indexOf('=');
    return i > 0 ? [part.slice(0, i), decodeURIComponent(part.slice(i + 1))] : ['', ''];
  }).filter(([k]) => k));
}

function setSessionElevationCookie(res: Response, token: string, maxAgeSeconds = 24 * 60 * 60) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `gain_session_elevation=${encodeURIComponent(token)}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; SameSite=Lax${secure}`);
}

function clearSessionElevationCookie(res: Response) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `gain_session_elevation=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`);
}

const SESSION_ELEVATION_TTL_SECONDS = 24 * 60 * 60;

function hashSessionElevationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function createSessionElevation(uid: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + SESSION_ELEVATION_TTL_SECONDS * 1000;
  const key = `gain:session:elevated:${token}`;

  // Redis is the fast path. PostgreSQL is the durable authority so a
  // server restart / Redis restart does NOT force a fresh login code.
  const stored = await redisSetEx(key, uid, SESSION_ELEVATION_TTL_SECONDS);
  if (!stored) localSessionElevation.set(token, { uid, expiresAt });

  try {
    await dbQuery(
      `INSERT INTO auth_session_elevations (token_hash, firebase_uid, expires_at, created_at)
       VALUES ($1, $2, to_timestamp($3 / 1000.0), now())
       ON CONFLICT (token_hash) DO UPDATE SET firebase_uid = EXCLUDED.firebase_uid, expires_at = EXCLUDED.expires_at`,
      [hashSessionElevationToken(token), uid, expiresAt],
    );
  } catch (error) {
    console.warn('[AUTH_SESSION_DURABLE_WRITE_FAILED]', {
      uid,
      code: String((error as any)?.code || 'DB_WRITE_FAILED').slice(0, 80),
    });
  }

  return token;
}

async function isSessionElevated(req: Request, uid: string): Promise<boolean> {
  const token = parseCookies(String(req.headers.cookie || '')).gain_session_elevation;
  if (!token) return false;
  const now = Date.now();
  const redisUid = await redisGet(`gain:session:elevated:${token}`);
  if (redisUid) return redisUid === uid;

  const local = localSessionElevation.get(token);
  if (local && local.expiresAt > now) return local.uid === uid;
  if (local) localSessionElevation.delete(token);

  // Redis may have been restarted/evicted. Recover the same 24h session
  // from PostgreSQL instead of demanding another email verification code.
  try {
    const durable = await dbQuery<{ firebase_uid: string; expires_at_ms: number | string }>(
      `SELECT firebase_uid, floor(extract(epoch from expires_at) * 1000) AS expires_at_ms
         FROM auth_session_elevations
        WHERE token_hash = $1
          AND expires_at > now()
        LIMIT 1`,
      [hashSessionElevationToken(token)],
    );
    const row = durable.rows[0];
    if (!row || row.firebase_uid !== uid) return false;

    const expiresAt = Number(row.expires_at_ms);
    const ttl = Math.max(1, Math.ceil((expiresAt - now) / 1000));
    await redisSetEx(`gain:session:elevated:${token}`, uid, Math.min(SESSION_ELEVATION_TTL_SECONDS, ttl));
    localSessionElevation.set(token, { uid, expiresAt });
    return true;
  } catch (error) {
    console.warn('[AUTH_SESSION_DURABLE_READ_FAILED]', {
      uid,
      code: String((error as any)?.code || 'DB_READ_FAILED').slice(0, 80),
    });
    return false;
  }
}

async function requireAdmin(req: Request): Promise<string> {
  const authorization = req.header('authorization') || '';
  const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!idToken) throw new ApiError(401,'AUTH_REQUIRED','authentication','Admin authentication is required.','Autentikasi admin diperlukan.');
  try {
    const decoded = await firebaseAdminAuth.verifyIdToken(idToken, true);
    if (decoded.admin !== true) throw new ApiError(403,'ADMIN_REQUIRED','authorization','Administrator privileges are required.','Hak akses administrator diperlukan.');
    return decoded.uid;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401,'AUTH_INVALID','authentication','Firebase admin token is invalid or expired.','Sesi admin tidak valid atau sudah kedaluwarsa.');
  }
}

async function requireSecuritySession(req: Request, uid: string) {
  await requireActiveMember(uid);
  if (process.env.NODE_ENV !== 'production') return;
  if (!(await isSessionElevated(req, uid))) {
    throw new ApiError(403, 'SESSION_ELEVATION_REQUIRED', 'authorization', 'Security verification is required for this action.', 'Verifikasi keamanan sesi diperlukan untuk tindakan ini. Verifikasi keamanan 6 digit akan diminta saat diperlukan.');
  }
}

async function requireActiveLicense(uid: string) {
  requireDatabase();
  const snapshot = await getWalletSnapshot(uid);
  if (process.env.NODE_ENV !== 'production') return snapshot;
  const licenseStatus = String(snapshot?.license_status || 'NONE').toUpperCase();
  if (licenseStatus !== 'ACTIVE') {
    throw new ApiError(403, 'LICENSE_REQUIRED', 'authorization', 'An active GAIN license is required for this feature.', 'Lisensi GAIN aktif diperlukan untuk menggunakan fitur ini.');
  }
  return snapshot;
}

async function requireActiveMember(uid: string) {
  requireDatabase();
  const snapshot = await getWalletSnapshot(uid);
  const memberStatus = String(snapshot?.member_status || snapshot?.status || 'active').toLowerCase();
  if (memberStatus === 'suspended') {
    throw new ApiError(403, 'MEMBER_SUSPENDED', 'authorization', 'This GAIN member account is suspended.', 'Akun Member GAIN sedang ditangguhkan.');
  }
  if (memberStatus === 'closed') {
    throw new ApiError(403, 'MEMBER_CLOSED', 'authorization', 'This GAIN member account is closed.', 'Akun Member GAIN sudah ditutup.');
  }
  if (memberStatus !== 'active') {
    throw new ApiError(403, 'MEMBER_NOT_ACTIVE', 'authorization', 'This GAIN member account is not active.', 'Status akun Member GAIN tidak aktif.');
  }
  return snapshot;
}

async function requireLicensedSecuritySession(req: Request, uid: string) {
  await requireActiveLicense(uid);
  await requireSecuritySession(req, uid);
}

type VerificationChallenge = { codeHash: string; expiresAt: number; attempts: number; sentAt: number };

async function getChallenge(kind: 'login' | 'email', uid: string): Promise<VerificationChallenge | undefined> {
  const key = `gain:${kind}:challenge:${uid}`;
  const raw = await redisGet(key);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as VerificationChallenge;
      if (parsed.expiresAt > Date.now()) return parsed;
    } catch {}
  }

  // Redis is the fast/session store, but verification must survive a server restart.
  // PostgreSQL is the durable fallback/source when Redis is unavailable or has been restarted.
  try {
    const durable = await dbQuery<{
      code_hash: string;
      expires_at_ms: number | string;
      attempts: number;
      sent_at_ms: number | string;
    }>(
      `SELECT encode(code_hash, 'hex') AS code_hash,
              floor(extract(epoch from expires_at) * 1000) AS expires_at_ms,
              attempts,
              floor(extract(epoch from sent_at) * 1000) AS sent_at_ms
         FROM auth_verification_challenges
        WHERE firebase_uid = $1 AND kind = $2
          AND expires_at > now()
        LIMIT 1`,
      [uid, kind],
    );
    const row = durable.rows[0];
    if (row) {
      const value: VerificationChallenge = {
        codeHash: row.code_hash,
        expiresAt: Number(row.expires_at_ms),
        attempts: Number(row.attempts),
        sentAt: Number(row.sent_at_ms),
      };
      const ttl = Math.max(1, Math.ceil((value.expiresAt - Date.now()) / 1000));
      await redisSetEx(key, JSON.stringify(value), Math.min(600, ttl));
      return value;
    }
  } catch (error) {
    console.warn('[OTP_DURABLE_READ_FALLBACK]', {
      kind,
      code: String((error as any)?.code || 'DB_READ_FAILED').slice(0, 80),
    });
  }

  const memory = (kind === 'login' ? loginVerificationChallenges : emailVerificationChallenges).get(uid);
  if (memory && memory.expiresAt > Date.now()) return memory;
  return undefined;
}

async function setChallenge(kind: 'login' | 'email', uid: string, value: VerificationChallenge) {
  const key = `gain:${kind}:challenge:${uid}`;
  const ttl = Math.max(1, Math.min(600, Math.ceil((value.expiresAt - Date.now()) / 1000)));
  const savedRedis = await redisSetEx(key, JSON.stringify(value), ttl);

  try {
    await dbQuery(
      `INSERT INTO auth_verification_challenges (firebase_uid, kind, code_hash, expires_at, attempts, sent_at, updated_at)
       VALUES ($1, $2, decode($3, 'hex'), to_timestamp($4 / 1000.0), $5, to_timestamp($6 / 1000.0), now())
       ON CONFLICT (firebase_uid, kind)
       DO UPDATE SET code_hash = EXCLUDED.code_hash,
                     expires_at = EXCLUDED.expires_at,
                     attempts = EXCLUDED.attempts,
                     sent_at = EXCLUDED.sent_at,
                     updated_at = now()`,
      [uid, kind, value.codeHash, value.expiresAt, value.attempts, value.sentAt],
    );
  } catch (error) {
    console.warn('[OTP_DURABLE_WRITE_FAILED]', {
      kind,
      code: String((error as any)?.code || 'DB_WRITE_FAILED').slice(0, 80),
    });
  }

  // Keep the process-local copy as a final fallback for development/offline mode.
  (kind === 'login' ? loginVerificationChallenges : emailVerificationChallenges).set(uid, value);

  if (!savedRedis) {
    console.warn('[OTP_REDIS_UNAVAILABLE_USING_DURABLE_DB]', { kind });
  }
}

async function deleteChallenge(kind: 'login' | 'email', uid: string) {
  await redisDel(`gain:${kind}:challenge:${uid}`);
  try {
    await dbQuery('DELETE FROM auth_verification_challenges WHERE firebase_uid = $1 AND kind = $2', [uid, kind]);
  } catch (error) {
    console.warn('[OTP_DURABLE_DELETE_FAILED]', {
      kind,
      code: String((error as any)?.code || 'DB_DELETE_FAILED').slice(0, 80),
    });
  }
  (kind === 'login' ? loginVerificationChallenges : emailVerificationChallenges).delete(uid);
}

async function checkRedisRateLimit(key: string, maxRequests: number, windowSeconds: number): Promise<boolean> {
  const count = await redisIncr(`gain:rl:${key}`);
  if (count === null) return process.env.REDIS_REQUIRED !== 'true';
  if (count === 1) await redisExpire(`gain:rl:${key}`, windowSeconds);
  return count <= maxRequests;
}

async function requireFirebaseIdentity(req: Request): Promise<{ identity: FirebaseIdentity; idToken: string }> {
  const authorization = req.header('authorization') || '';
  const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';

  if (!idToken) {
    throw new ApiError(
      401,
      'AUTH_REQUIRED',
      'authentication',
      'A valid Firebase sign-in is required.',
      'Silakan login dengan akun Firebase yang valid.'
    );
  }

  try {
    // Firebase Admin SDK is the authoritative verifier for authenticated API requests.
    // Do not call Identity Toolkit accounts:lookup from every authenticated request.
    const decoded = await firebaseAdminAuth.verifyIdToken(idToken, true);

    const email = typeof decoded.email === 'string' ? decoded.email.trim() : '';
    if (!decoded.uid || !email) {
      throw new ApiError(
        401,
        'AUTH_INVALID',
        'authentication',
        'Firebase account identity is incomplete.',
        'Identitas akun Firebase tidak lengkap.'
      );
    }

    return {
      idToken,
      identity: {
        uid: decoded.uid,
        email,
        emailVerified: decoded.email_verified === true,
      },
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;

    console.warn('[FIREBASE_ID_TOKEN_INVALID]', {
      code: typeof (error as any)?.code === 'string'
        ? (error as any).code
        : 'auth/id-token-invalid',
    });

    throw new ApiError(
      401,
      'AUTH_INVALID',
      'authentication',
      'Firebase sign-in token is invalid or expired.',
      'Sesi login Firebase tidak valid atau sudah kedaluwarsa. Silakan login ulang.'
    );
  }
}

async function syncFirestoreWalletReadModel(firebaseUid: string, extra: Record<string, unknown> = {}) {
  if (!databaseReady) return;
  const snapshot = await getWalletSnapshot(firebaseUid);
  if (!snapshot) return;
  const licenseStatus = String(snapshot.license_status || 'NONE').toUpperCase() === 'ACTIVE' ? 'active' : 'none';
  await firebaseAdminFirestore.collection('users').doc(firebaseUid).set({
    id: firebaseUid,
    memberId: snapshot.member_id || '',
    // Backward-compatible alias: accountStatus now reflects license entitlement,
    // while memberStatus remains the administrative member lifecycle.
    accountStatus: licenseStatus === 'active' ? 'active' : 'non-active',
    memberStatus: snapshot.member_status || snapshot.status || 'active',
    licenseStatus,
    ...(snapshot.license_tier ? { licenseTier: snapshot.license_tier } : {}),
    ...(snapshot.license_type ? { licenseType: snapshot.license_type } : {}),
    ...(snapshot.license_name ? { licenseName: snapshot.license_name } : {}),
    ...(snapshot.max_active_bots ? { maxActiveBots: Number(snapshot.max_active_bots) } : {}),
    licenseExpiresAt: snapshot.license_expires_at || null,
    liquidBalance: Number(snapshot.available_balance || 0),
    availableCash: Number(snapshot.available_balance || 0),
    gasReserve: Number(snapshot.gas_reserve || 0),
    totalInflow: Number(snapshot.total_inflow || 0),
    totalOutflow: Number(snapshot.total_outflow || 0),
    nonCashGasBonus: Number(snapshot.non_cash_gas_bonus || 0),
    withdrawableTradingYield: Number(snapshot.withdrawable_trading_yield || 0),
    sponsorId: snapshot.sponsor_member_id || '',
    ...extra,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
  if (snapshot.member_id) {
    await firebaseAdminFirestore.collection('member_directory').doc(snapshot.member_id).set({
      memberId: snapshot.member_id,
      userId: firebaseUid,
      accountStatus: licenseStatus === 'active' ? 'active' : 'non-active',
      memberStatus: snapshot.member_status || snapshot.status || 'active',
      licenseStatus,
    }, { merge:true });
  }
}

async function mirrorFinancialTransaction(firebaseUid: string, tx: Record<string, unknown>) {
  await firebaseAdminFirestore.collection('users').doc(firebaseUid).collection('transactions').doc(String(tx.id)).set({
    ...tx,
    userId: firebaseUid,
    createdAt: tx.createdAt || new Date().toISOString(),
  }, { merge: false });
}

function requireDatabase(): void {
  if (!databaseReady) {
    throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'configuration', 'Authoritative financial database is unavailable.', 'Database finansial belum siap. Silakan coba lagi setelah layanan pulih.');
  }
}

function getSensitiveEncryptionKey(): Buffer {
  const configuredKey = process.env.ENCRYPTION_MASTER_KEY || '';
  const key = Buffer.from(configuredKey, 'utf8');
  if (key.length !== 32) throw new ApiError(503, 'ENCRYPTION_KEY_NOT_CONFIGURED', 'configuration', 'A 32-byte encryption key is required.', 'Kunci enkripsi server belum dikonfigurasi.');
  return key;
}

function encryptSensitiveString(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getSensitiveEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64') };
}

function decryptSensitiveString(record: { ciphertext: string; iv: string; authTag: string }): string {
  const decipher = createDecipheriv('aes-256-gcm', getSensitiveEncryptionKey(), Buffer.from(record.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(record.authTag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(record.ciphertext, 'base64')), decipher.final()]).toString('utf8');
}

function base32Decode(value: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = value.toUpperCase().replace(/=+$/, '').replace(/[^A-Z2-7]/g, '');
  let bits = 0; let buffer = 0; const out: number[] = [];
  for (const char of clean) {
    buffer = (buffer << 5) | alphabet.indexOf(char); bits += 5;
    if (bits >= 8) { bits -= 8; out.push((buffer >> bits) & 0xff); }
  }
  return Buffer.from(out);
}

function calculateTotp(secret: string, counter: number): string {
  const data = Buffer.alloc(8);
  data.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  data.writeUInt32BE(counter >>> 0, 4);
  const digest = createHmac('sha1', base32Decode(secret)).update(data).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

function verifyServerTotp(token: string, secret: string, window = 1): { valid: boolean; counter?: number } {
  if (!/^\d{6}$/.test(token)) return { valid: false };
  const counter = Math.floor(Date.now() / 1000 / 30);
  for (let offset = -window; offset <= window; offset += 1) {
    const candidate = counter + offset;
    if (timingSafeEqual(Buffer.from(calculateTotp(secret, candidate)), Buffer.from(token))) return { valid: true, counter: candidate };
  }
  return { valid: false };
}

function firestoreDocumentName(documentPath: string): string {
  return `projects/${FIREBASE_PROJECT_ID}/databases/${encodeURIComponent(FIRESTORE_DATABASE_ID)}/documents/${documentPath}`;
}

function toFirestoreValue(value: unknown): Record<string, unknown> {
  if (value === null) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (typeof value === 'object') {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toFirestoreValue(item)])) } };
  }
  return { nullValue: null };
}

function toFirestoreFields(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, toFirestoreValue(value)]));
}

function firestoreNumber(value: any): number {
  return Number(value?.doubleValue ?? value?.integerValue ?? 0);
}

async function firestoreRequest(idToken: string, endpoint: string, init: RequestInit = {}, allowNotFound = false): Promise<any> {
  const response = await fetch(`https://firestore.googleapis.com/v1/${endpoint}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const payload = await response.json().catch(() => null);
  if (response.status === 404 && allowNotFound) return null;
  if (!response.ok) {
    const statusCode = response.status === 403 ? 403 : 502;
    throw new ApiError(statusCode, 'FIRESTORE_OPERATION_FAILED', 'upstream', 'Firestore rejected the requested wallet update.', 'Data akun tidak dapat diperbarui. Periksa aturan Firestore dan coba lagi.');
  }
  return payload;
}

async function commitFirestoreWrites(idToken: string, writes: unknown[]): Promise<void> {
  const endpoint = `projects/${FIREBASE_PROJECT_ID}/databases/${encodeURIComponent(FIRESTORE_DATABASE_ID)}/documents:commit`;
  await firestoreRequest(idToken, endpoint, { method: 'POST', body: JSON.stringify({ writes }) });
}

function assertRealExchangeCredentials(apiKey: string, secret: string): void {
  const key = apiKey.trim().toLowerCase();
  const sec = secret.trim().toLowerCase();
  if (key.includes('demo') || key.includes('dummy') || sec.includes('demo') || sec.includes('dummy')) {
    throw new ApiError(400, 'DEMO_CREDENTIALS_REJECTED', 'validation', 'Demo or dummy exchange credentials are not accepted.', 'Kredensial demo/dummy tidak diterima. Gunakan API key Testnet atau Live yang benar-benar diterbitkan exchange.');
  }
}

function sanitizeExchangeInput(input: any, options?: { requirePassphrase?: boolean }): {
  exchange: string;
  apiKey: string;
  secret: string;
  password: string;
  isSandbox: boolean;
  dcaLayers?: DcaLayer[];
  gridLevels?: GridLevel[];
  committedCapitalUsd?: number;
  closedLayerIds?: string[];
} {
  const exchange = String(input?.exchange ?? 'bitget').trim().toLowerCase();
  const descriptor = getExchangeDescriptor(exchange);

  if (!descriptor || !SUPPORTED_EXCHANGES.has(exchange)) {
    throw new Error(`Exchange "${exchange}" tidak didukung pada server.`);
  }
  if (!descriptor.authenticatedApi || !descriptor.ccxtId) {
    throw new ApiError(409, 'EXCHANGE_NATIVE_API_REQUIRED', 'exchange', `Exchange ${descriptor.name} does not expose a verified authenticated adapter.`, `Exchange ${descriptor.name} saat ini hanya dapat diuji melalui certification/read-only adapter.`);
  }

  const apiKey = typeof input?.apiKey === 'string' ? input.apiKey.trim() : '';
  const secret = typeof input?.secret === 'string' ? input.secret.trim() : '';
  const password = typeof input?.password === 'string' ? input.password.trim() : '';
  const isSandbox = input?.isSandbox === true || input?.isSandbox === 'true';

  if (!apiKey || !secret) {
    throw new ApiError(400, 'EXCHANGE_CREDENTIALS_REQUIRED', 'validation', 'Exchange API credentials are required.', 'API Key dan Secret Key wajib diisi.');
  }

  if (apiKey.length < 8 || secret.length < 8) {
    throw new ApiError(400, 'EXCHANGE_CREDENTIALS_INVALID', 'validation', 'Exchange API credentials have an invalid format.', 'Format API Key atau Secret Key tidak valid.');
  }

  assertRealExchangeCredentials(apiKey, secret);

  if (options?.requirePassphrase && !password) {
    throw new ApiError(400, 'EXCHANGE_PASSPHRASE_REQUIRED', 'validation', `Exchange ${exchange.toUpperCase()} requires an API passphrase.`, `Exchange ${exchange.toUpperCase()} memerlukan Passphrase API.`);
  }

  return { exchange, apiKey, secret, password, isSandbox };
}

function safeExchangeLog(label: string, meta: Record<string, any>) {
  console.warn(`[${label}]`, {
    ...meta,
    apiKey: meta.apiKey ? '[REDACTED]' : undefined,
    secret: meta.secret ? '[REDACTED]' : undefined,
    password: meta.password ? '[REDACTED]' : undefined,
  });
}

function isExchangeSymbolError(error: any): boolean {
  const message = String(error?.message || error || '').toLowerCase();
  const name = String(error?.name || '').toLowerCase();
  return /does not have market symbol|bad symbol|market.*not.*found|symbol.*not.*found|invalid symbol|unknown symbol/.test(`${name} ${message}`);
}

function isDeterministicExchangeInputError(error: any): boolean {
  const message = String(error?.message || error || '').toLowerCase();
  const name = String(error?.name || '').toLowerCase();
  return isExchangeSymbolError(error)
    || /requires? .*symbol|symbol .*required|missing .*symbol|argument .*required|parameter .*required|invalid argument|invalid parameter/.test(`${name} ${message}`);
}

function withExchangeRetry<T>(exchange: string, label: string, action: () => Promise<T>): Promise<T> {
  return (async () => {
    let lastError: any;

    for (let attempt = 1; attempt <= EXCHANGE_RETRY_ATTEMPTS; attempt += 1) {
      try {
        const result = await action();
        registerExchangeSuccess(exchange);
        return result;
      } catch (error: any) {
        lastError = error;
        safeExchangeLog(`${label}:retry`, {
          exchange,
          attempt,
          message: sanitizeErrorMessage(error?.message || 'exchange_error'),
        });

        // Deterministic input/market errors must never be retried.
        if (isDeterministicExchangeInputError(error)) throw error;

        if (attempt < EXCHANGE_RETRY_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
        }
      }
    }

    throw lastError ?? new Error(`${label} failed`);
  })();
}

function registerExchangeSuccess(exchange: string): void {
  circuitBreakerMap.delete(exchange.trim().toLowerCase());
}

function applyCircuitBreaker(exchange: string): boolean {
  const state = circuitBreakerMap.get(exchange);
  if (!state) return true;

  const now = Date.now();
  if (now - state.openedAt >= state.cooldownMs) {
    circuitBreakerMap.delete(exchange);
    return true;
  }

  return false;
}

function registerExchangeFailure(exchange: string): void {
  const current = circuitBreakerMap.get(exchange) ?? { failures: 0, openedAt: 0, cooldownMs: 30000 };
  const failures = current.failures + 1;

  if (failures >= 3) {
    circuitBreakerMap.set(exchange, { failures, openedAt: Date.now(), cooldownMs: 30000 });
    return;
  }

  circuitBreakerMap.set(exchange, { failures, openedAt: current.openedAt || Date.now(), cooldownMs: 30000 });
}

async function checkGlobalRequestRateLimit(key: string, maxRequests: number = 120, windowMs: number = 60000): Promise<boolean> {
  const redisAllowed = await checkRedisRateLimit(`global:${key}`, maxRequests, Math.ceil(windowMs / 1000));
  if (!redisAllowed) return false;
  const now = Date.now();
  const entry = requestRateLimitMap.get(key);
  if (!entry || now > entry.resetTime) { requestRateLimitMap.set(key, { count: 1, resetTime: now + windowMs }); return true; }
  if (entry.count >= maxRequests) return false;
  entry.count += 1;
  return true;
}

function isAllowedOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    if (ALLOWED_CORS_ORIGINS.has(parsed.origin)) return true;
    // Allow Google Cloud Run preview domain and AI Studio origin
    if (parsed.hostname.endsWith('.run.app') || parsed.hostname.endsWith('.google.com') || parsed.hostname.endsWith('.googleusercontent.com')) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function getRequestId(res: Response): string {
  return String(res.getHeader('X-Request-Id') || 'unknown');
}

function logAuditEvent(req: Request, res: Response, event: string, attributes: Record<string, string | number | boolean> = {}): void {
  console.info(JSON.stringify({
    level: 'info',
    event: 'audit',
    requestId: getRequestId(res),
    uid: res.locals.botUid || 'anonymous',
    auditEvent: event,
    ...attributes,
  }));
}

function sanitizeObservabilityAttributes(input: unknown): Record<string, string | number | boolean> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const safeAttributes: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!SAFE_OBSERVABILITY_ATTRIBUTES.has(key)) continue;
    if (typeof value === 'string' && value.length <= 64) safeAttributes[key] = value;
    else if (typeof value === 'boolean') safeAttributes[key] = value;
    else if (typeof value === 'number' && Number.isFinite(value)) safeAttributes[key] = value;
  }
  return safeAttributes;
}

app.disable('x-powered-by');
app.options('*', (req: Request, res: Response) => {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-Id');
  res.sendStatus(204);
});

app.use(async (req: Request, res: Response, next) => {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const requestId = randomUUID();
  res.locals.requestId = requestId;
  const requestStartedAt = performance.now();
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // X-Frame-Options removed to allow AI Studio iframe preview, governed by CSP frame-ancestors
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Content-Security-Policy', SECURITY_CSP);
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-Id');

  res.on('finish', () => {
    if (!req.path.startsWith('/api/')) return;
    const durationMs = Math.max(0, performance.now() - requestStartedAt);
    const routePath = req.route?.path
      ? `${req.baseUrl}${req.route.path}`
      : '/api/unmatched';
    const metricKey = `${req.method} ${routePath}`;
    const previous = apiRequestMetrics.get(metricKey) || { count: 0, failures: 0, totalDurationMs: 0, slowRequests: 0 };
    previous.count += 1;
    previous.failures += res.statusCode >= 500 ? 1 : 0;
    previous.totalDurationMs += durationMs;
    previous.slowRequests += durationMs >= 1500 ? 1 : 0;
    apiRequestMetrics.set(metricKey, previous);

    if (res.statusCode >= 500 || durationMs >= 1500) {
      console.warn('[API_METRIC]', {
        requestId,
        method: req.method,
        route: routePath,
        statusCode: res.statusCode,
        durationMs: Number(durationMs.toFixed(1)),
      });
    }
  });

  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
    const referer = typeof req.headers.referer === 'string' ? req.headers.referer : '';
    const sameOrigin = !origin || origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}`;
    let validReferer = !referer;
    if (referer) {
      try {
        const refererOrigin = new URL(referer).origin;
        validReferer = refererOrigin === origin || isAllowedOrigin(refererOrigin);
      } catch {
        validReferer = false;
      }
    }

    if (origin && !sameOrigin && !isAllowedOrigin(origin)) {
      return next(new ApiError(403, 'CROSS_ORIGIN_FORBIDDEN', 'security', 'Cross-origin requests are not allowed for state-changing operations.', 'Permintaan lintas origin tidak diizinkan untuk operasi berbahaya.'));
    }

    if (origin && !sameOrigin && !validReferer) {
      return next(new ApiError(403, 'INVALID_REFERER', 'security', 'Missing or invalid referer for state-changing request.', 'Referer tidak valid untuk permintaan yang mengubah state.'));
    }
  }

  // The general limiter is for application/API traffic. Vite development
  // module requests, HMR, page routes and static assets can legitimately
  // generate dozens of requests during a single reload and must not consume
  // the API/security request bucket. API routes retain the limiter below.
  if (!req.path.startsWith('/api/')) return next();

  /*
   * Partition the general HTTP limiter by endpoint class.
   * High-frequency market polling must not consume the same bucket
   * used by account/authentication flows.
   */
  const rateLimitScope =
    req.path === '/api/account/state'
      ? 'account-state'
      : req.path === '/api/bot/engine-status'
        ? 'bot-status'
        : req.path === '/api/exchange/fetch-tickers-batch'
          ? 'market-ticker'
          : 'general';

  const rateLimitMax =
    rateLimitScope === 'market-ticker'
      ? 300
      : rateLimitScope === 'bot-status'
        ? 180
        : rateLimitScope === 'account-state'
          ? 60
          : 120;

  const rateLimitKey = `${clientIp}:${rateLimitScope}`;

  if (!(await checkGlobalRequestRateLimit(rateLimitKey, rateLimitMax, 60000))) {
    const error = new ApiError(
      429,
      'RATE_LIMITED',
      'rate_limit',
      'Request rate limit exceeded.',
      'Terlalu banyak permintaan. Silakan tunggu sebentar.',
    );
    console.warn('[SECURITY] Rate limit exceeded', {
      clientIp,
      rateLimitScope,
      rateLimitMax,
      requestId,
    });
    return next(error);
  }

  next();
});

app.use('/api/exchange', (req: Request, _res: Response, next) => {
  if (req.method === 'GET' && (req.query.apiKey || req.query.secret || req.query.password)) {
    return next(new ApiError(
      400,
      'CREDENTIALS_IN_URL',
      'validation',
      'Exchange credentials must not be sent in URL query parameters.',
      'Kredensial API tidak diizinkan dikirim melalui URL.'
    ));
  }
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use('/api/v2/engine', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { identity } = await requireFirebaseIdentity(req);
    if (!(await checkRedisRateLimit(`v2:${identity.uid}`, 120, 60))) return next(new ApiError(429,'V2_RATE_LIMITED','rate_limit','V2 engine rate limit exceeded.','Rate limit V2 engine terlampaui.'));
    res.locals.v2Uid = identity.uid;
    next();
  } catch (error) { next(error); }
}, v2EngineApi);
app.use('/api/v2/engine', v2EngineApi);
app.use((req: Request, _res: Response, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  if (req.body === undefined || req.body === null) return next();
  if (typeof req.body !== 'object' || Array.isArray(req.body)) {
    return next(new ApiError(400, 'INVALID_JSON_BODY', 'validation', 'Request body must be a JSON object.', 'Format body request tidak valid.'));
  }
  const payloadSize = Buffer.byteLength(JSON.stringify(req.body), 'utf8');
  if (payloadSize > 100000) {
    return next(new ApiError(413, 'PAYLOAD_TOO_LARGE', 'validation', 'Request body is too large.', 'Payload terlalu besar.'));
  }
  next();
});
app.use(express.static(path.join(process.cwd(), 'public')));

function getHealthSnapshot() {
  const totals = Array.from(apiRequestMetrics.values()).reduce((summary, metric) => ({
    requests: summary.requests + metric.count,
    failures: summary.failures + metric.failures,
    slowRequests: summary.slowRequests + metric.slowRequests,
    totalDurationMs: summary.totalDurationMs + metric.totalDurationMs,
  }), { requests: 0, failures: 0, slowRequests: 0, totalDurationMs: 0 });
  const bots = Array.from(activeBotsRegistry.values());
  const exchangeTickers = Array.from(tickerMemoryCache.entries())
    .filter(([key, ticker]) => key.startsWith(`${String(ticker.source || '').toLowerCase()}:`) && ticker.source !== 'coingecko');
  const newestExchangeTicker = exchangeTickers.reduce((newest, [, ticker]) => Math.max(newest, ticker.timestamp), 0);

  return {
    success: true,
    status: persistenceReady ? 'ok' : 'not_ready',
    uptimeSeconds: Math.floor((Date.now() - SERVER_STARTED_AT) / 1000),
    requests: {
      total: totals.requests,
      failures: totals.failures,
      slow: totals.slowRequests,
      averageDurationMs: totals.requests ? Number((totals.totalDurationMs / totals.requests).toFixed(1)) : 0,
    },
    bots: {
      active: bots.filter((bot) => bot.status === 'active').length,
      paused: bots.filter((bot) => bot.status === 'paused').length,
      error: bots.filter((bot) => bot.status === 'error').length,
      total: bots.length,
    },
    orders: {
      confirmed: botExecutionMetrics.confirmedOrders,
      failed: botExecutionMetrics.failedOrders,
      errorRate: botExecutionMetrics.confirmedOrders + botExecutionMetrics.failedOrders
        ? Number((botExecutionMetrics.failedOrders / (botExecutionMetrics.confirmedOrders + botExecutionMetrics.failedOrders)).toFixed(4))
        : 0,
    },
    ticker: {
      requests: botExecutionMetrics.tickerRequests,
      failures: botExecutionMetrics.tickerFailures,
      averageLatencyMs: botExecutionMetrics.tickerRequests
        ? Number((botExecutionMetrics.tickerTotalLatencyMs / botExecutionMetrics.tickerRequests).toFixed(1))
        : 0,
      latestAgeSeconds: newestExchangeTicker ? Math.max(0, Math.floor((Date.now() - newestExchangeTicker) / 1000)) : null,
    },
    timestamp: new Date().toISOString(),
    database: { ready: databaseReady, failureCode: databaseFailureCode },
    redis: { configured: Boolean(process.env.REDIS_URL) },
  };
}

app.get('/healthz', (_req: Request, res: Response) => {
  res.json({ status: 'ok', uptimeSeconds: Math.floor((Date.now() - SERVER_STARTED_AT) / 1000) });
});

app.get('/readyz', async (_req: Request, res: Response) => {
  const redisRequired = process.env.REDIS_REQUIRED === 'true';
  const redisReady = !redisRequired || await redisAvailable();
  const ready = persistenceReady && databaseReady && redisReady;
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not_ready',
    persistenceReady,
    databaseReady,
    redisReady,
    failureCode: ready ? undefined : (databaseFailureCode || persistenceFailureCode || (!redisReady ? 'REDIS_UNAVAILABLE' : undefined)),
  });
});

app.get('/api/health', (_req: Request, res: Response) => {
  res.json(getHealthSnapshot());
});

app.post('/api/auth/send-verification-code', async (req: Request, res: Response, next) => {
  try {
    const { identity } = await requireFirebaseIdentity(req);
    const forceResend = req.body?.forceResend === true;
    const emailConfig = getEmailDeliveryConfig();
    if (!emailConfig.configured) {
      return next(new ApiError(503, 'EMAIL_DELIVERY_NOT_CONFIGURED', 'configuration', 'Email delivery is not configured.', 'Pengiriman email belum dikonfigurasi. Tetapkan RESEND_API_KEY dan RESEND_FROM di server.'));
    }

    const previous = await getChallenge('email', identity.uid);
    if (previous) {
      const remaining = Math.max(0, Math.ceil((previous.expiresAt - Date.now()) / 1000));
      const retryAfter = Math.max(1, Math.ceil(30 - (Date.now() - previous.sentAt) / 1000));

      // A page refresh/remount is NOT a request for a new OTP. Reuse the active challenge.
      if (!forceResend) {
        return res.json({
          success: true,
          expiresInSeconds: remaining,
          retryAfterSeconds: Math.max(0, retryAfter),
          alreadySent: true,
        });
      }

      if (Date.now() - previous.sentAt < 30_000) {
        return next(new ApiError(429, 'VERIFICATION_RATE_LIMITED', 'rate_limit', 'A verification email was sent recently.', 'Tunggu 30 detik sebelum meminta kode baru.'));
      }
    }

    const sendLockKey = `gain:otp:send-lock:email:${identity.uid}`;
    const sendLockAcquired = await redisSetNxEx(sendLockKey, identity.uid, 45);
    if (!sendLockAcquired) {
      const locked = await getChallenge('email', identity.uid);
      return res.json({
        success: true,
        expiresInSeconds: locked ? Math.max(0, Math.ceil((locked.expiresAt - Date.now()) / 1000)) : 600,
        retryAfterSeconds: 30,
        alreadySent: Boolean(locked),
      });
    }

    try {
      const lockedPrevious = await getChallenge('email', identity.uid);
      if (lockedPrevious && !forceResend) {
        return res.json({
          success: true,
          expiresInSeconds: Math.max(0, Math.ceil((lockedPrevious.expiresAt - Date.now()) / 1000)),
          retryAfterSeconds: Math.max(0, Math.ceil(30 - (Date.now() - lockedPrevious.sentAt) / 1000)),
          alreadySent: true,
        });
      }

      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const sentAt = Date.now();
      const expiresAt = sentAt + 10 * 60_000;
      try {
        const delivery = await sendTransactionalEmail({
          to: identity.email,
          subject: 'Kode verifikasi GAIN Niaga Koin',
          text: `Kode verifikasi Anda: ${code}\n\nKode berlaku selama 10 menit. Jangan bagikan kode ini kepada siapa pun.`,
          idempotencyKey: buildEmailIdempotencyKey('email-verification', identity.uid, sentAt, code),
        });
        console.info('[EMAIL_VERIFICATION_SENT]', { uid: identity.uid, resendEmailId: delivery.id });
      } catch (error) {
        if (error instanceof EmailDeliveryError) {
          console.error('[EMAIL_DELIVERY_FAILED]', {
            status: error.status,
            providerCode: error.providerCode,
            uid: identity.uid,
            fromDomain: emailConfig.fromDomain,
          });
          if (error.code === 'RESEND_API_KEY_REJECTED') {
            return next(new ApiError(503, error.code, 'configuration', 'Resend rejected the API key.', 'RESEND_API_KEY ditolak Resend. Periksa API key server dan restart aplikasi.'));
          }
          if (error.code === 'RESEND_SENDER_NOT_ALLOWED') {
            return next(new ApiError(503, error.code, 'configuration', 'Resend rejected the configured sender.', `Alamat pengirim '${emailConfig.from}' belum diizinkan Resend. Verifikasi domain pengirim di Resend lalu set RESEND_FROM ke alamat di domain tersebut.`));
          }
          if (error.code === 'EMAIL_PROVIDER_RATE_LIMITED') {
            return next(new ApiError(503, error.code, 'upstream', 'Email provider rate limited the request.', 'Layanan email sedang membatasi permintaan. Tunggu sebentar lalu coba lagi.'));
          }
          return next(new ApiError(502, error.code, 'upstream', 'Email provider rejected the verification message.', 'Email gagal dikirim. Periksa status provider email server.'));
        }
        return next(error);
      }

      await setChallenge('email', identity.uid, {
        codeHash: hashVerificationCode(code),
        expiresAt,
        attempts: 0,
        sentAt,
      });
      res.json({ success: true, expiresInSeconds: 600, retryAfterSeconds: 30, alreadySent: false });
    } finally {
      await redisDel(sendLockKey);
    }
  } catch (err) {
    return next(err);
  }
});

app.get('/api/auth/verification-status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { identity } = await requireFirebaseIdentity(req);
    const kind = req.query.kind === 'login' ? 'login' : req.query.kind === 'email' ? 'email' : null;
    if (!kind) return next(new ApiError(400, 'VERIFICATION_KIND_INVALID', 'validation', 'Verification kind is invalid.', 'Jenis verifikasi tidak valid.'));
    const challenge = await getChallenge(kind, identity.uid);
    if (!challenge) return res.json({ success: true, active: false, expiresInSeconds: 0 });
    res.json({
      success: true,
      active: true,
      expiresInSeconds: Math.max(0, Math.ceil((challenge.expiresAt - Date.now()) / 1000)),
      retryAfterSeconds: Math.max(0, Math.ceil(30 - (Date.now() - challenge.sentAt) / 1000)),
    });
  } catch (error) {
    next(error);
  }
});

async function handleSecuritySessionStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { identity } = await requireFirebaseIdentity(req);
    await requireActiveMember(identity.uid);
    res.json({ success:true, elevated:await isSessionElevated(req, identity.uid), expiresInSeconds:SESSION_ELEVATION_TTL_SECONDS });
  } catch (error) { next(error); }
}

app.get('/api/security/session-status', handleSecuritySessionStatus);
// Legacy alias for pre-Architecture-25 clients.
app.get('/api/auth/session-status', handleSecuritySessionStatus);

async function handleSecuritySendCode(req: Request, res: Response, next: NextFunction) {
  try {
    const { identity } = await requireFirebaseIdentity(req);
    requireDatabase();
    await requireActiveMember(identity.uid);

    // Defense in depth: a valid 24h security session must NEVER trigger
    // another login OTP, even if the frontend opens the modal during a
    // transient session-status race. Manual logout revokes this session.
    if (await isSessionElevated(req, identity.uid)) {
      return res.json({
        success: true,
        required: false,
        expiresInSeconds: SESSION_ELEVATION_TTL_SECONDS,
        alreadySent: false,
      });
    }

    const user = await getUserByFirebaseUid(identity.uid);
    const snapshot = await getWalletSnapshot(identity.uid);

    if (!user || !snapshot) {
      return next(new ApiError(
        404,
        'ACCOUNT_NOT_PROVISIONED',
        'not_found',
        'Financial account is not provisioned.',
        'Akun finansial belum tersedia.'
      ));
    }

    const emailConfig = getEmailDeliveryConfig();

    if (!emailConfig.configured) {
      return next(new ApiError(
        503,
        'EMAIL_DELIVERY_NOT_CONFIGURED',
        'configuration',
        'Email delivery is not configured.',
        'Pengiriman email belum dikonfigurasi. Tetapkan RESEND_API_KEY dan RESEND_FROM di server.'
      ));
    }

    /*
     * First check the existing challenge.
     * This handles normal repeated requests after an OTP has already
     * been successfully created.
     */
    const forceResend = req.body?.forceResend === true;
    const previous = await getChallenge('login', identity.uid);

    if (previous && !forceResend) {
      return res.json({
        success: true,
        required: true,
        expiresInSeconds: Math.max(
          0,
          Math.floor((previous.expiresAt - Date.now()) / 1000)
        ),
        retryAfterSeconds: Math.max(0, Math.ceil(30 - (Date.now() - previous.sentAt) / 1000)),
        alreadySent: true,
      });
    }

    if (previous && Date.now() - previous.sentAt < 30_000) {
      return next(new ApiError(429, 'SECURITY_CODE_RATE_LIMITED', 'rate_limit', 'A security verification email was sent recently.', 'Tunggu 30 detik sebelum meminta kode keamanan baru.'));
    }

    /*
     * Atomic Redis lock.
     *
     * SET NX EX guarantees that only ONE concurrent request can become
     * the email sender. This protects against:
     * - React StrictMode Effect re-run
     * - double-click
     * - multiple browser tabs
     * - network retry
     * - concurrent API requests
     */
    const sendLockKey = `gain:otp:send-lock:login:${identity.uid}`;
    const sendLockAcquired = await redisSetNxEx(
      sendLockKey,
      identity.uid,
      45
    );

    if (!sendLockAcquired) {
      console.info('[OTP_SEND_SUPPRESSED]', {
        kind: 'login',
        uid: identity.uid,
        reason: 'concurrent_send',
      });

      return res.json({
        success: true,
        required: true,
        expiresInSeconds: 600,
        retryAfterSeconds: 30,
      });
    }

    try {
      /*
       * Re-check after acquiring the lock.
       * This closes the race where request #1 creates the challenge
       * while request #2 was waiting for the Redis lock.
       */
      const lockedPrevious = await getChallenge('login', identity.uid);

      if (lockedPrevious && !forceResend) {
        return res.json({
          success: true,
          required: true,
          expiresInSeconds: Math.max(0, Math.floor((lockedPrevious.expiresAt - Date.now()) / 1000)),
          retryAfterSeconds: Math.max(0, Math.ceil(30 - (Date.now() - lockedPrevious.sentAt) / 1000)),
          alreadySent: true,
        });
      }

      if (lockedPrevious && Date.now() - lockedPrevious.sentAt < 30_000) {
        return next(new ApiError(429, 'SECURITY_CODE_RATE_LIMITED', 'rate_limit', 'A security verification email was sent recently.', 'Tunggu 30 detik sebelum meminta kode keamanan baru.'));
      }

      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');

      try {
        const sentAt = Date.now();
        const delivery = await sendTransactionalEmail({
          to: identity.email,
          subject: 'Kode keamanan sesi GAIN',
          text: `Kode keamanan sesi GAIN Anda: ${code}\n\nKode berlaku selama 10 menit dan hanya dapat digunakan sekali. Jangan bagikan kode ini.`,
          idempotencyKey: buildEmailIdempotencyKey('login-verification', identity.uid, sentAt, code),
        });

        console.info('[SECURITY_CODE_SENT]', { uid: identity.uid, resendEmailId: delivery.id });
      } catch (error) {
        if (error instanceof EmailDeliveryError) {
          console.error('[SECURITY_CODE_DELIVERY_FAILED]', {
            status: error.status,
            providerCode: error.providerCode,
            uid: identity.uid,
            fromDomain: emailConfig.fromDomain,
          });
          if (error.code === 'RESEND_API_KEY_REJECTED') {
            return next(new ApiError(503, error.code, 'configuration', 'Resend rejected the API key.', 'RESEND_API_KEY ditolak Resend. Periksa API key server dan restart aplikasi.'));
          }
          if (error.code === 'RESEND_SENDER_NOT_ALLOWED') {
            return next(new ApiError(503, error.code, 'configuration', 'Resend rejected the configured sender.', `Alamat pengirim '${emailConfig.from}' belum diizinkan Resend. Verifikasi domain pengirim di Resend lalu set RESEND_FROM ke alamat di domain tersebut.`));
          }
          if (error.code === 'EMAIL_PROVIDER_RATE_LIMITED') {
            return next(new ApiError(503, error.code, 'upstream', 'Email provider rate limited the request.', 'Layanan email sedang membatasi permintaan. Tunggu sebentar lalu coba lagi.'));
          }
          return next(new ApiError(502, error.code, 'upstream', 'Security verification email could not be delivered.', 'Kode keamanan sesi gagal dikirim. Periksa status provider email server.'));
        }
        return next(error);
      }

      await setChallenge('login', identity.uid, {
        codeHash: hashVerificationCode(code),
        expiresAt: Date.now() + 10 * 60_000,
        attempts: 0,
        sentAt: Date.now(),
      });

      console.info('[SECURITY_CODE_SENT]', {
        uid: identity.uid,
        expiresInSeconds: 600,
      });

      return res.json({
        success: true,
        required: true,
        expiresInSeconds: 600,
        retryAfterSeconds: 30,
        alreadySent: false,
      });
    } finally {
      await redisDel(sendLockKey);
    }
  } catch (error) {
    return next(error);
  }
}

app.post('/api/security/send-code', handleSecuritySendCode);
// Legacy alias for pre-Architecture-25 clients.
app.post('/api/auth/send-login-code', handleSecuritySendCode);

async function handleSecurityVerifyCode(req: Request, res: Response, next: NextFunction) {
  try {
    const { identity } = await requireFirebaseIdentity(req);
    await requireActiveMember(identity.uid);
    const challenge = await getChallenge('login', identity.uid);
    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    if (!challenge || Date.now() > challenge.expiresAt || challenge.attempts >= 5) { await deleteChallenge('login', identity.uid); return next(new ApiError(400,'SECURITY_CODE_EXPIRED','validation','Security verification code is missing or expired.','Kode keamanan sesi tidak ditemukan atau sudah kedaluwarsa.')); }
    const suppliedHash = Buffer.from(hashVerificationCode(code),'hex');
    const expectedHash = Buffer.from(challenge.codeHash,'hex');
    if (!/^\d{6}$/.test(code) || suppliedHash.length !== expectedHash.length || !timingSafeEqual(suppliedHash, expectedHash)) {
      challenge.attempts += 1;
      if (challenge.attempts >= 5) await deleteChallenge('login', identity.uid); else await setChallenge('login', identity.uid, challenge);
      return next(new ApiError(400,'SECURITY_CODE_INVALID','validation','Security verification code is invalid.','Kode keamanan sesi salah.'));
    }
    await deleteChallenge('login', identity.uid);
    const token = await createSessionElevation(identity.uid);
    setSessionElevationCookie(res, token);
    await createAuditEvent({ firebaseUid:identity.uid, eventType:'auth.security.session_elevated', payload:{ method:'email_otp', purpose:'security_session' } });
    res.json({ success:true, verified:true, expiresInSeconds:24*60*60 });
  } catch (error) { next(error); }
}

app.post('/api/security/verify-code', handleSecurityVerifyCode);
// Legacy alias for pre-Architecture-25 clients.
app.post('/api/auth/verify-login-code', handleSecurityVerifyCode);

app.post('/api/auth/verify-email-code', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { identity } = await requireFirebaseIdentity(req);
    const challenge = await getChallenge('email', identity.uid);
    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';

    if (!challenge || Date.now() > challenge.expiresAt || challenge.attempts >= 5) {
      await deleteChallenge('email', identity.uid);
      return next(new ApiError(
        400,
        'VERIFICATION_CODE_EXPIRED',
        'validation',
        'Verification code is missing or expired.',
        'Kode tidak ditemukan atau sudah kedaluwarsa. Minta kode baru.'
      ));
    }

    const suppliedHash = Buffer.from(hashVerificationCode(code), 'hex');
    const expectedHash = Buffer.from(challenge.codeHash, 'hex');

    if (
      !/^\d{6}$/.test(code) ||
      suppliedHash.length !== expectedHash.length ||
      !timingSafeEqual(suppliedHash, expectedHash)
    ) {
      challenge.attempts += 1;

      if (challenge.attempts >= 5) {
        await deleteChallenge('email', identity.uid);
      } else {
        await setChallenge('email', identity.uid, challenge);
      }

      return next(new ApiError(
        400,
        'VERIFICATION_CODE_INVALID',
        'validation',
        'Verification code is invalid.',
        'Kode verifikasi salah. Periksa email dan coba lagi.'
      ));
    }

    // Firebase Auth menjadi sumber kebenaran untuk emailVerified.
    await firebaseAdminAuth.updateUser(identity.uid, {
      emailVerified: true,
    });

    // OTP hanya sekali pakai.
    await deleteChallenge('email', identity.uid);

    res.json({
      success: true,
      emailVerified: true,
    });
  } catch (error) {
    return next(error);
  }
});


app.post('/api/account/reserve-member-id', async (req: Request, res: Response, next) => {
  try {
    requireDatabase();
    const { identity } = await requireFirebaseIdentity(req);
    const existing = await getUserByFirebaseUid(identity.uid);
    if (existing?.member_id) return res.json({ success:true, memberId:existing.member_id });
    const result = await dbQuery<{ value: number }>(`SELECT nextval('gain_member_id_seq') AS value`);
    const value=Number(result.rows[0]?.value||0); if(value>99999) return next(new ApiError(503,'MEMBER_ID_CAPACITY_REACHED','configuration','Member ID capacity has been reached.','Kapasitas Member ID telah tercapai.'));
    const memberId=`GN-${String(value).padStart(5,'0')}`;
    await ensureUser({firebaseUid:identity.uid,email:identity.email,memberId});
    await createWalletIfMissing(identity.uid,'USDT');
    res.json({success:true,memberId});
  } catch(error){ next(error); }
});

async function handleSecuritySessionLogout(req: Request, res: Response) {
  const token = parseCookies(String(req.headers.cookie || '')).gain_session_elevation;
  if (token) {
    await redisDel(`gain:session:elevated:${token}`);
    localSessionElevation.delete(token);
    try {
      await dbQuery('DELETE FROM auth_session_elevations WHERE token_hash = $1', [hashSessionElevationToken(token)]);
    } catch (error) {
      console.warn('[AUTH_SESSION_DURABLE_DELETE_FAILED]', {
        code: String((error as any)?.code || 'DB_DELETE_FAILED').slice(0, 80),
      });
    }
  }
  clearSessionElevationCookie(res);
  res.json({ success:true });
}

app.post('/api/security/session-logout', handleSecuritySessionLogout);
// Legacy alias for pre-v2.4.16 clients.
app.post('/api/auth/session-logout', handleSecuritySessionLogout);

app.post('/api/account/bootstrap', async (req: Request, res: Response, next) => {
  try {
    requireDatabase();
    const { identity } = await requireFirebaseIdentity(req);
    const memberId = typeof req.body?.memberId === 'string' ? req.body.memberId.trim().toUpperCase() : undefined;
    const username = typeof req.body?.username === 'string' ? req.body.username.trim().slice(0,100) : undefined;
    const requestedSponsorId = typeof req.body?.sponsorId === 'string' ? req.body.sponsorId.trim().toUpperCase() : '';
    const masterOwnerEmail = String(process.env.GAIN_MASTER_OWNER_EMAIL || '').trim().toLowerCase();

    let sponsorMemberId: string | undefined;

    if (requestedSponsorId) {
      if (!/^GN-\d{5}$/.test(requestedSponsorId)) {
        return next(new ApiError(
          400,
          'SPONSOR_ID_INVALID',
          'validation',
          'Sponsor member ID is invalid.',
          'Member ID sponsor tidak valid.'
        ));
      }

      const sponsor = await getUserByMemberId(requestedSponsorId);

      if (!sponsor || sponsor.firebase_uid === identity.uid) {
        return next(new ApiError(
          400,
          'SPONSOR_NOT_FOUND',
          'validation',
          'Sponsor account was not found or cannot sponsor itself.',
          'Sponsor tidak ditemukan atau tidak dapat menjadi sponsor dirinya sendiri.'
        ));
      }

      sponsorMemberId = requestedSponsorId;
    } else if (masterOwnerEmail && identity.email.toLowerCase() !== masterOwnerEmail) {
      const masterOwner = await dbQuery<{ member_id: string; firebase_uid: string }>(
        `SELECT member_id, firebase_uid
           FROM users
          WHERE lower(email) = $1
            AND member_id IS NOT NULL
          LIMIT 1`,
        [masterOwnerEmail],
      );

      if (masterOwner.rows[0]?.member_id && masterOwner.rows[0].firebase_uid !== identity.uid) {
        sponsorMemberId = masterOwner.rows[0].member_id;
      }
    }
    const user = await ensureUser({ firebaseUid: identity.uid, email: identity.email, memberId, username, sponsorMemberId });
    await createWalletIfMissing(identity.uid, 'USDT');
    await syncFirestoreWalletReadModel(identity.uid);
    await createAuditEvent({ firebaseUid: identity.uid, eventType: 'account.bootstrap', payload: { memberId: user.member_id } });
    res.json({ success: true, userId: user.id, memberId: user.member_id });
  } catch (error) { next(error); }
});

app.get('/api/account/state', async (req: Request, res: Response, next) => {
  try {
    requireDatabase();
    const { identity } = await requireFirebaseIdentity(req);
    const snapshot = await getWalletSnapshot(identity.uid);
    if (!snapshot) {
      return next(new ApiError(
        404,
        'ACCOUNT_NOT_PROVISIONED',
        'not_found',
        'Financial account is not provisioned.',
        'Akun finansial belum tersedia. Silakan login ulang.'
      ));
    }

    // Exchange connection status is derived from server-side encrypted
    // credential metadata. Never return apiKey/secret to the browser.
    const connectedExchangeResult = await dbQuery<{
      exchange: string;
      sandbox: boolean;
      status: string;
      updated_at: string;
      exchange_account_id?: string;
      identity_type?: 'exchange_reported' | 'credential_fingerprint' | null;
      identity_hint?: string | null;
      reported_identity_key?: string | null;
      credential_version?: number | null;
    }>(
      `SELECT
         ec.exchange,
         ec.sandbox,
         ec.status,
         ec.updated_at,
         ea.id AS exchange_account_id,
         ea.identity_type,
         ea.identity_hint,
         ea.reported_identity_key,
         ea.credential_version
       FROM exchange_credentials ec
       JOIN users u ON u.id = ec.user_id
       LEFT JOIN exchange_accounts ea ON ea.user_id = ec.user_id AND lower(ea.exchange) = lower(ec.exchange)
       WHERE u.firebase_uid = $1
         AND ec.status = 'ACTIVE'
       ORDER BY ec.updated_at DESC`,
      [identity.uid],
    );

    const connectedExchanges = connectedExchangeResult.rows.map((row) => ({
      exchange: row.exchange,
      isConnected: true,
      isSandbox: Boolean(row.sandbox),
      apiKeyMasked: 'API_CONNECTED',
      usdtBalance: 0,
      lastSynced: row.updated_at
        ? new Date(row.updated_at).toLocaleTimeString()
        : new Date().toLocaleTimeString(),
      exchangeAccountId: row.exchange_account_id || undefined,
      identityType: row.identity_type || undefined,
      identityHint: row.identity_hint || undefined,
      reportedIdentityKey: row.reported_identity_key || undefined,
      credentialVersion: Number(row.credential_version || 1),
      credentialStatus: row.status,
      exchangeAccountStatus: row.exchange_account_id ? 'ACTIVE' : 'UNKNOWN',
      portfolioSyncStatus: 'SYNCING',
      portfolioAsOf: undefined,
      lastSyncError: undefined,
      isActive: false,
    }));

    if (connectedExchanges.length > 0) {
      connectedExchanges[0].isActive = true;
    }

    const activeExchange = connectedExchanges[0] || null;

    const memberStatus = String(snapshot.member_status || snapshot.status || 'active').toLowerCase();
    const normalizedLicenseStatus = String(snapshot.license_status || 'NONE').toUpperCase() === 'ACTIVE' ? 'active' : 'none';

    res.json({
      success: true,
      wallet: {
        ...snapshot,
        member_status: memberStatus,
        license_status: normalizedLicenseStatus,
        account_status: normalizedLicenseStatus === 'active' ? 'active' : 'non-active',
        deposit_address: process.env.GAIN_EXCHANGE_DEPOSIT_ADDRESS || '',
        connectedExchange: activeExchange,
        connectedExchanges,
        activeExchange: activeExchange?.exchange || null,
      },
    });
  } catch (error) { next(error); }
});

app.post('/api/account/profile', async (req: Request, res: Response, next) => {
  try {
    requireDatabase();
    const { identity } = await requireFirebaseIdentity(req);
    const username = typeof req.body?.username === 'string' ? req.body.username.trim().slice(0, 100) : undefined;
    if (!username) return next(new ApiError(400, 'PROFILE_INVALID', 'validation', 'No safe profile fields were supplied.', 'Tidak ada perubahan profil yang valid.'));
    await dbQuery(`UPDATE users SET username=$2, updated_at=now() WHERE firebase_uid=$1`, [identity.uid, username]);
    const userPath = `users/${identity.uid}`;
    const user = await firestoreRequest((await requireFirebaseIdentity(req)).idToken, firestoreDocumentName(userPath), {}, true);
    if (user?.updateTime) {
      await commitFirestoreWrites((await requireFirebaseIdentity(req)).idToken, [{ update:{ name:firestoreDocumentName(userPath), fields:{ username:toFirestoreValue(username), updatedAt:toFirestoreValue(new Date().toISOString()) } }, updateMask:{fieldPaths:['username','updatedAt']}, currentDocument:{updateTime:user.updateTime} }]);
    }
    res.json({ success:true, username });
  } catch (error) { next(error); }
});

app.post('/api/security/2fa', async (req: Request, res: Response, next) => {
  try {
    requireDatabase();
    const { identity } = await requireFirebaseIdentity(req);
    const enabled = req.body?.enabled === true;
    const secret = typeof req.body?.secret === 'string' ? req.body.secret.trim().toUpperCase() : '';
    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    if (enabled) {
      if (!/^[A-Z2-7]{16,64}$/.test(secret)) return next(new ApiError(400, '2FA_SECRET_INVALID', 'validation', 'TOTP secret is invalid.', 'Secret 2FA tidak valid.'));
      const verification = verifyServerTotp(code, secret, 1);
      if (!verification.valid) return next(new ApiError(400, '2FA_CODE_INVALID', 'validation', 'TOTP code is invalid.', 'Kode Google Authenticator tidak valid.'));
      const encrypted = encryptSensitiveString(secret);
      await saveTwoFactorSecret(identity.uid, { enabled: true, ...encrypted });
      if (verification.counter !== undefined) await consumeTotpCounter(identity.uid, verification.counter);
      res.json({ success: true, enabled: true });
      return;
    }
    await saveTwoFactorSecret(identity.uid, { enabled: false });
    res.json({ success: true, enabled: false });
  } catch (error) { next(error); }
});

app.post('/api/wallet/authorize-financial-action', async (req: Request, res: Response, next) => {
  try {
    requireDatabase();
    const { identity } = await requireFirebaseIdentity(req);
    const action = typeof req.body?.action === 'string' ? req.body.action : '';
    const amount = Number(req.body?.amount);
    const allowedActions = new Set(['deposit','withdraw','transfer','activation','referral','trade']);
    if (!allowedActions.has(action) || !Number.isFinite(amount) || amount <= 0) return next(new ApiError(400,'FINANCIAL_ACTION_INVALID','validation','Financial action is invalid.','Aksi finansial tidak valid.'));
    await createAuditEvent({firebaseUid:identity.uid,eventType:'wallet.financial_action.validated',payload:{action,amount}});
    res.status(202).json({success:true,approved:false,validated:true,action,amount,currency:String(req.body?.currency||'USDT').slice(0,8),requestId:getRequestId(res),source:'server_authoritative_validation',note:'Validation only. Settlement must use its dedicated authoritative endpoint.'});
  } catch(error){ next(error); }
});

app.post('/api/observability/client-event', (req: Request, res: Response, next) => {
  const event = typeof req.body?.event === 'string' ? req.body.event : '';
  if (!CLIENT_OBSERVABILITY_EVENTS.has(event)) {
    return next(new ApiError(400, 'OBSERVABILITY_EVENT_INVALID', 'validation', 'Client event is not allowlisted.'));
  }

  console.info('[CLIENT_REPORTED_EVENT]', {
    requestId: getRequestId(res),
    source: 'untrusted_client_report',
    event,
    attributes: sanitizeObservabilityAttributes(req.body?.attributes),
  });
  res.status(202).json({ success: true });
});

app.post('/api/observability/web-vital', (req: Request, res: Response, next) => {
  const { name, value, rating, id } = req.body || {};
  if (!WEB_VITAL_NAMES.has(name) || !Number.isFinite(value) || value < 0 || value > 120000
    || !['good', 'needs-improvement', 'poor'].includes(rating)
    || typeof id !== 'string' || id.length > 64) {
    return next(new ApiError(400, 'WEB_VITAL_INVALID', 'validation', 'Web Vital payload is invalid.'));
  }

  console.info('[WEB_VITAL]', {
    requestId: getRequestId(res),
    name,
    value: Number(value.toFixed(3)),
    rating,
  });
  res.status(202).json({ success: true });
});

// Global in-memory cache for tickers to eliminate redundant exchange roundtrips
const tickerMemoryCache = new Map<string, { last: number; percentage: number; timestamp: number; source?: string; quoteCurrency?: string }>();
const v2MarketDataEngine = new MarketDataEngine();
const v2WebSocketManager = new WebSocketManager(v2MarketDataEngine);
const TICKER_CACHE_TTL_MS = 20000; // 20s TTL
const BOT_PRICE_MAX_AGE_MS = 10000;
const botExecutionMetrics = { confirmedOrders: 0, failedOrders: 0, tickerRequests: 0, tickerFailures: 0, tickerTotalLatencyMs: 0 };

function tickerCacheKey(exchange: string, symbol: string, isSandbox = false): string {
  return `${exchange.trim().toLowerCase()}:${isSandbox ? 'sandbox:' : ''}${symbol.trim().toUpperCase()}`;
}

async function ensureExchangeMarkets(client: any): Promise<void> {
  if (!client || typeof client.loadMarkets !== 'function') return;
  if (!client.markets || Object.keys(client.markets).length === 0) {
    await client.loadMarkets();
  }
}

function isSupportedExchangeSymbol(client: any, symbol: string): boolean {
  const normalized = String(symbol || '').trim().toUpperCase();
  if (!normalized) return false;
  if (!client?.markets) return true;
  return Boolean(client.markets[normalized]);
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number, reason: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout>;
  return Promise.race([
    operation,
    new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error(reason)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timeout));
}

async function withBotExchangeRetry<T>(operation: () => Promise<T>, timeoutMs: number, timeoutReason: string): Promise<T> {
  return retryBotExchangeAction(
    () => withTimeout(operation(), timeoutMs, timeoutReason),
    BOT_ORDER_RETRY_ATTEMPTS,
    (attempt) => new Promise((resolve) => setTimeout(resolve, 400 * (2 ** (attempt - 1)) + randomInt(0, 250)))
  );
}

function extractExchangeClientOrderId(order: any): string {
  return String(
    order?.clientOrderId
      || order?.clientOrderID
      || order?.info?.clientOrderId
      || order?.info?.origClientOrderId
      || order?.info?.clientOrderID
      || ''
  );
}

async function findBotExchangeOrderByClientOrderId(
  client: any,
  symbol: string,
  clientOrderId: string,
): Promise<{ found: true; order: any } | { found: false }> {
  // Binance exposes an exact order lookup by client order id. The dummy id is
  // intentionally ignored by ccxt when origClientOrderId is supplied.
  if (String(client?.id || '').toLowerCase() === 'binance') {
    try {
      const order = await withTimeout(
        client.fetchOrder('0', symbol, { origClientOrderId: clientOrderId }),
        EXCHANGE_TIMEOUT_MS,
        'exchange_client_order_lookup_timeout',
      );
      return { found: true, order };
    } catch (error) {
      const message = String((error as any)?.message || error).toLowerCase();
      const name = String((error as any)?.name || '').toLowerCase();
      // Binance's definitive "unknown order" response means it is safe to
      // retry the same clientOrderId. Network/timeouts remain ambiguous.
      if (/order.*not.*found|unknown order|notfound/.test(`${name} ${message}`)) return { found: false };
      throw new BotExecutionFailure('ORDER_STATUS_UNCERTAIN', false);
    }
  }

  // Generic fallback: first inspect open orders, then recent order history.
  // A successful search with no match is a definitive absence within the
  // immediately relevant order window; a transport error is ambiguous.
  try {
    const openOrdersResult = await withTimeout(
      client.fetchOpenOrders(symbol),
      EXCHANGE_TIMEOUT_MS,
      'exchange_open_order_lookup_timeout',
    );
    const openOrders = (Array.isArray(openOrdersResult) ? openOrdersResult : []) as any[];
    const openMatch = openOrders.find((order: any) => extractExchangeClientOrderId(order) === clientOrderId);
    if (openMatch) return { found: true, order: openMatch };
  } catch {
    throw new BotExecutionFailure('ORDER_STATUS_UNCERTAIN', false);
  }

  if (client?.has?.fetchOrders) {
    try {
      const since = Date.now() - 24 * 60 * 60 * 1000;
      const ordersResult = await withTimeout(
        client.fetchOrders(symbol, since, 100),
        EXCHANGE_TIMEOUT_MS,
        'exchange_order_history_lookup_timeout',
      );
      const orders = (Array.isArray(ordersResult) ? ordersResult : []) as any[];
      const historicalMatch = orders.find((order: any) => extractExchangeClientOrderId(order) === clientOrderId);
      if (historicalMatch) return { found: true, order: historicalMatch };
      return { found: false };
    } catch {
      throw new BotExecutionFailure('ORDER_STATUS_UNCERTAIN', false);
    }
  }

  // Open orders alone cannot prove that an order was never accepted: the
  // exchange may already have closed/filled it. Never convert that uncertainty
  // into a second createOrder() attempt.
  throw new BotExecutionFailure('ORDER_STATUS_UNCERTAIN', false);
}

async function createBotExchangeOrderWithRecovery(
  client: any,
  bot: ActiveBotRunner,
  side: 'buy' | 'sell',
  amount: number,
  clientOrderId: string,
  priceTimestamp: number,
  allowManualClose = false,
): Promise<any> {
  for (let attempt = 1; attempt <= BOT_ORDER_RETRY_ATTEMPTS; attempt += 1) {
    try {
      if (!isFreshPrice(priceTimestamp, Date.now(), BOT_PRICE_MAX_AGE_MS)) {
        throw new BotExecutionFailure('FRESH_PRICE_UNAVAILABLE', true);
      }
      await assertBotLeaseActive(bot, allowManualClose);
      return await withTimeout(
        client.createOrder(bot.pair, 'market', side, amount, undefined, { clientOrderId }),
        EXCHANGE_TIMEOUT_MS,
        'exchange_order_timeout',
      );
    } catch (error) {
      const failure = classifyBotExecutionError(error);
      if (failure.reasonCode === 'FRESH_PRICE_UNAVAILABLE') {
        if (attempt >= BOT_ORDER_RETRY_ATTEMPTS) throw failure;
        await new Promise((resolve) => setTimeout(resolve, 400 * (2 ** (attempt - 1))));
        continue;
      }
      if (!failure.retryable || attempt >= BOT_ORDER_RETRY_ATTEMPTS) throw failure;

      // The submission may have reached the exchange even if our HTTP call
      // timed out. Resolve the existing order before any second submission.
      const recovered = await findBotExchangeOrderByClientOrderId(client, bot.pair, clientOrderId);
      if (recovered.found) return recovered.order;

      await new Promise((resolve) => setTimeout(
        resolve,
        400 * (2 ** (attempt - 1)) + randomInt(0, 250),
      ));
    }
  }

  throw new BotExecutionFailure('ORDER_STATUS_UNCERTAIN', false);
}

async function getPrice(exchange: string, symbol: string, isSandbox = false) {
  const cacheKey = tickerCacheKey(exchange, symbol, isSandbox);
  if (GAIN_V2_ENABLED) {
    const streamSnapshot = v2MarketDataEngine.get(exchange.trim().toLowerCase(), symbol.trim().toUpperCase());
    if (streamSnapshot && isFreshPrice(streamSnapshot.timestamp, Date.now(), V2_MARKET_DATA_MAX_AGE_MS)) {
      const streamed = { last: streamSnapshot.last, percentage: streamSnapshot.volatilityPct || 0, timestamp: streamSnapshot.timestamp, source: exchange.trim().toLowerCase(), quoteCurrency: symbol.split('/')[1]?.toUpperCase() };
      tickerMemoryCache.set(cacheKey, streamed);
      return streamed;
    }
  }
  const cached = tickerMemoryCache.get(cacheKey);
  if (cached && isFreshPrice(cached.timestamp, Date.now(), BOT_PRICE_MAX_AGE_MS) && Number.isFinite(cached.last) && cached.last > 0) {
    return cached;
  }

  const normalizedExchange = exchange.trim().toLowerCase();
  // For sandbox/public market data, prefer the active WebSocket snapshot.
  // If REST is temporarily unavailable, keep the last known cache rather than
  // turning a display issue into repeated exchange retries/circuit-breaker trips.
  const client = createExchangeInstance(normalizedExchange, { isSandbox });
  const startedAt = performance.now();
  botExecutionMetrics.tickerRequests += 1;
  let ticker: any;
  try {
    ticker = await Promise.race([
      client.fetchTicker(symbol),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('ticker_timeout')), EXCHANGE_TIMEOUT_MS)),
    ]);
  } catch (error) {
    botExecutionMetrics.tickerFailures += 1;
    throw error;
  } finally {
    botExecutionMetrics.tickerTotalLatencyMs += performance.now() - startedAt;
  }
  const last = Number(ticker.last);
  if (!Number.isFinite(last) || last <= 0) {
    botExecutionMetrics.tickerFailures += 1;
    throw new Error('ticker_unavailable');
  }

  const price = {
    last,
    percentage: Number(ticker.percentage) || 0,
    timestamp: Date.now(),
    source: normalizedExchange,
    quoteCurrency: symbol.split('/')[1]?.toUpperCase(),
  };
  tickerMemoryCache.set(cacheKey, price);
  return price;
}


const strategyCandleCache = new Map<string, { fetchedAt: number; snapshot: Awaited<ReturnType<typeof getClosedCandleMarketSnapshot>> }>();
const STRATEGY_CANDLE_POLL_MS = 10_000;

async function getClosedCandleMarketSnapshot(bot: ActiveBotRunner): Promise<{
  market: V2MarketSnapshot;
  candle: ReturnType<typeof toClosedStrategyCandle>;
  previousCandleClose: number;
}> {
  const timeframe = bot.timeframe || '5m';
  const cacheKey = `${bot.exchange.toLowerCase()}:${bot.isSandbox ? 'sandbox' : 'live'}:${bot.pair}:${timeframe}`;
  const cached = strategyCandleCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < STRATEGY_CANDLE_POLL_MS) return cached.snapshot;

  // Strategy signals are sourced exclusively from exchange OHLCV candles.
  // Non-native strategy timeframes are derived from a verified native 3m/5m base.
  const nativeTimeframe = nativeStrategyTimeframe(timeframe);
  const client = createExchangeInstance(bot.exchange, { isSandbox: bot.isSandbox });
  if (!client.has?.fetchOHLCV) throw new BotExecutionFailure('CANDLE_DATA_UNAVAILABLE', true);
  const rowsRaw = await withExchangeRetry(bot.exchange.toLowerCase(), 'fetchOHLCV', () => client.fetchOHLCV(bot.pair, nativeTimeframe, undefined, 120));
  const rows = aggregateOhlcv(normalizeOhlcvRows(rowsRaw as unknown[]), timeframe);
  if (rows.length < 3) throw new BotExecutionFailure('CANDLE_DATA_INSUFFICIENT', true);

  const selected = selectLastTwoClosedCandles(rows, timeframe, now);
  if (!selected) throw new BotExecutionFailure('CANDLE_NOT_CLOSED', true);
  const [previous, current] = selected;
  const candle = toClosedStrategyCandle(current, timeframe);
  const candlePct = candle.open > 0 ? ((candle.close - candle.open) / candle.open) * 100 : 0;
  const market: V2MarketSnapshot = {
    exchange: bot.exchange,
    symbol: bot.pair,
    bid: candle.close,
    ask: candle.close,
    last: candle.close,
    timestamp: now,
    spreadPct: 0,
    volatilityPct: Math.abs(candlePct),
    timeframe,
    candle,
    previousCandleClose: previous[4],
  };
  const snapshot = { market, candle, previousCandleClose: previous[4] };
  strategyCandleCache.set(cacheKey, { fetchedAt: now, snapshot });
  return snapshot;
}


const COINGECKO_ID_BY_BASE: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  BNB: 'binancecoin',
  SOL: 'solana',
  HYPE: 'hyperliquid',
  LINK: 'chainlink',
  AVAX: 'avalanche-2',
  NEAR: 'near',
  XRP: 'ripple',
  SUI: 'sui',
  ZEC: 'zcash',
  DOGE: 'dogecoin',
  XAUT: 'tether-gold',
  TAO: 'bittensor',
};

async function fetchCoinGeckoTickers(symbols: string[]): Promise<Record<string, { last: number; percentage: number; timestamp: number; quoteCurrency: string }>> {
  const mapped = symbols.flatMap((symbol) => {
    const [base, quote] = symbol.split('/');
    const id = quote === 'USDT' ? COINGECKO_ID_BY_BASE[base] : undefined;
    return id ? [{ symbol, id }] : [];
  });
  const ids = [...new Set([...mapped.map(({ id }) => id), 'tether'])];
  if (ids.length === 0) return {};

  const url = new URL('https://api.coingecko.com/api/v3/simple/price');
  url.searchParams.set('ids', ids.join(','));
  url.searchParams.set('vs_currencies', 'usd');
  url.searchParams.set('include_24hr_change', 'true');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`CoinGecko returned HTTP ${response.status}.`);
    }

    const data = await response.json() as Record<string, { usd?: number; usd_24h_change?: number }>;
    const timestamp = Date.now();
    const tetherUsd = Number(data.tether?.usd);
    const hasUsdtRate = Number.isFinite(tetherUsd) && tetherUsd > 0;
    const tickers: Record<string, { last: number; percentage: number; timestamp: number; quoteCurrency: string }> = {};

    for (const { symbol, id } of mapped) {
      const usdPrice = Number(data[id]?.usd);
      if (!Number.isFinite(usdPrice) || usdPrice <= 0) continue;
      tickers[symbol] = {
        last: hasUsdtRate ? usdPrice / tetherUsd : usdPrice,
        percentage: Number(data[id]?.usd_24h_change) || 0,
        timestamp,
        quoteCurrency: hasUsdtRate ? 'USDT' : 'USD',
      };
    }

    return tickers;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Global in-memory cache for exchange markets
const marketsMemoryCache = new Map<string, { markets: any[]; timestamp: number }>();
const MARKETS_CACHE_TTL_MS = 60000; // 60s TTL

// Rate limiting tracker for sensitive operations (order placement, transfers, activation)
const ipRateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(key: string, maxRequests: number = 20, windowMs: number = 10000): boolean {
  const now = Date.now();
  const entry = ipRateLimitMap.get(key);
  if (!entry || now > entry.resetTime) {
    ipRateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) {
    return false;
  }
  entry.count += 1;
  return true;
}

// Error sanitizer: prevents accidental leakage of API credentials or system paths (CWE-209)
function sanitizeErrorMessage(msg: any): string {
  if (!msg || typeof msg !== 'string') return 'Terjadi kendala pada sistem.';
  return msg
    .replace(/[A-Za-z0-9_-]{24,}/g, '[REDACTED_KEY]')
    .replace(/\/[a-zA-Z0-9_.-]+(\/[a-zA-Z0-9_.-]+)+/g, '[INTERNAL_PATH]');
}

function sanitizeExchangeErrorMessage(msg: any, credentials?: { apiKey?: unknown; secret?: unknown; password?: unknown }): string {
  let safeMessage = sanitizeErrorMessage(msg);

  for (const credential of [credentials?.apiKey, credentials?.secret, credentials?.password]) {
    if (typeof credential === 'string' && credential.length >= 8) {
      safeMessage = safeMessage.split(credential).join('[REDACTED_KEY]');
    }
  }

  return safeMessage;
}

function apiErrorHandler(err: any, req: Request, res: Response, _next: express.NextFunction): void {
  const requestedStatus = Number(err?.statusCode || err?.status);
  const isExchangeError = req.path.startsWith('/api/exchange/');
  const statusCode = Number.isInteger(requestedStatus) && requestedStatus >= 400 && requestedStatus <= 599
    ? requestedStatus
    : isExchangeError ? 502 : 500;
  const category = err?.category || (statusCode === 429 ? 'rate_limit' : isExchangeError ? 'exchange' : statusCode < 500 ? 'validation' : 'internal');
  const errorText = String(err?.message || '').toLowerCase();
  const exchangeAuthFailure = isExchangeError && /(401|auth|invalid|signature|timestamp|passphrase)/.test(errorText);
  const code = err?.code || (statusCode === 429
    ? 'RATE_LIMITED'
    : exchangeAuthFailure
    ? 'EXCHANGE_AUTH_FAILED'
    : isExchangeError
    ? 'EXCHANGE_UNAVAILABLE'
    : statusCode < 500
    ? 'BAD_REQUEST'
    : 'INTERNAL_ERROR');
  const requestId = String(res.getHeader('X-Request-Id') || 'unknown');
  const logMessage = sanitizeExchangeErrorMessage(err?.message || 'Unhandled server error.', req.body);
  const userMessage = err?.userMessage || (statusCode === 429
    ? 'Terlalu banyak permintaan. Silakan tunggu sebentar.'
    : exchangeAuthFailure
    ? 'Autentikasi exchange gagal. Periksa API Key, Secret, dan Passphrase.'
    : isExchangeError
    ? 'Exchange sedang mengalami kendala. Silakan coba kembali beberapa saat lagi.'
    : statusCode < 500
    ? sanitizeExchangeErrorMessage(err?.message || 'Permintaan tidak valid.', req.body)
    : 'Terjadi kendala pada sistem.');

  console.error(JSON.stringify({
    level: 'error',
    event: 'api.error',
    requestId,
    method: req.method,
    path: req.path,
    uid: res.locals.botUid || 'anonymous',
    statusCode,
    code,
    category,
    message: logMessage,
  }));

  if (isExchangeError) {
    logAuditEvent(req, res, 'exchange.error', { code, statusCode });
  }

  if (res.headersSent) return;
  res.status(statusCode).json({
    success: false,
    error: sanitizeExchangeErrorMessage(userMessage, req.body),
    code,
    category,
    requestId,
  });
}

// Helper to create ccxt exchange instance
function createExchangeInstance(
  exchangeName: string,
  credentials?: { apiKey?: string; secret?: string; password?: string; isSandbox?: boolean }
) {
  const safeExchange = exchangeName.toLowerCase().trim();
  const descriptor = getExchangeDescriptor(safeExchange);
  if (!descriptor) {
    throw new Error(`Exchange "${exchangeName}" tidak didukung pada server.`);
  }
  if (!descriptor.ccxtId) {
    throw new ApiError(409, 'EXCHANGE_NATIVE_ADAPTER_REQUIRED', 'exchange', `Exchange ${descriptor.name} requires its native API adapter.`, `Exchange ${descriptor.name} belum memiliki adapter native trading di GAIN.`);
  }

  const normalized = descriptor.ccxtId;
  const exchangeClass = (ccxt as Record<string, any>)[normalized];

  if (!exchangeClass) {
    throw new Error(`Exchange "${exchangeName}" is not supported by ccxt.`);
  }

  const options: Record<string, any> = {
    enableRateLimit: true,
    timeout: 7000, // Responsive 7s timeout
    options: {
      adjustForTimeDifference: true, // Auto time-sync to prevent timestamp drift (-1021 error)
      recvWindow: 10000, // 10s receive window for international cloud latency
      defaultType: 'spot',
    },
  };

  if (credentials?.apiKey) options.apiKey = credentials.apiKey.trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
  if (credentials?.secret) options.secret = credentials.secret.trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
  if (credentials?.password) options.password = credentials.password.trim().replace(/[\u200B-\u200D\uFEFF]/g, '');

  if (credentials?.isSandbox) {
    options.headers = {
      ...(options.headers || {}),
      ...(safeExchange === 'bitget' ? { paptrading: '1' } : {}),
      ...(safeExchange === 'okx' ? { 'x-simulated-trading': '1' } : {}),
    };
  }

  const instance = new exchangeClass(options);

  if (credentials?.isSandbox) {
    try {
      if (typeof instance.setSandboxMode === 'function') {
        instance.setSandboxMode(true);
      }
    } catch {
      if (instance.urls && instance.urls['test']) {
        instance.urls['api'] = instance.urls['test'];
      }
    }
  }

  return instance;
}

// Helper to extract portfolio balances and calculate USDT valuation concurrently
async function extractPortfolioAndValuation(
  client: any,
  balance: any,
  exchangeName: string = 'exchange',
  isSandbox = false
): Promise<{
  currencies: Record<string, { free: number; used: number; total: number }>;
  portfolioAssets: Array<{
    coin: string;
    pair: string;
    free: number;
    used: number;
    total: number;
    price: number;
    change24h: number;
    valueUsdt: number;
  }>;
  usdtBalance: number;
  totalPortfolioUsdt: number;
}> {
  const currencies: Record<string, { free: number; used: number; total: number }> = {};
  const portfolioAssets: Array<{
    coin: string;
    pair: string;
    free: number;
    used: number;
    total: number;
    price: number;
    change24h: number;
    valueUsdt: number;
  }> = [];

  let totalCoinValueUsdt = 0;

  if (balance.total) {
    const nonZeroCoins: Array<{ curr: string; free: number; used: number; total: number }> = [];

    for (const [curr, totalVal] of Object.entries(balance.total)) {
      const total = Number(totalVal);
      if (total > 0) {
        const free = Number(balance.free?.[curr] ?? 0);
        const used = Number(balance.used?.[curr] ?? 0);
        currencies[curr] = { free, used, total };
        if (curr !== 'USDT' && total > 0.00001) {
          nonZeroCoins.push({ curr, free, used, total });
        }
      }
    }

    // Sort by largest balance and limit to top 12 active coins
    const candidateCoins = nonZeroCoins.slice(0, 12);
    try { await ensureExchangeMarkets(client); } catch { /* valuation can remain partial */ }

    // Fetch tickers concurrently in parallel with cache check and fast 1800ms race timeout
    const tickerPromises = candidateCoins.map(async (item) => {
      try {
        const pairSymbol = `${item.curr}/USDT`;
        if (!isSupportedExchangeSymbol(client, pairSymbol)) return null;
        const cacheKey = tickerCacheKey(exchangeName, pairSymbol, isSandbox);
        const cached = tickerMemoryCache.get(cacheKey);

        let price = 0;
        let change24h = 0;

        if (cached && Date.now() - cached.timestamp < TICKER_CACHE_TTL_MS) {
          price = cached.last;
          change24h = cached.percentage;
        } else {
          const t = await Promise.race([
            client.fetchTicker(pairSymbol),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Ticker timeout')), 1800)
            ),
          ]);
          price = Number((t as any)?.last || 0);
          change24h = Number((t as any)?.percentage || 0);

          if (price > 0) {
            tickerMemoryCache.set(cacheKey, {
              last: price,
              percentage: change24h,
              timestamp: Date.now(),
            });
          }
        }

        const valueUsdt = Number((item.total * price).toFixed(2));

        return {
          coin: item.curr,
          pair: pairSymbol,
          free: item.free,
          used: item.used,
          total: item.total,
          price,
          change24h,
          valueUsdt,
        };
      } catch {
        return null;
      }
    });

    const results = await Promise.allSettled(tickerPromises);
    for (const res of results) {
      if (res.status === 'fulfilled' && res.value) {
        portfolioAssets.push(res.value);
        totalCoinValueUsdt += res.value.valueUsdt;
      }
    }
  }

  const usdtBalance = currencies['USDT']?.free ?? 0;
  const totalPortfolioUsdt = Number((usdtBalance + totalCoinValueUsdt).toFixed(2));

  return { currencies, portfolioAssets, usdtBalance, totalPortfolioUsdt };
}

const EXCHANGE_CERT_STAGES = new Set([
  'authenticated_readonly',
  'sandbox_demo_order',
  'micro_live_order',
  'reconcile',
  'recovery',
]);
const EXCHANGE_CERT_MAX_DEMO_NOTIONAL = positiveEnvLimit('EXCHANGE_CERT_MAX_DEMO_NOTIONAL', 10);
const EXCHANGE_CERT_MAX_LIVE_NOTIONAL = positiveEnvLimit('EXCHANGE_CERT_MAX_LIVE_NOTIONAL', 5);
const EXCHANGE_CERT_MAX_LIVE_NOTIONAL_IDR = positiveEnvLimit('EXCHANGE_CERT_MAX_LIVE_NOTIONAL_IDR', 50000);
const EXCHANGE_CERT_MICRO_LIVE_ENABLED = process.env.EXCHANGE_CERT_MICRO_LIVE_ENABLED === 'true';
const EXCHANGE_CERT_MICRO_LIVE_CONFIRM = 'I_UNDERSTAND_MICRO_LIVE_CERTIFICATION';

type ExchangeCertificationStage = 'authenticated_readonly' | 'sandbox_demo_order' | 'micro_live_order' | 'reconcile' | 'recovery';

function certificationModeForStage(stage: ExchangeCertificationStage): 'READ_ONLY' | 'SANDBOX_DEMO' | 'MICRO_LIVE' | 'RECONCILE' | 'RECOVERY' {
  if (stage === 'authenticated_readonly') return 'READ_ONLY';
  if (stage === 'sandbox_demo_order') return 'SANDBOX_DEMO';
  if (stage === 'micro_live_order') return 'MICRO_LIVE';
  if (stage === 'reconcile') return 'RECONCILE';
  return 'RECOVERY';
}

function certificationPreferredSymbols(descriptor: ReturnType<typeof getExchangeDescriptor>): string[] {
  if (!descriptor) return ['BTC/USDT', 'BTC/USDC', 'BTC/USD', 'BTC/IDR'];
  const quotes = descriptor.quoteCurrencies || [];
  const preferred: string[] = [];
  for (const quote of quotes) preferred.push(`BTC/${quote}`);
  preferred.push('BTC/USDT', 'BTC/USDC', 'BTC/USD', 'BTC/IDR');
  return [...new Set(preferred)];
}

function certificationDefaultNotional(quote: string, live: boolean): number {
  if (live && quote.toUpperCase() === 'IDR') return EXCHANGE_CERT_MAX_LIVE_NOTIONAL_IDR;
  return live ? EXCHANGE_CERT_MAX_LIVE_NOTIONAL : EXCHANGE_CERT_MAX_DEMO_NOTIONAL;
}

async function buildCertificationOrderPlan(client: any, descriptor: ReturnType<typeof getExchangeDescriptor>, live: boolean) {
  const symbol = certificationPreferredSymbols(descriptor).find((candidate) => Boolean(client.markets?.[candidate]));
  if (!symbol) throw new ApiError(409, 'CERTIFICATION_SYMBOL_UNAVAILABLE', 'exchange', 'No supported BTC spot certification symbol is available.', 'Pair BTC untuk certification tidak tersedia di exchange ini.');
  const market = client.markets[symbol];
  const quote = String(market.quote || 'USDT').toUpperCase();
  const ticker: any = await withExchangeRetry(descriptor?.id || 'exchange', 'certification.fetchTicker', () => client.fetchTicker(symbol));
  const reference = Number(ticker?.bid || ticker?.last || ticker?.ask || 0);
  if (!(reference > 0)) throw new ApiError(409, 'CERTIFICATION_MARKET_PRICE_REQUIRED', 'exchange', 'A valid market price is required for certification.', 'Harga market exchange belum tersedia untuk certification.');

  // Make the limit order deliberately non-marketable so certification can create/query/cancel
  // without intentionally taking liquidity. The 5% offset also gives a little room against
  // a fast market move while remaining small relative to normal spot ranges.
  const rawPrice = reference * 0.95;
  const price = Number(client.priceToPrecision(symbol, rawPrice));
  const configuredCap = certificationDefaultNotional(quote, live);
  const minCost = Number(market?.limits?.cost?.min || 0);
  const minAmount = Number(market?.limits?.amount?.min || 0);
  let desiredNotional = configuredCap;
  if (minCost > desiredNotional) {
    if (live) {
      throw new ApiError(409, 'CERTIFICATION_MIN_NOTIONAL_TOO_HIGH', 'exchange', `The exchange minimum cost (${minCost}) exceeds the configured live certification cap (${configuredCap}).`, 'Minimum order exchange lebih besar daripada batas micro-order yang dikonfigurasi.');
    }
    desiredNotional = minCost;
  }
  let amount = desiredNotional / price;
  if (minAmount > amount) amount = minAmount;
  amount = Number(client.amountToPrecision(symbol, amount));
  const notional = amount * price;
  if (!(amount > 0) || !(notional > 0)) throw new ApiError(409, 'CERTIFICATION_AMOUNT_INVALID', 'exchange', 'Unable to derive a valid certification quantity.', 'Jumlah order certification tidak valid.');
  if (live && notional > configuredCap * 1.001) {
    throw new ApiError(409, 'CERTIFICATION_LIVE_CAP_EXCEEDED', 'security', 'Certification order exceeds the configured live notional cap.', 'Nilai micro-live order melebihi batas yang dikonfigurasi.');
  }
  return { symbol, quote, price, amount, notional, minCost, minAmount, reference, side: 'buy' as const };
}

async function fetchCertificationOrder(client: any, symbol: string, exchangeOrderId: string) {
  if (!client.has?.fetchOrder) throw new ApiError(409, 'CERTIFICATION_ORDER_QUERY_UNSUPPORTED', 'exchange', 'This exchange adapter does not expose fetchOrder.', 'Exchange belum mendukung query order untuk certification.');
  return withExchangeRetry('certification', 'fetchOrder', () => client.fetchOrder(exchangeOrderId, symbol));
}

async function runAuthenticatedReadOnlyCertification(uid: string, exchange: string) {
  const descriptor = getExchangeDescriptor(exchange);
  if (!descriptor || !descriptor.ccxtId || !descriptor.authenticatedApi) throw new ApiError(409, 'EXCHANGE_NATIVE_API_REQUIRED', 'exchange', 'Authenticated certification is not available for this exchange.', 'Authenticated API certification belum tersedia untuk exchange ini.');
  const storedCredential = await loadBotCredential(uid, exchange);
  if (!storedCredential) throw new ApiError(409, 'EXCHANGE_CREDENTIALS_REQUIRED', 'authorization', 'No active exchange credentials are configured.', 'Credential exchange aktif belum dikonfigurasi.');
  const client = createExchangeInstance(exchange, storedCredential);
  const startedAt = Date.now();
  const run = await createExchangeCertificationRun({ firebaseUid: uid, exchange, stage: 'authenticated_readonly', mode: 'READ_ONLY' });
  try {
    await withExchangeRetry(exchange, 'certification.loadMarkets', () => client.loadMarkets());
    const plan = await buildCertificationOrderPlan(client, descriptor, false);
    const ticker: any = await withExchangeRetry(exchange, 'certification.fetchTicker', () => client.fetchTicker(plan.symbol));
    const balance = await withExchangeRetry(exchange, 'certification.fetchBalance', () => client.fetchBalance());
    const openOrders = client.has?.fetchOpenOrders ? await withExchangeRetry(exchange, 'certification.fetchOpenOrders', () => client.fetchOpenOrders(plan.symbol)) : [];
    const result = {
      marketData: true,
      ticker: Number(ticker?.last) > 0,
      authenticated: true,
      balance: Boolean((balance as { total?: unknown } | null | undefined)?.total),
      ordersRead: client.has?.fetchOpenOrders ? true : false,
      symbol: plan.symbol,
      quote: plan.quote,
      openOrdersCount: Array.isArray(openOrders) ? openOrders.length : 0,
      latencyMs: Date.now() - startedAt,
      noOrdersSubmitted: true,
    };
    const pass = result.marketData && result.ticker && result.authenticated && result.balance;
    await updateExchangeCertificationRun(run.id, { status: pass ? 'PASS' : 'FAIL', result });
    await createAuditEvent({ firebaseUid: uid, eventType: 'exchange.certification.authenticated_readonly', payload: { exchange, status: pass ? 'PASS' : 'FAIL', symbol: plan.symbol } });
    return { success: pass, exchange, stage: 'authenticated_readonly', mode: 'READ_ONLY', status: pass ? 'PASS' : 'FAIL', result };
  } catch (error) {
    await updateExchangeCertificationRun(run.id, { status: 'FAIL', result: { error: String((error as any)?.code || (error as any)?.message || error).slice(0, 240), latencyMs: Date.now() - startedAt } });
    throw error;
  }
}

async function runSandboxDemoOrderCertification(uid: string, exchange: string) {
  const descriptor = getExchangeDescriptor(exchange);
  if (!descriptor?.ccxtId || !descriptor.tradingApi || !descriptor.hasOfficialSandbox) throw new ApiError(409, 'SANDBOX_NOT_AVAILABLE', 'exchange', 'This exchange does not have a verified sandbox/demo trading path in GAIN.', 'Exchange ini belum memiliki jalur Sandbox/Demo trading yang terverifikasi di GAIN.');
  const storedCredential = await loadBotCredential(uid, exchange);
  if (!storedCredential) throw new ApiError(409, 'EXCHANGE_CREDENTIALS_REQUIRED', 'authorization', 'No active exchange credentials are configured.', 'Credential exchange aktif belum dikonfigurasi.');
  if (!storedCredential.isSandbox) throw new ApiError(409, 'SANDBOX_CREDENTIALS_REQUIRED', 'security', 'Sandbox/demo certification requires sandbox credentials.', 'Gunakan credential Testnet/Demo untuk certification Sandbox.');
  const client = createExchangeInstance(exchange, storedCredential);
  const plan = await buildCertificationOrderPlan(client, descriptor, false);
  const run = await createExchangeCertificationRun({ firebaseUid: uid, exchange, stage: 'sandbox_demo_order', mode: 'SANDBOX_DEMO', symbol: plan.symbol, side: plan.side, orderType: 'limit', requestedQty: plan.amount, requestedPrice: plan.price, expectedNotional: plan.notional });
  try {
    await withExchangeRetry(exchange, 'certification.createSandboxOrder', () => client.loadMarkets());
    const order: any = await withExchangeRetry(exchange, 'certification.createSandboxOrder', () => client.createOrder(plan.symbol, 'limit', plan.side, plan.amount, plan.price, { timeInForce: 'GTC' }));
    await updateExchangeCertificationRun(run.id, { exchangeOrderId: String(order.id), exchangeStatus: String(order.status || 'open'), result: { submitted: true, orderId: String(order.id), symbol: plan.symbol, notional: plan.notional } });
    const beforeCancel: any = await fetchCertificationOrder(client, plan.symbol, String(order.id));
    let finalOrder = beforeCancel;
    if (!['closed', 'canceled', 'cancelled', 'rejected', 'expired'].includes(String(beforeCancel?.status || '').toLowerCase())) {
      if (!client.has?.cancelOrder) throw new ApiError(409, 'CERTIFICATION_CANCEL_UNSUPPORTED', 'exchange', 'The exchange adapter does not expose cancelOrder.', 'Exchange belum mendukung cancel order untuk certification.');
      try { await withExchangeRetry(exchange, 'certification.cancelSandboxOrder', () => client.cancelOrder(String(order.id), plan.symbol)); } catch (cancelError) {
        await updateExchangeCertificationRun(run.id, { status: 'WARNING', result: { cancelError: String((cancelError as any)?.message || cancelError).slice(0, 240), manualActionRequired: true } });
        throw cancelError;
      }
      finalOrder = await fetchCertificationOrder(client, plan.symbol, String(order.id));
    }
    const terminal = ['closed', 'canceled', 'cancelled', 'rejected', 'expired'].includes(String(finalOrder?.status || '').toLowerCase());
    const status = terminal ? 'PASS' : 'WARNING';
    await updateExchangeCertificationRun(run.id, { status, exchangeStatus: String(finalOrder?.status || order?.status || 'unknown'), filledQty: Number(finalOrder?.filled || 0), averagePrice: Number(finalOrder?.average || 0), result: { orderId: String(order.id), beforeCancelStatus: String(beforeCancel?.status || ''), finalStatus: String(finalOrder?.status || ''), filled: Number(finalOrder?.filled || 0), terminal } });
    await createAuditEvent({ firebaseUid: uid, eventType: 'exchange.certification.sandbox_demo_order', payload: { exchange, status, orderId: String(order.id), finalStatus: String(finalOrder?.status || '') } });
    return { success: terminal, exchange, stage: 'sandbox_demo_order', mode: 'SANDBOX_DEMO', status, orderId: String(order.id), result: { beforeCancelStatus: beforeCancel?.status, finalStatus: finalOrder?.status, filled: Number(finalOrder?.filled || 0), symbol: plan.symbol, notional: plan.notional } };
  } catch (error) {
    await updateExchangeCertificationRun(run.id, { status: 'FAIL', result: { error: String((error as any)?.message || error).slice(0, 240) } });
    throw error;
  }
}

async function requireMicroLiveCertificationGate(req: Request, uid: string, exchange: string) {
  await requireLicensedSecuritySession(req, uid);
  if (!EXCHANGE_CERT_MICRO_LIVE_ENABLED) throw new ApiError(403, 'MICRO_LIVE_CERTIFICATION_DISABLED', 'security', 'Micro-live exchange certification is disabled by server configuration.', 'Micro-live certification masih dinonaktifkan oleh konfigurasi server.');
  if (!runtimeLiveTradingEnabled || LIVE_TRADING_TESTNET_ONLY) throw new ApiError(403, 'MICRO_LIVE_ENVIRONMENT_BLOCKED', 'security', 'Live trading must be explicitly enabled and testnet-only mode must be disabled for micro-live certification.', 'Environment Live harus diaktifkan secara eksplisit dan mode testnet-only harus dimatikan sementara.');
  const expected = `${EXCHANGE_CERT_MICRO_LIVE_CONFIRM}:${exchange.toUpperCase()}`;
  if (String(req.body?.confirmation || '') !== expected) throw new ApiError(403, 'MICRO_LIVE_CONFIRMATION_REQUIRED', 'security', 'Explicit exchange-specific micro-live confirmation is required.', 'Konfirmasi micro-live khusus exchange diperlukan.');
  const security = await getTwoFactorSecretRecord(uid);
  if (!security?.two_factor_enabled || !security.two_factor_secret_ciphertext || !security.two_factor_secret_iv || !security.two_factor_secret_auth_tag) throw new ApiError(403, 'TRADE_2FA_REQUIRED', 'authorization', 'Two-factor authentication is required for live certification.', 'Aktifkan 2FA sebelum certification micro-live.');
  const secret = decryptSensitiveString({ ciphertext: security.two_factor_secret_ciphertext, iv: security.two_factor_secret_iv, authTag: security.two_factor_secret_auth_tag });
  const verification = verifyServerTotp(String(req.body?.otp2fa || '').trim(), secret, 1);
  if (!verification.valid || verification.counter === undefined || !(await consumeTotpCounter(uid, verification.counter))) throw new ApiError(403, 'TRADE_2FA_INVALID', 'authorization', 'The TOTP code is invalid or already used.', 'Kode 2FA tidak valid atau sudah digunakan.');
}

async function runMicroLiveCertification(req: Request, uid: string, exchange: string) {
  await requireMicroLiveCertificationGate(req, uid, exchange);
  const descriptor = getExchangeDescriptor(exchange);
  if (!descriptor?.ccxtId || !descriptor.tradingApi) throw new ApiError(409, 'EXCHANGE_NATIVE_API_REQUIRED', 'exchange', 'This exchange does not have an enabled trading adapter.', 'Exchange ini belum memiliki adapter trading yang aktif.');
  const storedCredential = await loadBotCredential(uid, exchange);
  if (!storedCredential) throw new ApiError(409, 'EXCHANGE_CREDENTIALS_REQUIRED', 'authorization', 'No active exchange credentials are configured.', 'Credential exchange aktif belum dikonfigurasi.');
  if (storedCredential.isSandbox) throw new ApiError(409, 'LIVE_CREDENTIALS_REQUIRED', 'security', 'Micro-live certification requires live credentials.', 'Gunakan credential Live untuk micro-live certification.');
  const client = createExchangeInstance(exchange, storedCredential);
  const plan = await buildCertificationOrderPlan(client, descriptor, true);
  const run = await createExchangeCertificationRun({ firebaseUid: uid, exchange, stage: 'micro_live_order', mode: 'MICRO_LIVE', symbol: plan.symbol, side: plan.side, orderType: 'limit', requestedQty: plan.amount, requestedPrice: plan.price, expectedNotional: plan.notional });
  try {
    await client.loadMarkets();
    const order: any = await withExchangeRetry(exchange, 'certification.createMicroLiveOrder', () => client.createOrder(plan.symbol, 'limit', plan.side, plan.amount, plan.price, { timeInForce: 'GTC' }));
    const beforeCancel: any = await fetchCertificationOrder(client, plan.symbol, String(order.id));
    let finalOrder = beforeCancel;
    const beforeStatus = String(beforeCancel?.status || '').toLowerCase();
    if (!['closed', 'canceled', 'cancelled', 'rejected', 'expired'].includes(beforeStatus) && client.has?.cancelOrder) {
      try { await withExchangeRetry(exchange, 'certification.cancelMicroLiveOrder', () => client.cancelOrder(String(order.id), plan.symbol)); } catch (cancelError) {
        await updateExchangeCertificationRun(run.id, { status: 'WARNING', exchangeOrderId: String(order.id), result: { manualActionRequired: true, cancelError: String((cancelError as any)?.message || cancelError).slice(0, 240), warning: 'Live order could not be auto-cancelled.' } });
        throw cancelError;
      }
      finalOrder = await fetchCertificationOrder(client, plan.symbol, String(order.id));
    }
    const finalStatus = String(finalOrder?.status || '').toLowerCase();
    const terminal = ['closed', 'canceled', 'cancelled', 'rejected', 'expired'].includes(finalStatus);
    const filled = Number(finalOrder?.filled || 0);
    const status = terminal ? 'PASS' : 'WARNING';
    await updateExchangeCertificationRun(run.id, { status, exchangeOrderId: String(order.id), exchangeStatus: finalStatus, filledQty: filled, averagePrice: Number(finalOrder?.average || 0), result: { warning: filled > 0 ? 'Order received fills during certification; no further automatic order was submitted.' : undefined, symbol: plan.symbol, notional: plan.notional, finalStatus, filled } });
    await createAuditEvent({ firebaseUid: uid, eventType: 'exchange.certification.micro_live_order', payload: { exchange, status, orderId: String(order.id), notional: plan.notional, filled } });
    return { success: terminal, exchange, stage: 'micro_live_order', mode: 'MICRO_LIVE', status, orderId: String(order.id), result: { finalStatus, filled, average: Number(finalOrder?.average || 0), symbol: plan.symbol, notional: plan.notional } };
  } catch (error) {
    await updateExchangeCertificationRun(run.id, { status: 'FAIL', result: { error: String((error as any)?.message || error).slice(0, 240) } });
    throw error;
  }
}

async function runCertificationReconciliation(uid: string, exchange: string, stage: 'reconcile' | 'recovery') {
  const descriptor = getExchangeDescriptor(exchange);
  if (!descriptor?.ccxtId || !descriptor.tradingApi) throw new ApiError(409, 'EXCHANGE_NATIVE_API_REQUIRED', 'exchange', 'This exchange does not have an enabled trading adapter.', 'Exchange ini belum memiliki adapter trading yang aktif.');
  const sourceRun = await getLatestExchangeCertificationRun(uid, exchange, 'micro_live_order') || await getLatestExchangeCertificationRun(uid, exchange, 'sandbox_demo_order');
  if (!sourceRun?.exchange_order_id || !sourceRun.symbol) throw new ApiError(409, 'CERTIFICATION_ORDER_NOT_FOUND', 'exchange', 'No previous certification order is available for reconciliation.', 'Belum ada order certification yang dapat direkonsiliasi.');
  const storedCredential = await loadBotCredential(uid, exchange);
  if (!storedCredential) throw new ApiError(409, 'EXCHANGE_CREDENTIALS_REQUIRED', 'authorization', 'No active exchange credentials are configured.', 'Credential exchange aktif belum dikonfigurasi.');
  const client = createExchangeInstance(exchange, storedCredential);
  await client.loadMarkets();
  const run = await createExchangeCertificationRun({ firebaseUid: uid, exchange, stage, mode: certificationModeForStage(stage), symbol: sourceRun.symbol });
  const first: any = await fetchCertificationOrder(client, sourceRun.symbol, String(sourceRun.exchange_order_id));
  const second: any = stage === 'recovery' ? await fetchCertificationOrder(client, sourceRun.symbol, String(sourceRun.exchange_order_id)) : first;
  const normalized = (order: any) => ({ status: String(order?.status || '').toLowerCase(), filled: Number(order?.filled || 0), remaining: Number(order?.remaining || 0), average: Number(order?.average || 0), id: String(order?.id || '') });
  const a = normalized(first); const b = normalized(second);
  const stable = stage === 'recovery' ? JSON.stringify(a) === JSON.stringify(b) : true;
  const coherent = a.id === String(sourceRun.exchange_order_id) && (!sourceRun.requested_qty || a.filled <= Number(sourceRun.requested_qty) + 1e-12);
  const pass = stable && coherent;
  await updateExchangeCertificationRun(run.id, { status: pass ? 'PASS' : 'FAIL', exchangeOrderId: String(sourceRun.exchange_order_id), exchangeStatus: b.status, filledQty: b.filled, averagePrice: b.average, result: { sourceRunId: sourceRun.id, first: a, second: b, stable, coherent, simulatedRestartBoundary: stage === 'recovery' } });
  await createAuditEvent({ firebaseUid: uid, eventType: `exchange.certification.${stage}`, payload: { exchange, status: pass ? 'PASS' : 'FAIL', orderId: String(sourceRun.exchange_order_id), stable, coherent } });
  return { success: pass, exchange, stage, mode: certificationModeForStage(stage), status: pass ? 'PASS' : 'FAIL', orderId: String(sourceRun.exchange_order_id), result: { first: a, second: b, stable, coherent } };
}

// API: Exchange certification stages. Trading stages are explicit, bounded, persisted and reconciled.
app.post('/api/exchange/certification/stage', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { identity } = await requireFirebaseIdentity(req);
    const exchange = String(req.body?.exchange || '').trim().toLowerCase();
    const stage = String(req.body?.stage || '').trim() as ExchangeCertificationStage;
    const descriptor = getExchangeDescriptor(exchange);
    if (!descriptor || !SUPPORTED_EXCHANGES.has(exchange)) return next(new ApiError(400, 'EXCHANGE_INVALID', 'validation', 'Exchange is invalid.', 'Exchange tidak valid.'));
    if (!EXCHANGE_CERT_STAGES.has(stage)) return next(new ApiError(400, 'CERTIFICATION_STAGE_INVALID', 'validation', 'Certification stage is invalid.', 'Tahap certification tidak valid.'));

    if (stage === 'authenticated_readonly') {
      const result = await runAuthenticatedReadOnlyCertification(identity.uid, exchange);
      return res.json(result);
    }
    if (stage === 'sandbox_demo_order') {
      await requireSecuritySession(req, identity.uid);
      const result = await runSandboxDemoOrderCertification(identity.uid, exchange);
      return res.json(result);
    }
    if (stage === 'micro_live_order') {
      const result = await runMicroLiveCertification(req, identity.uid, exchange);
      return res.json(result);
    }
    if (stage === 'reconcile' || stage === 'recovery') {
      const result = await runCertificationReconciliation(identity.uid, exchange, stage);
      return res.json(result);
    }
    return next(new ApiError(400, 'CERTIFICATION_STAGE_INVALID', 'validation', 'Certification stage is invalid.', 'Tahap certification tidak valid.'));
  } catch (error) {
    return next(error);
  }
});

app.get('/api/exchange/certification/latest', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { identity } = await requireFirebaseIdentity(req);
    const exchange = String(req.query?.exchange || '').trim().toLowerCase();
    const descriptor = getExchangeDescriptor(exchange);
    if (!descriptor) return next(new ApiError(400, 'EXCHANGE_INVALID', 'validation', 'Exchange is invalid.', 'Exchange tidak valid.'));
    const stages: Record<string, unknown> = {};
    for (const stage of EXCHANGE_CERT_STAGES) stages[stage] = await getLatestExchangeCertificationRun(identity.uid, exchange, stage);
    return res.json({ success: true, exchange, stages });
  } catch (error) { return next(error); }
});

// API: Exchange certification (read-only by design; never places an order).
app.post('/api/exchange/certification', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await requireFirebaseIdentity(req);
    const exchange = String(req.body?.exchange || '').trim().toLowerCase();
    const descriptor = getExchangeDescriptor(exchange);
    if (!descriptor) return next(new ApiError(400, 'EXCHANGE_INVALID', 'validation', 'Exchange is invalid.', 'Exchange tidak valid.'));

    const startedAt = Date.now();
    if (descriptor.publicOnly && exchange === 'reku') {
      const payload = await fetchRekuPublicPrices(['BTC/IDR']);
      const btc = payload['BTC/IDR'];
      return res.json({
        success: Boolean(btc?.last > 0),
        exchange: descriptor.id,
        mode: 'READ_ONLY_PUBLIC_API',
        certificationMode: descriptor.certificationMode,
        checks: { publicApi: Boolean(btc?.last > 0), ticker: Boolean(btc?.last > 0), authenticated: false, trading: false },
        sample: btc ? { symbol: 'BTC/IDR', last: btc.last, quoteCurrency: btc.quoteCurrency, timestamp: btc.timestamp } : null,
        latencyMs: Date.now() - startedAt,
        note: descriptor.notes,
      });
    }

    if (descriptor.publicOnly || !descriptor.ccxtId) {
      return res.json({
        success: false,
        exchange: descriptor.id,
        mode: 'BLOCKED',
        certificationMode: descriptor.certificationMode,
        checks: { publicApi: false, authenticated: false, trading: false },
        latencyMs: Date.now() - startedAt,
        note: descriptor.notes,
      });
    }

    const identity = await requireFirebaseIdentity(req);
    const storedCredential = await loadBotCredential(identity.identity.uid, exchange);
    if (!storedCredential) {
      return next(new ApiError(409, 'EXCHANGE_CREDENTIALS_REQUIRED', 'authorization', `No active ${exchange} credentials are configured.`, 'Kredensial exchange aktif belum dikonfigurasi.'));
    }

    const client = createExchangeInstance(exchange, {
      apiKey: storedCredential.apiKey,
      secret: storedCredential.secret,
      password: storedCredential.password,
      isSandbox: storedCredential.isSandbox,
    });

    const checks: Record<string, boolean> = { publicApi: false, marketData: false, authenticated: false, balance: false, ordersRead: false, ticker: false, trading: false };
    await withExchangeRetry(exchange, 'certification.loadMarkets', () => client.loadMarkets());
    checks.publicApi = true;
    checks.marketData = true;
    const preferred = ['BTC/USDT', 'BTC/USDC', 'BTC/USD'];
    const symbol = preferred.find((candidate) => client.markets?.[candidate]);
    if (symbol) {
      const ticker: any = await withExchangeRetry(exchange, 'certification.fetchTicker', () => client.fetchTicker(symbol));
      checks.ticker = Number(ticker?.last) > 0;
    }
    const balance = await withExchangeRetry(exchange, 'certification.fetchBalance', () => client.fetchBalance());
    checks.authenticated = true;
    checks.balance = Boolean((balance as { total?: unknown } | null | undefined)?.total);
    if (client.has?.fetchOpenOrders && symbol) {
      await withExchangeRetry(exchange, 'certification.fetchOpenOrders', () => client.fetchOpenOrders(symbol));
      checks.ordersRead = true;
    }

    return res.json({
      success: Object.values(checks).filter(Boolean).length >= 4,
      exchange: descriptor.id,
      mode: storedCredential.isSandbox ? 'SANDBOX_OR_DEMO' : 'LIVE_READ_ONLY',
      certificationMode: descriptor.certificationMode,
      checks,
      sampleSymbol: symbol || null,
      latencyMs: Date.now() - startedAt,
      note: storedCredential.isSandbox ? 'Read-only certification; no order submitted.' : 'Live credentials verified read-only; no order submitted.',
    });
  } catch (error: any) {
    return next(error);
  }
});

// API: Supported Exchanges & Requirements
app.get('/api/exchange/supported', (_req: Request, res: Response) => {
  res.json({
    exchanges: EXCHANGE_REGISTRY.map((item) => ({
      id: item.id,
      name: item.name,
      requiresPassphrase: item.requiresPassphrase,
      spotSupported: item.tradingApi || item.publicApi,
      sandboxSupported: item.hasOfficialSandbox,
      publicApi: item.publicApi,
      authenticatedApi: item.authenticatedApi,
      tradingApi: item.tradingApi,
      certificationMode: item.certificationMode,
      quoteCurrencies: item.quoteCurrencies,
      notes: 'notes' in item ? item.notes : undefined,
      docsUrl: 'docsUrl' in item ? item.docsUrl : undefined,
      portalUrl: item.portalUrl,
    })),
  });
});

// API: Public Real-time Ticker
app.post('/api/exchange/fetch-ticker', async (req: Request, res: Response, next) => {
  try {
    const { exchange = 'bitget', symbol = 'BTC/USDT', isSandbox = false } = req.body;
    if (!SUPPORTED_EXCHANGES.has(String(exchange).toLowerCase().trim())) {
      return next(new ApiError(400, 'EXCHANGE_UNSUPPORTED', 'validation', `Unsupported exchange: ${exchange}.`, `Exchange "${exchange}" tidak didukung.`));
    }

    if (exchange === 'reku') {
      const map = await fetchRekuPublicPrices([symbol]);
      const ticker = map[symbol.toUpperCase()];
      if (!ticker) return res.json({ success: true, exchange, symbol, last: 0, percentage: 0, timestamp: Date.now(), degraded: true, warning: `Symbol ${symbol} tidak tersedia di Reku public market API.` });
      return res.json({ success: true, exchange, symbol, last: ticker.last, percentage: ticker.percentage, timestamp: ticker.timestamp, quoteCurrency: ticker.quoteCurrency, source: ticker.source });
    }

    const cacheKey = tickerCacheKey(exchange, symbol, isSandbox);
    const cached = tickerMemoryCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < 10000) {
      return res.json({
        success: true,
        exchange,
        symbol,
        last: cached.last,
        percentage: cached.percentage,
        timestamp: cached.timestamp,
        cached: true,
      });
    }

    if (!applyCircuitBreaker(String(exchange).toLowerCase().trim())) {
      return next(new ApiError(503, 'EXCHANGE_COOLDOWN', 'exchange', 'Exchange circuit breaker is open.', 'Exchange sementara dalam cooldown karena gagal berulang.'));
    }

    const client = createExchangeInstance(exchange, { isSandbox });
    try { await ensureExchangeMarkets(client); } catch { /* fetchTicker will provide the definitive exchange error */ }
    if (!isSupportedExchangeSymbol(client, symbol)) {
      return res.json({ success: true, exchange, symbol, last: 0, percentage: 0, timestamp: Date.now(), degraded: true, warning: `Symbol ${symbol} tidak tersedia di ${String(exchange).toUpperCase()} pada environment ini.` });
    }
    const ticker = await withExchangeRetry(String(exchange).toLowerCase().trim(), 'fetchTicker', async () => client.fetchTicker(symbol));

    if (ticker.last) {
      tickerMemoryCache.set(cacheKey, {
        last: Number(ticker.last),
        percentage: Number(ticker.percentage || 0),
        timestamp: Date.now(),
      });
    }

    res.json({
      success: true,
      exchange,
      symbol,
      last: ticker.last,
      high: ticker.high,
      low: ticker.low,
      percentage: ticker.percentage,
      baseVolume: ticker.baseVolume,
      quoteVolume: ticker.quoteVolume,
      timestamp: ticker.timestamp,
    });
  } catch (error: any) {
    const normalizedExchange = String(req.body?.exchange || 'binance').toLowerCase().trim();
    if (!isDeterministicExchangeInputError(error)) registerExchangeFailure(normalizedExchange);
    return next(error);
  }
});


async function fetchBinancePublicSpotPrices(
  symbols: string[],
  isSandbox: boolean,
): Promise<Record<string, { last: number; percentage: number; timestamp: number; source: string; quoteCurrency: string }>> {
  const baseUrl = isSandbox
    ? 'https://testnet.binance.vision'
    : 'https://data-api.binance.vision';
  const encodedSymbols = encodeURIComponent(JSON.stringify(
    symbols.map((symbol) => symbol.replace('/', '').toUpperCase()),
  ));
  const url = `${baseUrl}/api/v3/ticker/price?symbols=${encodedSymbols}`;

  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`Binance public ticker fallback HTTP ${response.status}`);
  }

  const payload = await response.json() as unknown;
  const rows = Array.isArray(payload) ? payload : [payload];
  const now = Date.now();
  const result: Record<string, { last: number; percentage: number; timestamp: number; source: string; quoteCurrency: string }> = {};

  for (const row of rows as Array<Record<string, unknown>>) {
    const rawSymbol = typeof row?.symbol === 'string' ? row.symbol.toUpperCase() : '';
    const last = Number(row?.price);
    if (!rawSymbol || !Number.isFinite(last) || last <= 0) continue;
    const slashPair = rawSymbol.endsWith('USDT')
      ? `${rawSymbol.slice(0, -4)}/USDT`
      : null;
    if (!slashPair || !symbols.includes(slashPair)) continue;

    result[slashPair] = {
      last,
      percentage: 0,
      timestamp: now,
      source: 'binance-public-rest',
      quoteCurrency: 'USDT',
    };
  }

  return result;
}

async function fetchRekuPublicPrices(symbols: string[]): Promise<Record<string, { last: number; percentage: number; timestamp: number; source: string; quoteCurrency: string }>> {
  const response = await fetch('https://api.reku.id/v2/price', {
    headers: { Accept: 'application/json', 'User-Agent': 'GAIN-NiagaKoin/2.4.16' },
    signal: AbortSignal.timeout(EXCHANGE_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Reku public price HTTP ${response.status}`);
  const payload = await response.json() as any;
  if (!Array.isArray(payload)) throw new Error('Reku public price response is not an array');

  const wanted = new Set(symbols.map((symbol) => symbol.split('/')[0].toUpperCase()));
  const result: Record<string, { last: number; percentage: number; timestamp: number; source: string; quoteCurrency: string }> = {};
  for (const row of payload) {
    const base = String(row?.cd || '').toUpperCase();
    const last = Number(row?.c || 0);
    if (!base || !(last > 0) || !wanted.has(base)) continue;
    const pair = `${base}/IDR`;
    result[pair] = {
      last,
      percentage: Number(row?.cp || 0),
      timestamp: Date.now(),
      source: 'reku-public-api',
      quoteCurrency: 'IDR',
    };
  }
  return result;
}

app.post('/api/exchange/fetch-tickers-batch', async (req: Request, res: Response, next) => {
  const exchange = String(req.body?.exchange || 'binance').toLowerCase().trim();
  const inputSymbols = req.body?.symbols;
  const isSandbox = req.body?.isSandbox === true || req.body?.isSandbox === 'true';

  if (!SUPPORTED_EXCHANGES.has(exchange)) {
    return next(new ApiError(400, 'EXCHANGE_UNSUPPORTED', 'validation', `Unsupported exchange: ${exchange}.`, `Exchange "${exchange}" tidak didukung.`));
  }

  if (!Array.isArray(inputSymbols) || inputSymbols.length === 0 || inputSymbols.length > 30) {
    return next(new ApiError(400, 'TICKER_SYMBOLS_INVALID', 'validation', 'Ticker symbols must be a non-empty array with at most 30 entries.', 'Daftar simbol ticker tidak valid.'));
  }

  const symbols = [...new Set(inputSymbols.map((symbol: unknown) => String(symbol).trim().toUpperCase()))];
  if (symbols.some((symbol) => !/^[A-Z0-9]{2,12}\/[A-Z0-9]{2,10}$/.test(symbol))) {
    return next(new ApiError(400, 'TICKER_SYMBOLS_INVALID', 'validation', 'One or more ticker symbols have an invalid format.', 'Format salah satu simbol ticker tidak valid.'));
  }

  try {
    const now = Date.now();
    const tickers: Record<string, { last: number; percentage: number; timestamp: number; source: string; quoteCurrency: string }> = {};
    const symbolsToFetch: string[] = [];
    let unresolvedSymbols: string[] = [];

    for (const symbol of symbols) {
      const cacheKey = tickerCacheKey(exchange, symbol, isSandbox);
      const cached = tickerMemoryCache.get(cacheKey);
      if (cached && now - cached.timestamp < TICKER_CACHE_TTL_MS) {
        tickers[symbol] = {
          last: cached.last,
          percentage: cached.percentage,
          timestamp: cached.timestamp,
          source: cached.source || 'exchange',
          quoteCurrency: cached.quoteCurrency || 'USDT',
        };
      } else {
        symbolsToFetch.push(symbol);
      }
    }

    let attemptedExchangeCall = false;
    const exchangeAvailable = applyCircuitBreaker(exchange);
    if (symbolsToFetch.length > 0 && exchangeAvailable) {
      const client = createExchangeInstance(exchange, { isSandbox });
      try { await ensureExchangeMarkets(client); } catch { /* batch/fallback path will degrade safely */ }
      const supportedSymbols = symbolsToFetch.filter((symbol) => isSupportedExchangeSymbol(client, symbol));
      const unsupportedSymbols = symbolsToFetch.filter((symbol) => !supportedSymbols.includes(symbol));
      if (unsupportedSymbols.length > 0) {
        botExecutionMetrics.tickerFailures += unsupportedSymbols.length;
      }
      symbolsToFetch.splice(0, symbolsToFetch.length, ...supportedSymbols);
      let batchResults: Record<string, any> = {};

      if (symbolsToFetch.length > 0 && client.has?.fetchTickers) {
        attemptedExchangeCall = true;
        try {
          batchResults = await withExchangeRetry(exchange, 'fetchTickers', () => client.fetchTickers(symbolsToFetch));
        } catch {
          // Batch fetch dapat gagal jika satu atau beberapa simbol
          // tidak tersedia. Jangan anggap seluruh exchange gagal.
          // Fallback per-symbol di bawah akan mengambil ticker yang tersedia.
          batchResults = {};
        }
      }

      unresolvedSymbols = [];
      for (const symbol of symbolsToFetch) {
        const ticker = batchResults[symbol];
        const last = Number(ticker?.last);
        if (Number.isFinite(last) && last > 0) {
          const timestamp = Number(ticker.timestamp) || Date.now();
          const percentage = Number(ticker.percentage) || 0;
          tickers[symbol] = { last, percentage, timestamp, source: exchange, quoteCurrency: 'USDT' };
          tickerMemoryCache.set(tickerCacheKey(exchange, symbol, isSandbox), { last, percentage, timestamp, source: exchange, quoteCurrency: 'USDT' });
        } else {
          unresolvedSymbols.push(symbol);
        }
      }

      if (unresolvedSymbols.length > 0) {
        attemptedExchangeCall = true;
        const results = await Promise.allSettled(
          unresolvedSymbols.map((symbol) => withExchangeRetry(exchange, 'fetchTicker', () => client.fetchTicker(symbol)))
        );

        results.forEach((result, index) => {
          if (result.status !== 'fulfilled') {
            // Satu simbol gagal tidak berarti exchange gagal.
            // Simbol lain tetap boleh dikembalikan ke frontend.
            return;
          }
          const ticker: any = result.value;
          const last = Number(ticker?.last);
          if (!Number.isFinite(last) || last <= 0) return;

          const symbol = unresolvedSymbols[index];
          const timestamp = Number(ticker.timestamp) || Date.now();
          const percentage = Number(ticker.percentage) || 0;
          tickers[symbol] = { last, percentage, timestamp, source: exchange, quoteCurrency: 'USDT' };
          tickerMemoryCache.set(tickerCacheKey(exchange, symbol, isSandbox), { last, percentage, timestamp, source: exchange, quoteCurrency: 'USDT' });
        });
      }
    }

    unresolvedSymbols = symbols.filter((symbol) => !tickers[symbol]);

    if (exchange === 'reku' && unresolvedSymbols.length > 0) {
      try {
        const rekuTickers = await fetchRekuPublicPrices(unresolvedSymbols);
        for (const [symbol, ticker] of Object.entries(rekuTickers)) {
          tickers[symbol] = ticker;
          tickerMemoryCache.set(tickerCacheKey(exchange, symbol, isSandbox), ticker);
        }
        unresolvedSymbols = symbols.filter((symbol) => !tickers[symbol]);
      } catch (fallbackError: any) {
        console.warn('[REKU_PUBLIC_TICKER_FAILED]', {
          requested: unresolvedSymbols.length,
          message: String(fallbackError?.message || 'reku public ticker failed'),
        });
      }
    }

    // Binance public market-data fallback. The coin-pairing UI must be able
    // to show live prices even when CCXT's public sandbox ticker path is
    // unavailable or partially degraded. This path never uses credentials
    // and never submits an order.
    if (exchange === 'binance' && unresolvedSymbols.length > 0) {
      try {
        const publicTickers = await fetchBinancePublicSpotPrices(unresolvedSymbols, isSandbox);
        for (const [symbol, ticker] of Object.entries(publicTickers)) {
          tickers[symbol] = ticker;
          tickerMemoryCache.set(tickerCacheKey(exchange, symbol, isSandbox), ticker);
        }
        unresolvedSymbols = symbols.filter((symbol) => !tickers[symbol]);
        if (Object.keys(publicTickers).length > 0) {
          console.info('[BINANCE_PUBLIC_TICKER_FALLBACK]', {
            sandbox: isSandbox,
            requested: symbols.length,
            resolved: Object.keys(publicTickers).length,
          });
        }
      } catch (fallbackError: any) {
        console.warn('[BINANCE_PUBLIC_TICKER_FALLBACK_FAILED]', {
          sandbox: isSandbox,
          requested: symbols.length,
          message: String(fallbackError?.message || 'public ticker fallback failed'),
        });
      }
    }

    if (Object.keys(tickers).length === 0) {
      // Dashboard market-data is read-only and optional. Do not open the
      // execution/account circuit breaker just because public tickers are
      // temporarily unavailable.

      // Market data is optional for the dashboard. Return a degraded success
      // response so the UI can retain its previous values instead of turning
      // a temporary public-ticker outage into repeated 502 console errors.
      return res.json({
        success: true,
        exchange,
        source: 'unavailable',
        degraded: true,
        warning: 'Data harga sementara tidak tersedia dari exchange.',
        tickers: {},
      });
    }

    const sources = [...new Set(Object.values(tickers).map((ticker) => ticker.source))];
    res.json({ success: true, exchange, source: sources.length === 1 ? sources[0] : 'mixed', degraded: unresolvedSymbols.length > 0, warning: unresolvedSymbols.length > 0 ? `Sebagian simbol tidak tersedia atau sementara gagal diambil: ${unresolvedSymbols.join(', ')}` : undefined, tickers });
  } catch (error: any) {
    // Public ticker failures degrade the dashboard; they must not block
    // authenticated account/portfolio operations.
    return next(error);

    return next(error);
  }
});

// API: Fetch Live Markets from CCXT Exchanger (fetchMarkets)
app.all('/api/exchange/markets', async (req: Request, res: Response, next) => {
  const startTime = Date.now();

  // CWE-598 Security Guard: Reject credentials passed in GET URL query params
  if (req.method === 'GET' && (req.query.apiKey || req.query.secret || req.query.password)) {
    return next(new ApiError(400, 'CREDENTIALS_IN_URL', 'validation', 'Exchange credentials must not be sent in URL query parameters.', 'Kredensial API tidak diizinkan dikirim melalui URL.'));
  }

  const query = req.method === 'POST' ? req.body : req.query;
  const exchange = (query.exchange || 'bitget').toString().toLowerCase().trim();
  const isSandbox = query.isSandbox === true || query.isSandbox === 'true';
  const apiKey = query.apiKey ? query.apiKey.toString().trim() : undefined;
  const secret = query.secret ? query.secret.toString().trim() : undefined;
  const password = query.password ? query.password.toString().trim() : undefined;
  const forceRefresh = query.forceRefresh === true || query.forceRefresh === 'true';

  if (!SUPPORTED_EXCHANGES.has(exchange)) {
    return next(new ApiError(400, 'EXCHANGE_UNSUPPORTED', 'validation', `Unsupported exchange: ${exchange}.`, `Exchange "${exchange}" tidak didukung.`));
  }

  if (!applyCircuitBreaker(exchange)) {
    return next(new ApiError(503, 'EXCHANGE_COOLDOWN', 'exchange', 'Exchange circuit breaker is open.', 'Exchange sementara dalam cooldown karena gagal berulang.'));
  }

  const cacheKey = `${exchange}:${isSandbox ? 'sandbox' : 'live'}`;
  const cached = marketsMemoryCache.get(cacheKey);

  if (!forceRefresh && cached && Date.now() - cached.timestamp < MARKETS_CACHE_TTL_MS) {
    return res.json({
      success: true,
      exchange: exchange.toUpperCase(),
      cached: true,
      latencyMs: Date.now() - startTime,
      totalMarkets: cached.markets.length,
      markets: cached.markets,
    });
  }

  try {
    if (exchange === 'reku') {
      if (apiKey || secret || password) {
        return next(new ApiError(400, 'REKU_PUBLIC_ONLY', 'validation', 'Reku market adapter is public read-only and does not accept credentials here.', 'Reku market certification saat ini read-only; jangan kirim credential.'));
      }
      const response = await fetch('https://api.reku.id/v2/coins', { headers: { Accept: 'application/json', 'User-Agent': 'GAIN-NiagaKoin/2.4.16' }, signal: AbortSignal.timeout(EXCHANGE_TIMEOUT_MS) });
      if (!response.ok) throw new Error(`Reku coins HTTP ${response.status}`);
      const payload = await response.json() as any;
      const rows = Array.isArray(payload?.result) ? payload.result : Array.isArray(payload) ? payload : [];
      const spotMarkets = rows
        .filter((m: any) => m?.accountcode)
        .map((m: any) => ({
          symbol: `${String(m.accountcode).toUpperCase()}/IDR`,
          id: String(m.id ?? m.accountcode),
          base: String(m.accountcode).toUpperCase(),
          quote: 'IDR',
          active: Number(m.enablebuy) === 1 || Number(m.enablesell) === 1,
          spot: true,
          limits: { amount: { min: Number(m.minsend || 0) || 0.000001 }, cost: { min: 0 }, price: undefined },
          precision: { amount: Number(m.decimals ?? 8), price: Number(m.digits ?? 0) },
          info: { status: (Number(m.enablebuy) === 1 || Number(m.enablesell) === 1) ? 'TRADING' : 'HALT' },
        }));
      marketsMemoryCache.set(cacheKey, { markets: spotMarkets, timestamp: Date.now() });
      return res.json({ success: true, exchange: 'REKU', latencyMs: Date.now() - startTime, totalMarkets: spotMarkets.length, markets: spotMarkets, source: 'reku-public-api' });
    }

    if (apiKey && secret) assertRealExchangeCredentials(apiKey, secret);

    const client = createExchangeInstance(exchange, { apiKey, secret, password, isSandbox });

    // Fetch markets with 6500ms timeout race
    const rawMarkets = (await Promise.race([
      withExchangeRetry(exchange, 'fetchMarkets', () => client.fetchMarkets()),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Koneksi timeout (6.5s) saat mengambil daftar pasar')), 6500)
      ),
    ])) as any[];

    const spotMarkets = (rawMarkets || [])
      .filter((m: any) => m && (m.spot || m.type === 'spot' || !m.type))
      .map((m: any) => ({
        symbol: m.symbol,
        id: m.id || m.symbol,
        base: m.base,
        quote: m.quote,
        active: m.active !== false,
        spot: true,
        limits: {
          amount: m.limits?.amount || { min: 0.001 },
          cost: m.limits?.cost || { min: 5 },
          price: m.limits?.price,
        },
        precision: {
          amount: m.precision?.amount,
          price: m.precision?.price,
        },
        info: {
          status: m.info?.status || m.info?.state || 'TRADING',
        },
      }));

    if (spotMarkets.length > 0) {
      marketsMemoryCache.set(cacheKey, {
        markets: spotMarkets,
        timestamp: Date.now(),
      });
    }

    res.json({
      success: true,
      exchange: exchange.toUpperCase(),
      latencyMs: Date.now() - startTime,
      totalMarkets: spotMarkets.length,
      markets: spotMarkets,
    });
  } catch (error: any) {
    registerExchangeFailure(exchange);
    return next(error);
  }
});

function buildExchangeCredentialIdentityKey(credential: { exchange: string; apiKey: string; secret: string; password?: string; isSandbox: boolean }): string {
  const material = [
    credential.exchange.toLowerCase().trim(),
    credential.isSandbox ? 'sandbox' : 'live',
    credential.apiKey.trim(),
    credential.secret.trim(),
    credential.password?.trim() || '',
  ].join('|');
  return `credential:${createHmac('sha256', getBotCredentialEncryptionKey()).update(material, 'utf8').digest('hex')}`;
}

function resolveExchangeAccountIdentity(
  exchange: string,
  isSandbox: boolean,
  balance: any,
  credential: { apiKey: string; secret: string; password?: string },
): { identityKey: string; identityType: 'exchange_reported' | 'credential_fingerprint'; identityHint: string; credentialFingerprint: string; reportedIdentityKey?: string } {
  const info = balance?.info && typeof balance.info === 'object' ? balance.info : {};
  const candidates = [
    info.uid, info.userId, info.user_id, info.accountId, info.account_id,
    info.accountUid, info.account_uid, info.memberId, info.member_id,
  ].map((value) => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '').filter(Boolean);
  const credentialFingerprint = buildExchangeCredentialIdentityKey({
    exchange,
    apiKey: credential.apiKey,
    secret: credential.secret,
    password: credential.password,
    isSandbox,
  });
  if (candidates.length > 0) {
    const candidate = candidates[0];
    const reportedMaterial = `${exchange.toLowerCase()}|${isSandbox ? 'sandbox' : 'live'}|${candidate}`;
    const reportedIdentityKey = `reported:${createHmac('sha256', getBotCredentialEncryptionKey()).update(reportedMaterial, 'utf8').digest('hex')}`;
    return {
      identityKey: credentialFingerprint,
      identityType: 'exchange_reported',
      identityHint: `${candidate.slice(0, 4)}••••${candidate.slice(-4)}`,
      credentialFingerprint,
      reportedIdentityKey,
    };
  }
  return { identityKey: credentialFingerprint, identityType: 'credential_fingerprint', identityHint: credentialFingerprint.slice(-12), credentialFingerprint };
}

function normalizeExchangeCredentialConflict(error: any): ApiError {
  if (error?.code === 'EXCHANGE_ACCOUNT_ALREADY_LINKED') {
    return new ApiError(409, 'EXCHANGE_ACCOUNT_ALREADY_LINKED', 'authorization', 'This exchange account is already linked to another GAIN account.', 'Akun exchange ini sudah terhubung ke akun GAIN lain. Gunakan akun exchange yang berbeda atau putuskan koneksi dari akun GAIN yang memiliki akun tersebut terlebih dahulu.');
  }
  return error;
}

async function backfillExchangeAccountIdentityMetadata(): Promise<void> {
  const rows = await dbQuery<any>(`
    SELECT ec.user_id, ec.exchange, ec.sandbox, ec.ciphertext, ec.iv, ec.auth_tag,
           ea.id AS exchange_account_id, ea.identity_key
      FROM exchange_credentials ec
      LEFT JOIN exchange_accounts ea
        ON ea.user_id = ec.user_id AND lower(ea.exchange) = lower(ec.exchange)
     WHERE ec.status = 'ACTIVE'
       AND (ea.identity_key IS NULL OR ea.identity_type IS NULL)
  `);
  let updated = 0;
  let conflicts = 0;
  for (const row of rows.rows) {
    try {
      const credential = decryptBotCredential({ iv: row.iv, authTag: row.auth_tag, ciphertext: row.ciphertext });
      if (!credential.exchange) throw new Error('Stored exchange credential is missing its exchange identifier.');
      const identityCredential = {
        exchange: String(credential.exchange),
        apiKey: credential.apiKey,
        secret: credential.secret,
        password: credential.password,
        isSandbox: credential.isSandbox,
      };
      const identityKey = buildExchangeCredentialIdentityKey(identityCredential);
      const existingOwner = await findExchangeIdentityOwner({
        exchange: credential.exchange,
        sandbox: credential.isSandbox,
        identityKey,
      });
      if (existingOwner && existingOwner.exchange_account_id !== row.exchange_account_id) {
        conflicts += 1;
        console.warn('[EXCHANGE_ACCOUNT_IDENTITY_CONFLICT_ON_BACKFILL]', {
          exchange: credential.exchange,
          sandbox: credential.isSandbox,
          exchangeAccountId: row.exchange_account_id,
          existingOwnerAccountId: existingOwner.exchange_account_id,
        });
        continue;
      }
      await dbQuery(`UPDATE exchange_accounts SET identity_key=$2, identity_type='credential_fingerprint', identity_hint=$3, credential_fingerprint=$2, credential_version=COALESCE(credential_version,1), updated_at=now() WHERE id=$1`, [row.exchange_account_id, identityKey, identityKey.slice(-12)]);
      updated += 1;
    } catch (error) {
      console.warn('[EXCHANGE_ACCOUNT_IDENTITY_BACKFILL_FAILED]', { exchange: row.exchange, message: String((error as any)?.message || error) });
    }
  }
  if (updated || conflicts) console.info('[EXCHANGE_ACCOUNT_IDENTITY_BACKFILL]', { updated, conflicts });
}

// API: Test Exchange Connection & Authenticate
app.post('/api/exchange/test-connection', async (req: Request, res: Response, next) => {
    await requireFirebaseIdentity(req);
  const startTime = Date.now();
  try {
    const { exchange = 'bitget', apiKey, secret, password, isSandbox = false } = sanitizeExchangeInput(req.body, { requirePassphrase: ['bitget', 'okx'].includes((req.body?.exchange || 'bitget').toString().toLowerCase().trim()) });

    if (!applyCircuitBreaker(exchange)) {
      return next(new ApiError(503, 'EXCHANGE_COOLDOWN', 'exchange', 'Exchange circuit breaker is open.', 'Exchange sementara dalam cooldown karena gagal berulang.'));
    }

    assertRealExchangeCredentials(apiKey, secret);

    const client = createExchangeInstance(exchange, { apiKey, secret, password, isSandbox });

    // Call fetchBalance to verify API signature and read permissions
    const balance = await withExchangeRetry(exchange, 'fetchBalance', async () => client.fetchBalance());
    const latency = Date.now() - startTime;

    // Concurrently extract and evaluate portfolio assets without blocking rate limits
    const { currencies, portfolioAssets, usdtBalance, totalPortfolioUsdt } =
      await extractPortfolioAndValuation(client, balance, exchange, isSandbox);

    res.json({
      success: true,
      message: `Koneksi ke ${exchange.toUpperCase()} ${isSandbox ? '(Testnet Sandbox)' : ''} berhasil diverifikasi!`,
      exchange: exchange.toUpperCase(),
      latencyMs: latency,
      portfolioAsOf: Date.now(),
      usdtAvailable: usdtBalance,
      totalPortfolioUsdt,
      portfolioAssets,
      currencies,
      permissions: {
        spotTrading: true,
        readData: true,
        withdrawal: false, // Recommended safety constraint
      },
    });
  } catch (error: any) {
    const exchangeName = String(req.body?.exchange || 'bitget').toLowerCase().trim();
    registerExchangeFailure(exchangeName);
    return next(error);
  }
});

// API: Fetch Real-Time Portfolio & Open Orders
app.post('/api/exchange/fetch-portfolio', async (req: Request, res: Response, next) => {
  try {
    requireDatabase();

    const { identity } = await requireFirebaseIdentity(req);

    const requestedExchange = String(req.body?.exchange || 'binance')
      .toLowerCase()
      .trim();

    if (!SUPPORTED_EXCHANGES.has(requestedExchange)) {
      return next(new ApiError(
        400,
        'EXCHANGE_INVALID',
        'validation',
        `Exchange "${requestedExchange}" is not supported.`,
        `Exchange "${requestedExchange}" tidak didukung.`
      ));
    }

    // Credential exchange adalah sumber kebenaran dari PostgreSQL.
    // Browser tidak boleh mengirim apiKey/secret untuk endpoint portfolio.
    const storedCredential = await loadBotCredential(identity.uid, requestedExchange);

    if (!storedCredential) {
      return next(new ApiError(
        409,
        'EXCHANGE_CREDENTIALS_REQUIRED',
        'authorization',
        'Encrypted exchange credentials are required.',
        'Simpan kredensial API exchange terlebih dahulu.'
      ));
    }

    const {
      apiKey,
      secret,
      password,
      isSandbox,
    } = storedCredential;

    assertRealExchangeCredentials(apiKey, secret);

    if (!applyCircuitBreaker(requestedExchange)) {
      return next(new ApiError(
        503,
        'EXCHANGE_COOLDOWN',
        'exchange',
        'Exchange circuit breaker is open.',
        'Exchange sementara dalam cooldown karena gagal berulang.'
      ));
    }

    const client = createExchangeInstance(requestedExchange, {
      apiKey,
      secret,
      password,
      isSandbox,
    });

    const balance = await withExchangeRetry(
      requestedExchange,
      'fetchBalance',
      async () => client.fetchBalance()
    );

    const {
      currencies,
      portfolioAssets,
      usdtBalance,
      totalPortfolioUsdt,
    } = await extractPortfolioAndValuation(
      client,
      balance,
      requestedExchange,
      isSandbox
    );

    let openOrders: any[] = [];

    try {
      openOrders = await client.fetchOpenOrders();
    } catch {
      // Tidak semua exchange/testnet mengizinkan fetchOpenOrders
      // tanpa symbol. Saldo portfolio tetap valid.
    }

    res.json({
      success: true,
      exchange: requestedExchange.toUpperCase(),
      isSandbox,
      usdtBalance,
      totalPortfolioUsdt,
      portfolioAssets,
      currencies,
      openOrdersCount: openOrders.length,
      openOrders,
      portfolioAsOf: Date.now(),
    });
    registerExchangeSuccess(requestedExchange);
  } catch (error: any) {
    // Validation/auth error TIDAK boleh membuka circuit breaker.
    // Hanya kegagalan upstream/exchange/server yang dihitung.
    if (!(error instanceof ApiError) || error.statusCode >= 500) {
      registerExchangeFailure(
        String(req.body?.exchange || 'binance').toLowerCase().trim()
      );
    }

    return next(error);
  }
});

// API: Place Order (Spot Buy/Sell)
app.post('/api/exchange/place-order', async (req: Request, res: Response, next) => {
  try {
    requireDatabase();
    const { identity } = await requireFirebaseIdentity(req);
    await requireSecuritySession(req, identity.uid);
    const requestedSandbox = Boolean(req.body?.isSandbox ?? true);
    if (!requestedSandbox && !runtimeLiveTradingEnabled) return next(new ApiError(403,'LIVE_TRADING_DISABLED','security','Live trading is disabled on this server.','Trading live belum diaktifkan oleh administrator.'));
    const { symbol, type = 'market', side = 'buy', amount, price } = req.body;
    const validatedExchange = String(req.body?.exchange || 'binance').toLowerCase().trim();
    if (!SUPPORTED_EXCHANGES.has(validatedExchange)) return next(new ApiError(400,'EXCHANGE_INVALID','validation','Exchange is not supported.','Exchange tidak didukung.'));
    const storedCredential = await loadBotCredential(identity.uid, validatedExchange);
    if (!storedCredential) return next(new ApiError(409,'EXCHANGE_CREDENTIALS_REQUIRED','authorization','Store exchange credentials before placing an order.','Simpan kredensial exchange terlebih dahulu.'));
    const { apiKey, secret, password, isSandbox: validatedSandbox } = storedCredential;

    if (!applyCircuitBreaker(validatedExchange)) {
      return next(new ApiError(503, 'EXCHANGE_COOLDOWN', 'exchange', 'Exchange circuit breaker is open.', 'Exchange sementara dalam cooldown karena gagal berulang.'));
    }

    const effectiveExchange = validatedExchange;
    const effectiveSandbox = validatedSandbox;
    if (!effectiveSandbox) await requireActiveLicense(identity.uid);
    if (LIVE_TRADING_TESTNET_ONLY && !effectiveSandbox) return next(new ApiError(403,'LIVE_TRADING_TESTNET_ONLY','security','This server is restricted to exchange testnet/sandbox orders.','Server ini masih dibatasi untuk order Testnet/Sandbox.'));
    if (!effectiveSandbox) {
      const security = await getTwoFactorSecretRecord(identity.uid);
      const otp = String(req.body?.otp2fa || '').trim();
      if (!security?.two_factor_enabled || !security.two_factor_secret_ciphertext || !security.two_factor_secret_iv || !security.two_factor_secret_auth_tag) return next(new ApiError(403,'TRADE_2FA_REQUIRED','authorization','Two-factor authentication is required for live exchange orders.','Aktifkan 2FA sebelum order live.'));
      const secret = decryptSensitiveString({ciphertext:security.two_factor_secret_ciphertext,iv:security.two_factor_secret_iv,authTag:security.two_factor_secret_auth_tag});
      const verification = verifyServerTotp(otp, secret, 1);
      if (!verification.valid || verification.counter === undefined || !(await consumeTotpCounter(identity.uid, verification.counter))) return next(new ApiError(403,'TRADE_2FA_INVALID','authorization','The TOTP code is invalid or already used.','Kode Google Authenticator tidak valid atau sudah digunakan.'));
    }

    if (!symbol || !side || !amount) {
      return next(new ApiError(400, 'ORDER_FIELDS_REQUIRED', 'validation', 'Order symbol, side, and amount are required.', 'Parameter symbol, side (buy/sell), dan amount wajib diisi.'));
    }

    // Rate Limiting Guard
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(`order:${clientIp}`, 15, 10000) || !(await checkRedisRateLimit(`order:${identity.uid}`, 15, 10))) {
      return next(new ApiError(429, 'ORDER_RATE_LIMITED', 'rate_limit', 'Order rate limit exceeded.', 'Rate limit order terlampaui. Harap tunggu beberapa saat sebelum mengeksekusi order baru.'));
    }

    // Input Sanitization & Bounds Checking
    const cleanSymbol = symbol.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,12}\/[A-Z0-9]{2,10}$/.test(cleanSymbol)) {
      return next(new ApiError(400, 'ORDER_SYMBOL_INVALID', 'validation', 'Order symbol has an invalid format.', 'Format symbol tidak valid (contoh yang benar: BTC/USDT).'));
    }

    const cleanSide = side.toString().toLowerCase().trim();
    if (cleanSide !== 'buy' && cleanSide !== 'sell') {
      return next(new ApiError(400, 'ORDER_SIDE_INVALID', 'validation', 'Order side must be buy or sell.', 'Side order hanya boleh "buy" atau "sell".'));
    }

    const cleanType = (type || 'market').toString().toLowerCase().trim();
    if (cleanType !== 'market' && cleanType !== 'limit') {
      return next(new ApiError(400, 'ORDER_TYPE_INVALID', 'validation', 'Order type must be market or limit.', 'Tipe order hanya boleh "market" atau "limit".'));
    }

    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0 || numAmount > 1000000) {
      return next(new ApiError(400, 'ORDER_AMOUNT_INVALID', 'validation', 'Order amount is outside the accepted range.', 'Nilai amount tidak valid atau melebihi batas toleransi keamanan (0 < amount <= 1,000,000).'));
    }

    if (price !== undefined && price !== null) {
      const numPrice = Number(price);
      if (!Number.isFinite(numPrice) || numPrice <= 0 || numPrice > 2000000) {
        return next(new ApiError(400, 'ORDER_PRICE_INVALID', 'validation', 'Order price is outside the accepted range.', 'Nilai harga limit tidak valid.'));
      }
    }

    assertRealExchangeCredentials(apiKey, secret);
    const clientOrderId = `manual-${identity.uid}-${randomUUID()}`;
    const cachedPrice = tickerMemoryCache.get(tickerCacheKey(effectiveExchange, cleanSymbol, effectiveSandbox))?.last;
    const finalPrice = price ? Number(price) : cachedPrice;
    if (!finalPrice || !Number.isFinite(finalPrice) || finalPrice <= 0) {
      return next(new ApiError(409, 'REAL_MARKET_PRICE_REQUIRED', 'exchange', 'A fresh exchange market price is required before placing an order.', 'Harga market real dari exchange wajib tersedia sebelum order dikirim.'));
    }
    const financialOrder = await createOrderRecord({ firebaseUid: identity.uid, exchange: effectiveExchange, symbol: cleanSymbol, side: cleanSide, orderType: cleanType, clientOrderId, idempotencyKey: String(req.header('Idempotency-Key') || clientOrderId), requestedQty: Number(amount), requestedPrice: finalPrice, expectedNotional: Number(amount) * finalPrice, status: 'SUBMITTED' });
    if (financialOrder.replayed) return res.status(409).json({ success:false, error:'Idempotent order already exists.', code:'IDEMPOTENT_ORDER_ALREADY_EXISTS', orderId:financialOrder.id });

    const client = createExchangeInstance(effectiveExchange, { apiKey, secret, password, isSandbox: effectiveSandbox });

    // Load markets safely to validate precision and limits across all pairs
    try {
      if (!client.markets || Object.keys(client.markets).length === 0) {
        await client.loadMarkets();
      }
    } catch {}

    let finalAmount = Number(amount);
    if (client.markets && client.markets[cleanSymbol]) {
      try {
        finalAmount = Number(client.amountToPrecision(cleanSymbol, finalAmount));
      } catch {}
    }

    // A market order must reach a terminal state before the caller mutates its position.
    let order: any = await withExchangeRetry(effectiveExchange, 'createOrder', async () => withTimeout(
      client.createOrder(
        cleanSymbol,
        cleanType,
        cleanSide,
        finalAmount,
        price ? Number(price) : undefined,
        { clientOrderId }
      ),
      EXCHANGE_TIMEOUT_MS,
      'exchange_order_timeout'
    ));
    let orderStatus = String(order.status || '').toLowerCase();
    const terminalStatuses = new Set(['closed', 'filled', 'canceled', 'cancelled']);

    if (order.id && !terminalStatuses.has(orderStatus)) {
      order = await withExchangeRetry(effectiveExchange, 'fetchOrder', async () => withTimeout(
        client.fetchOrder(order.id, cleanSymbol),
        EXCHANGE_TIMEOUT_MS,
        'exchange_order_status_timeout'
      ));
      orderStatus = String(order.status || '').toLowerCase();
    }

    if (order.id && !terminalStatuses.has(orderStatus)) {
      await withTimeout(client.cancelOrder(order.id, cleanSymbol), EXCHANGE_TIMEOUT_MS, 'exchange_order_cancel_timeout');
      order = await withExchangeRetry(effectiveExchange, 'fetchOrder', async () => withTimeout(
        client.fetchOrder(order.id, cleanSymbol),
        EXCHANGE_TIMEOUT_MS,
        'exchange_order_status_timeout'
      ));
      orderStatus = String(order.status || '').toLowerCase();
    }

    const filled = Number(order.filled) || 0;
    const fillPrice = Number(order.average || order.price) || 0;
    if (!order.id || filled <= 0 || fillPrice <= 0 || !terminalStatuses.has(orderStatus)) {
      return next(new ApiError(
        502,
        'ORDER_FILL_UNCONFIRMED',
        'exchange',
        'Exchange did not confirm a terminal order fill.',
        'Bursa belum mengonfirmasi fill order. Periksa open order dan saldo exchange sebelum mencoba lagi.'
      ));
    }

    await finalizeOrderWithFill({ orderId: financialOrder.id, exchangeOrderId: String(order.id), quantity: filled, price: fillPrice, quoteAmount: Number((filled * fillPrice).toFixed(10)), feeAmount: Number(order.fee?.cost || 0), feeAsset: order.fee?.currency ? String(order.fee.currency) : undefined });
    await mirrorFinancialTransaction(identity.uid, { id:String(financialOrder.id), title:`Manual ${cleanSide.toUpperCase()} ${cleanSymbol}`, type:cleanSide==='buy'?'outflow':'inflow', status:'Completed', amount:Number((filled*fillPrice).toFixed(10))*(cleanSide==='buy'?-1:1), amountFormatted:`${cleanSide==='buy'?'-':'+'}${(filled*fillPrice).toFixed(6)} USDT`, counterparty:`${effectiveExchange.toUpperCase()} ${effectiveSandbox?'Testnet':'Live'}`, feeInfo:`Order #${String(order.id)}` });
    logAuditEvent(req, res, 'exchange.order.submitted', {
      exchange: effectiveExchange,
      symbol: cleanSymbol,
      side: cleanSide,
      sandbox: effectiveSandbox,
    });
    res.json({
      success: true,
      message: `Order ${side.toUpperCase()} ${symbol} berhasil dieksekusi di ${effectiveExchange.toUpperCase()} ${effectiveSandbox ? '(Testnet)' : ''}!`,
      orderId: order.id,
      status: filled < finalAmount ? 'partially_filled' : 'filled',
      filled,
      price: fillPrice,
      amount: order.amount,
      timestamp: order.timestamp,
    });
  } catch (error: any) {
    registerExchangeFailure(String(req.body?.exchange || 'binance').toLowerCase().trim());
    return next(error);
  }
});

// API: Fetch Trade History from Exchange
app.post('/api/exchange/fetch-trades', async (req: Request, res: Response, next) => {
  try {
    const { identity } = await requireFirebaseIdentity(req);
    const requestedExchange = String(req.body?.exchange || 'binance').trim().toLowerCase();

    if (!['binance', 'bitget', 'okx'].includes(requestedExchange)) {
      return next(new ApiError(
        400,
        'EXCHANGE_INVALID',
        'validation',
        'Exchange is invalid.',
        'Exchange tidak valid.',
      ));
    }

    const symbol = typeof req.body?.symbol === 'string' && req.body.symbol.trim()
      ? req.body.symbol.trim()
      : undefined;

    const parsedLimit = Number(req.body?.limit ?? 30);
    const limit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(Math.floor(parsedLimit), 100))
      : 30;

    if (!applyCircuitBreaker(requestedExchange)) {
      return next(new ApiError(
        503,
        'EXCHANGE_COOLDOWN',
        'exchange',
        'Exchange circuit breaker is open.',
        'Exchange sementara dalam cooldown karena gagal berulang.',
      ));
    }

    /*
     * Exchange credentials are never accepted from this frontend endpoint.
     * They are loaded from the encrypted PostgreSQL credential store using
     * the authenticated Firebase UID.
     */
    const storedCredential = await loadBotCredential(identity.uid, requestedExchange);

    if (!storedCredential) {
      return next(new ApiError(
        409,
        'EXCHANGE_CREDENTIALS_REQUIRED',
        'validation',
        `No active ${requestedExchange} exchange credentials are configured for this account.`,
        'Kredensial exchange aktif belum dikonfigurasi untuk akun ini.',
      ));
    }

    const resolvedExchange = storedCredential.exchange;
    const resolvedApiKey = storedCredential.apiKey;
    const resolvedSecret = storedCredential.secret;
    const resolvedPassword = storedCredential.password;
    const resolvedSandbox = storedCredential.isSandbox;

    const client = createExchangeInstance(resolvedExchange, {
      apiKey: resolvedApiKey,
      secret: resolvedSecret,
      password: resolvedPassword,
      isSandbox: resolvedSandbox,
    });

    const formattedTrades: Array<{
      id: string;
      orderId?: string;
      exchange: string;
      symbol: string;
      side: 'buy' | 'sell';
      type: string;
      price: number;
      amount: number;
      costUsdt: number;
      fee?: { cost: number; currency: string };
      timestamp: number;
      datetime: string;
      status: 'filled' | 'closed' | 'open' | 'canceled';
      isSandbox: boolean;
    }> = [];

    try { await ensureExchangeMarkets(client); } catch { /* trade history can still attempt generic retrieval */ }
    if (symbol && !isSupportedExchangeSymbol(client, symbol)) {
      return res.json({ success: true, count: 0, trades: [], degraded: true, warning: `Symbol ${symbol} tidak tersedia di ${resolvedExchange.toUpperCase()} pada environment ini.` });
    }

    const targetSymbols = symbol
      ? [symbol]
      : ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'DOGE/USDT', 'ADA/USDT', 'AVAX/USDT']
        .filter((candidate) => isSupportedExchangeSymbol(client, candidate));

    let rawTrades: any[] = [];
    if (symbol) {
      try {
        if (client.has['fetchMyTrades']) {
          rawTrades = await withExchangeRetry(resolvedExchange, 'fetchMyTrades', async () => client.fetchMyTrades(String(symbol), undefined, limit));
        } else if (client.has['fetchClosedOrders']) {
          rawTrades = await withExchangeRetry(resolvedExchange, 'fetchClosedOrders', async () => client.fetchClosedOrders(symbol, undefined, limit));
        }
      } catch (err: any) {
        console.warn(`[CCXT] fetchMyTrades error for ${symbol}:`, err.message);
      }
    } else {
      const results = await Promise.allSettled(
          targetSymbols.map(async (s) => {
            try {
              if (!s || !s.includes('/')) return [];
              if (client.has['fetchMyTrades']) {
                return await withExchangeRetry(resolvedExchange, 'fetchMyTrades', async () => client.fetchMyTrades(String(s), undefined, 10));
              } else if (client.has['fetchClosedOrders']) {
                return await withExchangeRetry(resolvedExchange, 'fetchClosedOrders', async () => client.fetchClosedOrders(s, undefined, 10));
              }
            } catch {
              // Symbol might not have orders
            }
            return [];
          })
        );

        for (const res of results) {
          if (res.status === 'fulfilled' && Array.isArray(res.value)) {
            rawTrades.push(...res.value);
          }
        }
    }

    rawTrades.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    for (const t of rawTrades.slice(0, limit)) {
      const tradeId = t.id || t.orderId || `tr-${t.timestamp || Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const price = Number(t.price || t.average || 0);
      const amount = Number(t.amount || t.filled || 0);
      const costUsdt = Number((t.cost || (price * amount)).toFixed(2));
      const side = (t.side || 'buy').toLowerCase() === 'sell' ? 'sell' : 'buy';
      const status = (t.status || 'filled').toLowerCase() as 'filled' | 'closed' | 'open' | 'canceled';

      formattedTrades.push({
        id: String(tradeId),
        orderId: t.order ? String(t.order) : (t.orderId ? String(t.orderId) : undefined),
        exchange: resolvedExchange.toUpperCase(),
        symbol: t.symbol || symbol || 'BTC/USDT',
        side,
        type: t.type || 'market',
        price,
        amount,
        costUsdt,
        fee: t.fee ? { cost: Number(t.fee.cost || 0), currency: t.fee.currency || 'USDT' } : undefined,
        timestamp: t.timestamp || Date.now(),
        datetime: t.datetime || new Date(t.timestamp || Date.now()).toISOString(),
        status,
        isSandbox: resolvedSandbox,
      });
    }

    registerExchangeSuccess(resolvedExchange);
    res.json({
      success: true,
      count: formattedTrades.length,
      trades: formattedTrades,
    });
  } catch (error: any) {
    if (!isDeterministicExchangeInputError(error)) {
      registerExchangeFailure(String(req.body?.exchange || 'binance').toLowerCase().trim());
    }
    return next(error);
  }
});

// API: Real exchange market/execution verification. Never fabricates fills.
app.post('/api/exchange/test-all-coins-execution', async (req: Request, res: Response, next) => {
    await requireFirebaseIdentity(req);
  try {
    const { exchange = 'bitget', apiKey, secret, password, isSandbox = true } = req.body || {};
    const validated = sanitizeExchangeInput({ exchange, apiKey, secret, password, isSandbox }, { requirePassphrase: ['bitget', 'okx'].includes(String(exchange).toLowerCase()) });
    const client = createExchangeInstance(validated.exchange, validated);
    await withExchangeRetry(validated.exchange, 'verification.loadMarkets', () => client.loadMarkets());

    const preferredSymbols = ['BTC/USDT','ETH/USDT','SOL/USDT','BNB/USDT','LINK/USDT','XRP/USDT','DOGE/USDT','SUI/USDT','NEAR/USDT','UNI/USDT','ZEC/USDT','HYPE/USDT'];
    const results = [];
    for (const symbol of preferredSymbols) {
      const startedAt = Date.now();
      if (!client.markets?.[symbol]) {
        results.push({ symbol, executable: false, executionStatus: 'MARKET_UNAVAILABLE', isLiveConnected: false, latencyMs: Date.now() - startedAt, note: 'Symbol tidak tersedia pada market exchange yang sedang terhubung.' });
        continue;
      }
      try {
        const ticker: any = await withTimeout(client.fetchTicker(symbol), EXCHANGE_TIMEOUT_MS, 'verification_ticker_timeout');
        const last = Number(ticker?.last);
        if (!Number.isFinite(last) || last <= 0) throw new Error('ticker_unavailable');
        results.push({ symbol, executable: true, executionStatus: 'MARKET_READY', isLiveConnected: true, price: last, timestamp: Number(ticker?.timestamp) || Date.now(), latencyMs: Date.now() - startedAt, note: validated.isSandbox ? 'Market Testnet/Sandbox terhubung. Tidak ada order dikirim.' : 'Market Live terhubung. Tidak ada order dikirim.' });
      } catch (error: any) {
        results.push({ symbol, executable: false, executionStatus: 'MARKET_ERROR', isLiveConnected: false, latencyMs: Date.now() - startedAt, note: sanitizeExchangeErrorMessage(error?.message || 'market_error', req.body) });
      }
    }

    const executableCount = results.filter((r) => r.executable).length;
    res.json({ success: true, exchange: validated.exchange.toUpperCase(), environment: validated.isSandbox ? 'TESTNET' : 'LIVE', totalVerified: results.length, executableCount, allExecutable: executableCount === results.length, ordersSubmitted: 0, summary: `Verifikasi market nyata selesai. ${executableCount}/${results.length} pair tersedia; tidak ada simulator dan tidak ada order otomatis.`, results });
  } catch (error: any) {
    return next(error);
  }
});

// ==========================================
// P2P MEMBER TRANSFER API
// ==========================================
app.get('/api/referrals/direct', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireDatabase();
    const { identity } = await requireFirebaseIdentity(req);
    const result = await dbQuery<any>(`SELECT u.member_id,u.firebase_uid,u.username,u.status,u.created_at,
      EXISTS (SELECT 1 FROM licenses l WHERE l.user_id=u.id AND l.status='ACTIVE' AND (l.expires_at IS NULL OR l.expires_at > now())) AS has_active_license,
      COALESCE(SUM(CASE WHEN re.sponsor_user_id=s.id AND re.source_user_id=u.id THEN re.reward_amount ELSE 0 END),0) AS bonus_yield_usdt
      FROM users s JOIN users u ON u.sponsor_user_id=s.id
      LEFT JOIN referral_events re ON re.sponsor_user_id=s.id AND re.source_user_id=u.id
      WHERE s.firebase_uid=$1 GROUP BY u.id ORDER BY u.created_at DESC LIMIT 100`, [identity.uid]);
    res.json({ success:true, members:result.rows.map((r:any)=>({ memberId:r.member_id, userId:r.firebase_uid, username:r.username || 'Member', accountStatus:r.has_active_license ? 'active':'non-active', memberStatus:r.status==='active'?'active':'suspended', licenseStatus:r.has_active_license ? 'active':'none', joinedAt:r.created_at, bonusYieldUsdt:Number(r.bonus_yield_usdt||0) })) });
  } catch (error) { next(error); }
});

app.post('/api/member/transfer', async (req: Request, res: Response, next) => {
  try {
    requireDatabase();
    const { identity } = await requireFirebaseIdentity(req);
    await requireSecuritySession(req, identity.uid);
    const amount = Number(req.body?.amount);
    const recipientMemberId = String(req.body?.recipientMemberId || '').trim().toUpperCase();
    if (!recipientMemberId || !Number.isFinite(amount) || amount <= 0) return next(new ApiError(400,'TRANSFER_INVALID','validation','Transfer parameters are invalid.','Parameter transfer tidak valid.'));
    const security=await getTwoFactorSecretRecord(identity.uid);
    const otp=String(req.body?.otp2fa||'').trim();
    if(!security?.two_factor_enabled||!security.two_factor_secret_ciphertext||!security.two_factor_secret_iv||!security.two_factor_secret_auth_tag) return next(new ApiError(403,'TRANSFER_2FA_REQUIRED','authorization','Two-factor authentication must be enabled.','Aktifkan 2FA sebelum transfer.'));
    const transferSecret=decryptSensitiveString({ciphertext:security.two_factor_secret_ciphertext,iv:security.two_factor_secret_iv,authTag:security.two_factor_secret_auth_tag});
    const transferVerification=verifyServerTotp(otp,transferSecret,1);
    if(!transferVerification.valid || transferVerification.counter===undefined || !(await consumeTotpCounter(identity.uid,transferVerification.counter))) return next(new ApiError(403,'TRANSFER_2FA_INVALID','authorization','The TOTP code is invalid or already used.','Kode Google Authenticator tidak valid atau sudah digunakan.'));
    const idempotencyKey = String(req.header('Idempotency-Key') || req.body?.idempotencyKey || randomUUID()).slice(0,128);
    const result = await transferFundsAtomic({ senderFirebaseUid:identity.uid, recipientMemberId, amount, note:typeof req.body?.note==='string'?req.body.note.slice(0,200):undefined, idempotencyKey });
    if (!result.replayed) {
      await createAuditEvent({ firebaseUid:identity.uid, eventType:'wallet.transfer.completed', payload:{ transferId:result.transferId, recipientMemberId, amount, replayed:false } });
      await mirrorFinancialTransaction(identity.uid, { id:String(result.transferId), title:'Transfer ke Member', type:'outflow', status:'Completed', amount:-amount, amountFormatted:`-${amount.toFixed(6)} USDT`, counterparty:recipientMemberId });
      const recipientUser = await getUserByMemberId(recipientMemberId);
      if (recipientUser?.firebase_uid) {
        await syncFirestoreWalletReadModel(recipientUser.firebase_uid);
        await mirrorFinancialTransaction(recipientUser.firebase_uid, { id:`${result.transferId}-credit`, title:'Transfer dari Member', type:'inflow', status:'Completed', amount, amountFormatted:`+${amount.toFixed(6)} USDT`, counterparty:result.senderMemberId });
      }
    }
    await syncFirestoreWalletReadModel(identity.uid);
    res.json({ success:true, ...result, amount, fee:0, status:'Completed', timestamp:Date.now() });
  } catch (error:any) { next(error); }
});

// ==========================================
// POSTGRES-BACKED LIFETIME LICENSE ACTIVATION
// ==========================================
app.post('/api/wallet/topup-gas', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireDatabase(); const { identity }=await requireFirebaseIdentity(req); await requireSecuritySession(req, identity.uid); const amount=Number(req.body?.amount);
    if(!Number.isFinite(amount)||amount<10) return next(new ApiError(400,'GAS_TOPUP_INVALID','validation','Gas top-up amount is invalid.','Minimal alokasi gas pool adalah 10 USDT.'));
    const idempotencyKey=String(req.header('Idempotency-Key')||req.body?.idempotencyKey||randomUUID()).slice(0,128);
    const result=await topupGasAtomic({firebaseUid:identity.uid,amount,idempotencyKey});
    if (!result.replayed) {
      await createAuditEvent({firebaseUid:identity.uid,eventType:'wallet.gas_topup.completed',payload:{amount,bonusUsdt:result.bonusUsdt,referralBonusUsdt:result.referralBonusUsdt,ledgerId:result.ledgerId}});
      await syncFirestoreWalletReadModel(identity.uid);
      await mirrorFinancialTransaction(identity.uid,{id:`gas-${result.ledgerId}`,title:'Gas Fee Top-Up',type:'gas',status:'Gas Tank',amount:Number((amount+result.bonusUsdt).toFixed(6)),amountFormatted:`+${(amount+result.bonusUsdt).toFixed(6)} USDT`,network:'Internal Wallet',feeInfo:result.bonusUsdt>0?`Promo bonus +${result.bonusUsdt.toFixed(6)} USDT (Non-Cash)`:undefined});
    }
    res.json({success:true,amount,bonusUsdt:result.bonusUsdt,referralBonusUsdt:result.referralBonusUsdt,newLiquidBalance:result.newBalance,newGasReserve:result.newGasReserve,ledgerId:result.ledgerId,replayed:result.replayed});
  } catch(error){next(error);}
});

app.get('/api/wallet/profit-share', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireDatabase(); const { identity }=await requireFirebaseIdentity(req); await requireSecuritySession(req, identity.uid);
    const summary=await getProfitShareSummary(identity.uid);
    res.json({success:true,config:{activationCashPct:FINANCIAL_CONFIG.referral.activationCashPct,tradingFeeCashPct:FINANCIAL_CONFIG.referral.tradingFeeCashPct,topupGasNonCashPct:FINANCIAL_CONFIG.referral.topupGasNonCashPct},summary});
  } catch(error){next(error);}
});

app.get('/api/wallet/auto-refill', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireDatabase(); const { identity }=await requireFirebaseIdentity(req); await requireSecuritySession(req, identity.uid);
    const config=await getGasAutoRefillConfig(identity.uid);
    res.json({success:true,config:config||{enabled:FINANCIAL_CONFIG.autoRefill.defaultEnabled,thresholdUsdt:FINANCIAL_CONFIG.autoRefill.thresholdUsdt,refillUsdt:FINANCIAL_CONFIG.autoRefill.refillUsdt,maxDailyUsdt:FINANCIAL_CONFIG.autoRefill.maxDailyUsdt,dailyRefilledUsdt:0,lastRefilledAt:null}});
  } catch(error){next(error);}
});

app.post('/api/wallet/auto-refill', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireDatabase(); const { identity }=await requireFirebaseIdentity(req); await requireSecuritySession(req, identity.uid);
    const enabled=Boolean(req.body?.enabled); const thresholdUsdt=Number(req.body?.thresholdUsdt??FINANCIAL_CONFIG.autoRefill.thresholdUsdt); const refillUsdt=Number(req.body?.refillUsdt??FINANCIAL_CONFIG.autoRefill.refillUsdt); const maxDailyUsdt=Number(req.body?.maxDailyUsdt??FINANCIAL_CONFIG.autoRefill.maxDailyUsdt);
    if(!(thresholdUsdt>0)||!(refillUsdt>0)||!(maxDailyUsdt>=refillUsdt)||thresholdUsdt>maxDailyUsdt) return next(new ApiError(400,'AUTO_REFILL_CONFIG_INVALID','validation','Auto-refill configuration is invalid.','Konfigurasi auto-refill tidak valid.'));
    const config=await upsertGasAutoRefillConfig({firebaseUid:identity.uid,enabled,thresholdUsdt,refillUsdt,maxDailyUsdt});
    await createAuditEvent({firebaseUid:identity.uid,eventType:'wallet.gas_auto_refill.changed',payload:{enabled,thresholdUsdt,refillUsdt,maxDailyUsdt}});
    res.json({success:true,config});
  } catch(error){next(error);}
});

app.post('/api/wallet/process-activation', async (req: Request, res: Response, next) => {
  try {
    requireDatabase();
    const { identity } = await requireFirebaseIdentity(req);
    await requireSecuritySession(req, identity.uid);
    const tier = req.body?.tier === 'pro_12' ? 'pro_12' : req.body?.tier === 'starter_6' ? 'starter_6' : '';
    if (!tier) return next(new ApiError(400,'ACTIVATION_REQUEST_INVALID','validation','Activation tier is invalid.','Paket aktivasi tidak valid.'));
    const isPro=tier==='pro_12';
    const tierConfig = getLicenseTierConfig(isPro ? 'pro_12' : 'starter_6');
    const fee=tierConfig.promoPriceUsdt;
    const tradingBonus=tierConfig.gasBonusUsdt;
    const maxActiveBots=tierConfig.maxActiveBots;
    const licenseName=isPro?'Lisensi Lifetime Pro (12 Bot Aktif)':'Lisensi Lifetime Starter (6 Bot Aktif)';
    const idempotencyKey=String(req.get('Idempotency-Key')||req.body?.idempotencyKey||'').trim();
    if (idempotencyKey.length > 200) return next(new ApiError(400,'ACTIVATION_IDEMPOTENCY_KEY_INVALID','validation','Idempotency key is too long.','Idempotency key aktivasi terlalu panjang.'));
    const result=await activateLicenseAtomic({firebaseUid:identity.uid,tier,fee,tradingBonus,maxActiveBots,licenseName,idempotencyKey:idempotencyKey||undefined});
    if (!result.replayed) {
      await createAuditEvent({firebaseUid:identity.uid,eventType:'wallet.activation.completed',payload:{activationId:result.activationId,tier,fee,tradingBonus}});
      await mirrorFinancialTransaction(identity.uid, { id:`${result.activationId}-debit`, title:licenseName, type:'outflow', status:'Success', amount:-fee, amountFormatted:`-${fee.toFixed(2)} USDT`, network:'Internal Wallet' });
      if (result.referralSponsorFirebaseUid && result.referralBonus > 0) {
        await syncFirestoreWalletReadModel(result.referralSponsorFirebaseUid);
        await mirrorFinancialTransaction(result.referralSponsorFirebaseUid, { id:String(result.referralEventId), title:`Bonus Referral Aktivasi ${result.memberId}`, type:'inflow', status:'Success', amount:result.referralBonus, amountFormatted:`+${Number(result.referralBonus).toFixed(2)} USDT`, counterparty:result.memberId, feeInfo:'20% sponsor reward dari aktivasi lifetime' });
      }
    }
    await syncFirestoreWalletReadModel(identity.uid, { licenseStatus:'active', licenseTier:tier, licenseType:'lifetime', licenseName, maxActiveBots });
    res.json({success:true,replayed:Boolean(result.replayed),accountStatus:'active',licenseStatus:'active',memberStatus:'active',licenseTier:tier,licenseType:'lifetime',licenseName,maxActiveBots,feeDeducted:fee,tradingBonusGranted:tradingBonus,newLiquidBalance:result.newBalance,newGasReserve:result.gasReserve,activationReceipt:{activationId:result.activationId,userId:identity.uid,memberId:result.memberId,timestamp:new Date().toISOString(),licenseType:'lifetime',plan:licenseName,tradingBonusUsdt:tradingBonus,maxActiveBots,referralBonusUsdt:result.referralBonus || 0,referralEventId:result.referralEventId || null}});
  } catch(error:any){ next(error); }
});

// ==========================================
// ON-CHAIN DEPOSIT VERIFICATION API
// ==========================================
app.post('/api/wallet/verify-deposit', async (req: Request, res: Response, next) => {
  try {
    requireDatabase();
    const { identity } = await requireFirebaseIdentity(req);
    const txHash=String(req.body?.txHash||'').trim();
    const network=String(req.body?.network||'BEP-20').trim().toUpperCase();
    const requestedAmount=Number(req.body?.amount);
    if(!/^0x[a-fA-F0-9]{64}$/.test(txHash)) return next(new ApiError(400,'DEPOSIT_TX_HASH_INVALID','validation','A valid EVM transaction hash is required.','TX hash BSC/EVM tidak valid.'));
    if(!Number.isFinite(requestedAmount)||requestedAmount<10) return next(new ApiError(400,'DEPOSIT_AMOUNT_INVALID','validation','Deposit amount is invalid.','Minimal deposit adalah 10 USDT.'));
    if(network!=='BEP-20') return next(new ApiError(400,'DEPOSIT_NETWORK_UNSUPPORTED','validation','Only BEP-20 verification is enabled in this release.','Saat ini verifikasi on-chain hanya mendukung BEP-20.'));
    const rpc=process.env.BSC_RPC_URL; const destination=(process.env.GAIN_EXCHANGE_DEPOSIT_ADDRESS||'').toLowerCase(); const token=(process.env.BSC_USDT_CONTRACT||'0x55d398326f99059ff775485246999027b3197955').toLowerCase();
    if(!rpc||!destination) return next(new ApiError(503,'ONCHAIN_PROVIDER_NOT_CONFIGURED','configuration','BSC RPC and deposit address are required.','RPC BSC dan alamat deposit belum dikonfigurasi.'));
    const rpcCall=async(method:string,params:any[])=>{const r=await fetch(rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:randomUUID(),method,params})});const j:any=await r.json();if(!r.ok||j.error)throw new Error(j.error?.message||`RPC ${r.status}`);return j.result;};
    const [tx,receipt,latest]=await Promise.all([rpcCall('eth_getTransactionByHash',[txHash]),rpcCall('eth_getTransactionReceipt',[txHash]),rpcCall('eth_blockNumber',[])]);
    if(!tx||!receipt||receipt.status!=='0x1') return next(new ApiError(400,'DEPOSIT_NOT_CONFIRMED','validation','The transaction is not confirmed on-chain.','Transaksi belum confirmed di blockchain.'));
    const blockNumber=parseInt(String(receipt.blockNumber),16); const confirmations=Math.max(0,parseInt(String(latest),16)-blockNumber+1); const transferTopic='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a6d4b2b5c4';
    const matching=(receipt.logs||[]).find((log:any)=>String(log.address||'').toLowerCase()===token && String(log.topics?.[0]||'').toLowerCase()===transferTopic && String(log.topics?.[2]||'').toLowerCase().endsWith(destination.replace(/^0x/,'')));
    if(!matching) return next(new ApiError(400,'DEPOSIT_TRANSFER_NOT_FOUND','validation','No matching USDT transfer to the configured deposit address was found.','Transfer USDT ke alamat deposit tidak ditemukan.'));
    const rawAmount=BigInt(String(matching.data)); const onchainAmount=Number(rawAmount)/1e18;
    if(Math.abs(onchainAmount-requestedAmount)>Math.max(0.01,onchainAmount*0.0001)) return next(new ApiError(400,'DEPOSIT_AMOUNT_MISMATCH','validation','The submitted amount does not match the on-chain transfer.','Nominal yang dikirim tidak sesuai dengan transaksi on-chain.'));
    const minConfirmations=Number(process.env.BSC_MIN_CONFIRMATIONS||12); if(confirmations<minConfirmations) return next(new ApiError(409,'DEPOSIT_CONFIRMATIONS_PENDING','validation','The transaction needs more confirmations.','Transaksi masih menunggu konfirmasi blockchain.'));
    const credited=await recordConfirmedDeposit({firebaseUid:identity.uid,network,txHash,amount:onchainAmount,blockNumber,confirmations,destinationAddress:destination});
    if (!credited.replayed) {
      await createAuditEvent({firebaseUid:identity.uid,eventType:'wallet.deposit.credited',payload:{txHash,amount:onchainAmount,blockNumber,confirmations}});
      await mirrorFinancialTransaction(identity.uid, { id:String(credited.depositId), title:'Deposit On-Chain', type:'inflow', status:'Confirmed', amount:onchainAmount, amountFormatted:`+${onchainAmount.toFixed(6)} USDT`, network });
    }
    await syncFirestoreWalletReadModel(identity.uid);
    res.json({success:true,message:`Deposit ${onchainAmount.toFixed(2)} USDT berhasil diverifikasi on-chain.`,txHash,network,amount:onchainAmount,blockNumber,confirmations,status:credited.status,depositId:credited.depositId,verifiedAt:new Date().toISOString()});
  } catch(error){ next(error); }
});

// ==========================================
// POSTGRES-BACKED WITHDRAWAL REQUEST
// ==========================================
app.post('/api/internal/withdrawals/settle', async (req: Request, res: Response, next) => {
  try {
    requireDatabase();
    const expected=process.env.WITHDRAWAL_PROCESSOR_SECRET||''; const supplied=req.header('x-withdrawal-processor-secret')||'';
    if(!expected || supplied!==expected) return next(new ApiError(401,'PROCESSOR_UNAUTHORIZED','authorization','Withdrawal processor is not authorized.','Processor withdrawal tidak terotorisasi.'));
    const withdrawalId=String(req.body?.withdrawalId||''); const txHash=String(req.body?.txHash||'');
    if(!withdrawalId||!/^0x[a-fA-F0-9]{64}$/.test(txHash)) return next(new ApiError(400,'SETTLEMENT_INVALID','validation','Settlement parameters are invalid.','Parameter settlement tidak valid.'));
    const withdrawalRows = await dbQuery<any>(`SELECT w.id,w.network,w.destination_address,w.net_amount,w.currency,w.status FROM withdrawals w WHERE w.id=$1`, [withdrawalId]);
    const withdrawal = withdrawalRows.rows[0];
    if (!withdrawal) return next(new ApiError(404,'WITHDRAWAL_NOT_FOUND','not_found','Withdrawal was not found.','Withdrawal tidak ditemukan.'));
    if (withdrawal.network !== 'BEP-20' || withdrawal.currency !== 'USDT') return next(new ApiError(400,'SETTLEMENT_NETWORK_UNSUPPORTED','validation','Only BEP-20 USDT settlement verification is enabled.','Settlement saat ini hanya mendukung USDT BEP-20.'));
    const rpc=process.env.BSC_RPC_URL; const token=(process.env.BSC_USDT_CONTRACT||'0x55d398326f99059ff775485246999027b3197955').toLowerCase();
    if(!rpc) return next(new ApiError(503,'ONCHAIN_PROVIDER_NOT_CONFIGURED','configuration','BSC RPC is required for withdrawal settlement verification.','RPC BSC diperlukan untuk verifikasi settlement withdrawal.'));
    const rpcCall=async(method:string,params:any[])=>{const r=await fetch(rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:randomUUID(),method,params})});const j:any=await r.json();if(!r.ok||j.error)throw new Error(j.error?.message||`RPC ${r.status}`);return j.result;};
    const [tx,receipt,latest]=await Promise.all([rpcCall('eth_getTransactionByHash',[txHash]),rpcCall('eth_getTransactionReceipt',[txHash]),rpcCall('eth_blockNumber',[])]);
    if(!tx||!receipt||receipt.status!=='0x1') return next(new ApiError(409,'SETTLEMENT_NOT_CONFIRMED','validation','The withdrawal transaction is not confirmed on-chain.','Transaksi withdrawal belum confirmed di blockchain.'));
    const blockNumber=parseInt(String(receipt.blockNumber),16); const confirmations=Math.max(0,parseInt(String(latest),16)-blockNumber+1); const minConfirmations=Number(process.env.BSC_MIN_CONFIRMATIONS||12);
    if(confirmations<minConfirmations) return next(new ApiError(409,'SETTLEMENT_CONFIRMATIONS_PENDING','validation','The withdrawal transaction needs more confirmations.','Withdrawal masih menunggu konfirmasi blockchain.'));
    const transferTopic='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a6d4b2b5c4';
    const destination=String(withdrawal.destination_address).toLowerCase().replace(/^0x/,'');
    const matching=(receipt.logs||[]).find((log:any)=>String(log.address||'').toLowerCase()===token && String(log.topics?.[0]||'').toLowerCase()===transferTopic && String(log.topics?.[2]||'').toLowerCase().endsWith(destination));
    if(!matching) return next(new ApiError(400,'SETTLEMENT_TRANSFER_NOT_FOUND','validation','The confirmed transaction does not contain the expected USDT transfer.','Transaksi tidak mengandung transfer USDT ke alamat withdrawal yang sesuai.'));
    const onchainAmount=Number(BigInt(String(matching.data)))/1e18;
    if(Math.abs(onchainAmount-Number(withdrawal.net_amount))>Math.max(0.01,onchainAmount*0.0001)) return next(new ApiError(400,'SETTLEMENT_AMOUNT_MISMATCH','validation','On-chain amount does not match the withdrawal net amount.','Nominal on-chain tidak sesuai dengan net amount withdrawal.'));
    const result=await settleWithdrawal({withdrawalId,txHash,verifiedAt:new Date().toISOString(),metadata:{blockNumber,confirmations,tokenContract:token,destinationAddress:withdrawal.destination_address,onchainAmount}});
    res.json({success:true,...result});
  } catch(error){next(error);}
});

app.post('/api/internal/withdrawals/reject', async (req: Request, res: Response, next) => {
  try {
    requireDatabase();
    const expected=process.env.WITHDRAWAL_PROCESSOR_SECRET||''; const supplied=req.header('x-withdrawal-processor-secret')||'';
    if(!expected || supplied!==expected) return next(new ApiError(401,'PROCESSOR_UNAUTHORIZED','authorization','Withdrawal processor is not authorized.','Processor withdrawal tidak terotorisasi.'));
    const withdrawalId=String(req.body?.withdrawalId||''); const reason=String(req.body?.reason||'Rejected by settlement operator');
    const result=await rejectWithdrawal(withdrawalId,reason);
    res.json({success:true,...result});
  } catch(error){next(error);}
});

app.post('/api/wallet/submit-withdraw', async (req: Request, res: Response, next) => {
  try {
    requireDatabase();
    const { identity } = await requireFirebaseIdentity(req);
    await requireSecuritySession(req, identity.uid);
    const address=String(req.body?.address||'').trim(); const network=String(req.body?.network||'BEP-20').trim().toUpperCase(); const amount=Number(req.body?.amount); const otp=String(req.body?.otp2fa||'').trim();
    if(!/^0x[a-fA-F0-9]{40}$/.test(address)) return next(new ApiError(400,'WITHDRAW_ADDRESS_INVALID','validation','Withdrawal address is invalid.','Alamat BEP-20 tidak valid.'));
    if(!Number.isFinite(amount)||amount<10) return next(new ApiError(400,'WITHDRAW_AMOUNT_INVALID','validation','Withdrawal amount is invalid.','Minimal penarikan adalah 10 USDT.'));
    const security=await getTwoFactorSecretRecord(identity.uid); if(!security?.two_factor_enabled||!security.two_factor_secret_ciphertext||!security.two_factor_secret_iv||!security.two_factor_secret_auth_tag) return next(new ApiError(403,'WITHDRAW_2FA_REQUIRED','authorization','Two-factor authentication must be enabled.','Aktifkan 2FA sebelum withdrawal.'));
    const secret=decryptSensitiveString({ciphertext:security.two_factor_secret_ciphertext,iv:security.two_factor_secret_iv,authTag:security.two_factor_secret_auth_tag}); const verification=verifyServerTotp(otp,secret,1); if(!verification.valid || verification.counter===undefined || !(await consumeTotpCounter(identity.uid,verification.counter))) return next(new ApiError(403,'WITHDRAW_2FA_INVALID','authorization','The TOTP code is invalid or already used.','Kode Google Authenticator tidak valid atau sudah digunakan.'));
    const fee=2; const idempotencyKey=String(req.header('Idempotency-Key')||req.body?.idempotencyKey||randomUUID()).slice(0,128); const result=await createWithdrawalRequest({firebaseUid:identity.uid,address,amount,fee,network,idempotencyKey});
    if (!result.replayed) {
      await createAuditEvent({firebaseUid:identity.uid,eventType:'wallet.withdrawal.requested',payload:{withdrawalId:result.id,amount,network}});
      await mirrorFinancialTransaction(identity.uid, { id:String(result.id), title:'Withdrawal Request', type:'outflow', status:'Review', amount:-amount, amountFormatted:`-${amount.toFixed(6)} USDT`, network });
    }
    await syncFirestoreWalletReadModel(identity.uid);
    res.json({success:true,message:'Withdrawal masuk tahap review settlement.',queueId:result.id,amount,fee,netAmount:result.netAmount,network,status:result.status,estimatedMinutes:10,timestamp:Date.now(),replayed:result.replayed});
  } catch(error){ next(error); }
});

// ==========================================
// FIRESTORE-BACKED LIFETIME LICENSE ACTIVATION
// ==========================================
// ==========================================
// BACKGROUND AUTOMATED BOT EXECUTION ENGINE
// Runs continuously in Node.js independently of browser state
// ==========================================
interface ActiveBotRunner {
  id: string;
  uid: string;
  botId: string;
  mode: 'testnet' | 'live';
  botName?: string;
  pair: string;
  pairedCoins?: string[];
  botMode: 'Avarage Only' | 'Grid Only' | 'Avarage+Grid';
  baseAmount: number;
  baseTp: number; // e.g. 1.5%
  useMoneyManagement: boolean;
  averagingLayers: number; // up to 20
  gridLayers?: number; // up to 100
  averageDownPct: number; // e.g. 2.0%
  uptrendFilter?: boolean;
  tpCallbackPct?: number;
  layerCallbackPct?: number;
  gridTp?: number;
  minPrice?: number;
  maxPrice?: number;
  priceBoundaryStatus?: 'IN_RANGE' | 'ABOVE_MAX' | 'BELOW_MIN';
  stepLayer: number;
  entryPrice: number;
  positionQty: number;
  positionVersion: number;
  closedLayerIds?: string[];
  avgEntryPrice: number;
  realizedPnlToday: number;
  pnlDate: string;
  peakPrice?: number;
  troughPrice?: number;
  lastEvaluatedPrice: number;
  status: 'active' | 'paused' | 'error';
  failureStreak: number;
  priceFailureStreak: number;
  lastErrorReason?: string;
  orderSequence: number;
  lastReconciledAt?: number;
  resumeAfterReconciliation?: boolean;
  pendingOrder?: {
    clientOrderId: string;
    side: 'buy' | 'sell';
    requestedQty: number;
    createdAt: number;
    status: 'submitting' | 'reconciling' | 'unknown' | 'filled';
    filledQty?: number;
    fillPrice?: number;
    orderId?: string;
  };
  exchange: string;
  isSandbox: boolean;
  timeframe: '3m' | '5m' | '10m' | '15m' | '30m' | '1h';
  lastStrategyCandleTimestamp?: number;
  lastStrategySignalPrice?: number;
  dcaLayers?: DcaLayer[];
  gridLevels?: GridLevel[];
  committedCapitalUsd?: number;
}

interface BotEngineLog {
  id: string;
  uid: string;
  timestamp: number;
  pair: string;
  botId?: string;
  botName?: string;
  action: 'AVERAGING_ORDER' | 'TAKE_PROFIT' | 'MONITOR_TICK' | 'GRID_TP' | 'ORDER_ERROR' | 'RUNNER_ERROR' | 'RECONCILIATION';
  details: string;
  price: number;
  stepLayer: number;
}

const activeBotsRegistry = new Map<string, ActiveBotRunner>();
const userBotOrderTimestamps = new Map<string, number[]>();
const botEngineLogs: BotEngineLog[] = [];
const SERVER_INSTANCE_ID = randomUUID();
let isEngineRunning = true;
let persistenceReady = false;
let persistenceFailureCode: string | undefined;
let databaseReady = false;
let databaseFailureCode: string | undefined;
let shutdownRequested = false;
let workerLoopTask: Promise<void> | undefined;
let financialWorkerInterval: ReturnType<typeof setInterval> | undefined;
let httpServer: ReturnType<typeof app.listen> | undefined;
let viteServer: Awaited<ReturnType<typeof createViteServer>> | undefined;

function botRunnerDocument(uid: string, runnerId: string) {
  return firebaseAdminFirestore.collection('users').doc(uid).collection('botRunners').doc(runnerId);
}


type BotLifecycleReason =
  | 'USER_REQUEST'
  | 'USER_PAUSE_ALL'
  | 'EXCHANGE_DISCONNECTED'
  | 'KILL_SWITCH'
  | 'GLOBAL_LIVE_TRADING_KILL_SWITCH'
  | 'BOT_DELETED'
  | 'RISK_DAILY_LOSS_LIMIT'
  | 'FRESH_PRICE_UNAVAILABLE'
  | 'STARTUP_RECONCILIATION_PENDING'
  | 'ORDER_STATUS_UNCERTAIN'
  | 'EXCHANGE_TRANSIENT_FAILURE'
  | 'EXCHANGE_ORDER_REJECTED'
  | 'EXCHANGE_CREDENTIAL_REPLACED'
  | 'OTHER';

async function transitionBotLifecycle(
  bot: ActiveBotRunner,
  nextStatus: ActiveBotRunner['status'],
  reason: BotLifecycleReason,
): Promise<void> {
  const previousStatus = bot.status;
  const previousFailureStreak = bot.failureStreak;
  const previousPriceFailureStreak = bot.priceFailureStreak;
  const previousLastErrorReason = bot.lastErrorReason;
  const previousResumeAfterReconciliation = bot.resumeAfterReconciliation;

  const runtimeStatus =
    nextStatus === 'error'
      ? 'ERROR'
      : nextStatus === 'active'
        ? 'ACTIVE'
        : 'STANDBY';

  // PostgreSQL must agree before mutating the in-memory runner state.
  await updateBotRuntimeStatus({
    firebaseUid: bot.uid,
    externalBotId: bot.id,
    status: runtimeStatus,
  });

  bot.status = nextStatus;

  if (nextStatus === 'active') {
    bot.failureStreak = 0;
    bot.priceFailureStreak = 0;
    bot.lastErrorReason = undefined;
    bot.resumeAfterReconciliation = false;
  } else {
    bot.lastErrorReason = reason;
  }

  try {
    await persistBotRunner(bot);
  } catch (error) {
    // Compensate both stores. A PostgreSQL-first transition must never leave
    // the worker with Firestore=ACTIVE while PostgreSQL=STANDBY (or vice versa).
    bot.status = previousStatus;
    bot.failureStreak = previousFailureStreak;
    bot.priceFailureStreak = previousPriceFailureStreak;
    bot.lastErrorReason = previousLastErrorReason;
    bot.resumeAfterReconciliation = previousResumeAfterReconciliation;

    let firestoreRestored = false;
    let postgresRestored = false;
    try {
      await persistBotRunner(bot);
      firestoreRestored = true;
    } catch (restoreError) {
      console.error('[BOT_LIFECYCLE_FIRESTORE_ROLLBACK_FAILED]', {
        uid: bot.uid,
        runnerId: bot.id,
        error: String((restoreError as any)?.message || restoreError),
      });
    }
    try {
      await updateBotRuntimeStatus({
        firebaseUid: bot.uid,
        externalBotId: bot.id,
        status: previousStatus === 'error' ? 'ERROR' : previousStatus === 'active' ? 'ACTIVE' : 'STANDBY',
      });
      postgresRestored = true;
    } catch (restoreError) {
      console.error('[BOT_LIFECYCLE_POSTGRES_ROLLBACK_FAILED]', {
        uid: bot.uid,
        runnerId: bot.id,
        error: String((restoreError as any)?.message || restoreError),
      });
    }

    if (!firestoreRestored || !postgresRestored) {
      throw new Error('BOT_LIFECYCLE_COMPENSATION_FAILED');
    }
    throw error;
  }

  logBotExecutionEvent(bot, 'bot.lifecycle.transition', {
    previousStatus,
    status: nextStatus,
    reason,
  });
}

async function persistBotRunner(bot: ActiveBotRunner): Promise<void> {
  const updatedAt = Date.now();
  const state = JSON.parse(JSON.stringify({ ...bot, updatedAt }));
  await botRunnerDocument(bot.uid, bot.id).set(state);
  await firebaseAdminFirestore.collection('users').doc(bot.uid).collection('positions').doc(bot.id).set({
    id: bot.id, userId: bot.uid, memberId: '', pair: bot.pair, symbol: bot.pair, exchange: bot.exchange,
    status: bot.status === 'active' ? 'active' : 'inactive', statusLabel: bot.status.toUpperCase(),
    positionQty: bot.positionQty, positionVersion: bot.positionVersion, avgEntryPrice: bot.avgEntryPrice, realizedPnlToday: bot.realizedPnlToday,
    entryPrice: bot.entryPrice, lastPrice: bot.lastEvaluatedPrice, maxLayers: bot.averagingLayers,
    botId: bot.botId, botName: bot.botName, closedLayerIds: bot.closedLayerIds || [], updatedAt, source: 'backend_bot_runtime'
  }, { merge: true });
}

async function deletePersistedBotRunner(uid: string, runnerId: string): Promise<void> {
  await botRunnerDocument(uid, runnerId).delete();
  await firebaseAdminFirestore.collection('users').doc(uid).collection('positions').doc(runnerId).delete();
}

async function persistBotLog(log: BotEngineLog): Promise<void> {
  const safeLog = JSON.parse(JSON.stringify(log));
  await firebaseAdminFirestore.collection('users').doc(log.uid).collection('botLogs').doc(log.id).set(safeLog);
}

function botLeaseDocument(uid: string, runnerId: string) {
  return firebaseAdminFirestore.collection('users').doc(uid).collection('botLocks').doc(runnerId);
}

async function acquireBotLease(bot: ActiveBotRunner): Promise<boolean> {
  const leaseRef = botLeaseDocument(bot.uid, bot.id);
  const runnerRef = botRunnerDocument(bot.uid, bot.id);
  const now = Date.now();
  const result = await firebaseAdminFirestore.runTransaction(async (transaction) => {
    const [leaseSnapshot, runnerSnapshot] = await Promise.all([
      transaction.get(leaseRef),
      transaction.get(runnerRef),
    ]);
    if (!runnerSnapshot.exists) return { acquired: false };
    const storedState = runnerSnapshot.data() as Partial<ActiveBotRunner>;
    if (storedState.status !== 'active' && storedState.resumeAfterReconciliation !== true) return { acquired: false };
    const lease = leaseSnapshot.data();
    if (lease?.owner !== SERVER_INSTANCE_ID && Number(lease?.expiresAt || 0) > now) return { acquired: false };
    transaction.set(leaseRef, { owner: SERVER_INSTANCE_ID, expiresAt: now + 90_000, updatedAt: now });
    return { acquired: true, storedState };
  });
  if (result.acquired && result.storedState) Object.assign(bot, result.storedState);
  return result.acquired;
}

async function acquireBotLeaseForManualClose(bot: ActiveBotRunner): Promise<boolean> {
  const leaseRef = botLeaseDocument(bot.uid, bot.id);
  const runnerRef = botRunnerDocument(bot.uid, bot.id);
  const now = Date.now();
  const result = await firebaseAdminFirestore.runTransaction(async (transaction) => {
    const [leaseSnapshot, runnerSnapshot] = await Promise.all([
      transaction.get(leaseRef),
      transaction.get(runnerRef),
    ]);
    if (!runnerSnapshot.exists) return { acquired: false };
    const storedState = runnerSnapshot.data() as Partial<ActiveBotRunner>;
    if (Number(storedState.positionQty || 0) <= 0) return { acquired: false };
    const lease = leaseSnapshot.data();
    if (lease?.owner !== SERVER_INSTANCE_ID && Number(lease?.expiresAt || 0) > now) return { acquired: false };
    transaction.set(leaseRef, { owner: SERVER_INSTANCE_ID, expiresAt: now + 90_000, updatedAt: now });
    return { acquired: true, storedState };
  });
  if (result.acquired && result.storedState) Object.assign(bot, result.storedState);
  return result.acquired;
}

async function releaseBotLease(bot: ActiveBotRunner): Promise<void> {
  await firebaseAdminFirestore.runTransaction(async (transaction) => {
    const leaseRef = botLeaseDocument(bot.uid, bot.id);
    const snapshot = await transaction.get(leaseRef);
    if (snapshot.data()?.owner === SERVER_INSTANCE_ID) {
      transaction.set(leaseRef, { owner: SERVER_INSTANCE_ID, expiresAt: 0, updatedAt: Date.now() });
    }
  });
}

async function assertBotLeaseActive(bot: ActiveBotRunner, allowManualClose = false): Promise<void> {
  await firebaseAdminFirestore.runTransaction(async (transaction) => {
    const runnerRef = botRunnerDocument(bot.uid, bot.id);
    const leaseRef = botLeaseDocument(bot.uid, bot.id);
    const [runnerSnapshot, leaseSnapshot] = await Promise.all([
      transaction.get(runnerRef),
      transaction.get(leaseRef),
    ]);
    const lease = leaseSnapshot.data();
    const runnerStatus = String(runnerSnapshot.data()?.status || '');
    const statusAllowed = runnerStatus === 'active' || (allowManualClose && ['paused', 'error'].includes(runnerStatus));
    if (!runnerSnapshot.exists || !statusAllowed
      || lease?.owner !== SERVER_INSTANCE_ID || Number(lease?.expiresAt || 0) <= Date.now()) {
      throw new BotExecutionFailure('BOT_RUNNER_NOT_LEASED', false);
    }
  });
}

function logBotExecutionEvent(
  bot: ActiveBotRunner,
  event: string,
  attributes: Record<string, string | number | boolean> = {}
): void {
  console.info(JSON.stringify({
    level: 'info',
    event,
    uid: bot.uid,
    botId: bot.botId,
    runnerId: bot.id,
    correlationId: randomUUID(),
    ...attributes,
  }));
}

async function recordBotFailure(bot: ActiveBotRunner, error: unknown, action: 'ORDER_ERROR' | 'RUNNER_ERROR' | 'RECONCILIATION' = 'ORDER_ERROR'): Promise<void> {
  const failure = classifyBotExecutionError(error);
  const nextState = getRunnerFailureState(error, bot.failureStreak, BOT_FAILURE_PAUSE_THRESHOLD);
  if (action === 'ORDER_ERROR') botExecutionMetrics.failedOrders += 1;
  console.warn(JSON.stringify({
    level: 'warn',
    event: 'bot.runner.failure',
    uid: bot.uid,
    botId: bot.botId,
    runnerId: bot.id,
    correlationId: randomUUID(),
    reasonCode: failure.reasonCode,
    retryable: failure.retryable,
  }));
  bot.failureStreak = nextState.failureStreak;
  bot.lastErrorReason = nextState.reasonCode;
  if (bot.pendingOrder?.status === 'submitting') {
    bot.pendingOrder = { ...bot.pendingOrder, status: 'unknown' as const };
  }
  const uncertainClientOrderId = bot.pendingOrder?.status === 'unknown' ? bot.pendingOrder.clientOrderId : undefined;
  bot.status = nextState.status;
  botEngineLogs.unshift({
    id: `log-error-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
    uid: bot.uid,
    timestamp: Date.now(),
    pair: bot.pair,
    botId: bot.id,
    botName: bot.botName,
    action,
    details: `Runner failure ${failure.reasonCode}; current status ${bot.status}.`,
    price: bot.lastEvaluatedPrice,
    stepLayer: bot.stepLayer,
  });
  if (botEngineLogs.length > 50) botEngineLogs.pop();
  await persistBotRunner(bot);
  if (uncertainClientOrderId) {
    await firebaseAdminFirestore.collection('users').doc(bot.uid).collection('botOrders').doc(uncertainClientOrderId).set({ status: 'unknown', recoveryRequired: true, updatedAt: Date.now() }, { merge: true }).catch(() => {});
  }

  try {
    await updateBotRuntimeStatus({
      firebaseUid: bot.uid,
      externalBotId: bot.id,
      status:
        bot.status === 'error'
          ? 'ERROR'
          : bot.status === 'active'
            ? 'ACTIVE'
            : 'STANDBY',
    });
  } catch (statusSyncError) {
    console.error('[BOT_RUNTIME_STATUS_SYNC_FAILED]', {
      uid: bot.uid,
      runnerId: bot.id,
      runtimeStatus: bot.status,
      code: (statusSyncError as any)?.code || 'BOT_RUNTIME_STATUS_SYNC_FAILED',
      message: String((statusSyncError as any)?.message || statusSyncError),
    });
  }

  await persistBotLog(botEngineLogs[0]);
}

async function restoreBotRunners(): Promise<void> {
  if (!FIREBASE_ADMIN_CREDENTIALS_CONFIGURED) {
    throw Object.assign(new Error('Firebase Admin ADC is not configured.'), {
      code: 'FIREBASE_ADMIN_CREDENTIALS_NOT_CONFIGURED',
    });
  }
  const snapshot = await firebaseAdminFirestore.collectionGroup('botRunners').get();
  for (const document of snapshot.docs) {
    const uid = document.ref.parent.parent?.id;
    const stored = document.data() as Partial<ActiveBotRunner>;
    if (!uid || stored.uid !== uid || stored.id !== document.id || typeof stored.botId !== 'string') continue;
    if (!['testnet', 'live'].includes(String(stored.mode)) || !['active', 'paused', 'error'].includes(String(stored.status))) continue;
    if (typeof stored.pair !== 'string' || !/^[A-Z0-9]{2,20}\/USDT$/.test(stored.pair)) continue;
    if (!Number.isFinite(stored.entryPrice) || Number(stored.entryPrice) <= 0) continue;

    const bot = stored as ActiveBotRunner;
    // Existing runners created before MM became explicit retain the safe default ON.
    bot.useMoneyManagement = stored.useMoneyManagement !== false;

    bot.positionQty = Number(bot.positionQty) || 0;
    bot.positionVersion = Number((bot as any).positionVersion) || 0;
    bot.avgEntryPrice = Number(bot.avgEntryPrice) || 0;
    bot.realizedPnlToday = Number(bot.realizedPnlToday) || 0;
    bot.failureStreak = Number(bot.failureStreak) || 0;
    bot.priceFailureStreak = Number(bot.priceFailureStreak) || 0;
    bot.orderSequence = Number(bot.orderSequence) || 0;
    bot.timeframe = (['3m', '5m', '10m', '15m', '30m', '1h'].includes(String(bot.timeframe)) ? String(bot.timeframe) : '5m') as ActiveBotRunner['timeframe'];
    bot.lastStrategyCandleTimestamp = Number(bot.lastStrategyCandleTimestamp) || undefined;
    bot.lastStrategySignalPrice = Number(bot.lastStrategySignalPrice) || undefined;
    const wasActive = bot.status === 'active';

    console.info('[BOT_RESTORE_STATE]', {
      uid: bot.uid,
      runnerId: bot.id,
      botId: bot.botId,
      pair: bot.pair,
      mode: bot.mode,
      storedStatus: bot.status,
      wasActive,
      resumeAfterReconciliation: bot.resumeAfterReconciliation === true,
      lastErrorReason: bot.lastErrorReason,
      hasPendingOrder: Boolean(bot.pendingOrder),
      pendingOrderStatus: bot.pendingOrder?.status,
      positionQty: bot.positionQty,
      avgEntryPrice: bot.avgEntryPrice,
    });

    if (bot.pendingOrder?.status === 'filled'
      && Number.isFinite(bot.pendingOrder.filledQty)
      && Number(bot.pendingOrder.filledQty) > 0
      && Number.isFinite(bot.pendingOrder.fillPrice)
      && Number(bot.pendingOrder.fillPrice) > 0) {
      const pending = bot.pendingOrder;
      const filledQty = Number(pending.filledQty);
      const fillPrice = Number(pending.fillPrice);
      const recoveredPosition = applyRecoveredFill({
        quantity: bot.positionQty,
        averageEntryPrice: bot.avgEntryPrice,
        realizedPnl: bot.realizedPnlToday,
      }, { side: pending.side, filledQty, fillPrice });
      bot.positionQty = recoveredPosition.quantity;
          bot.positionVersion = Number((bot as any).positionVersion || 0) + 1;
      bot.avgEntryPrice = recoveredPosition.averageEntryPrice;
      bot.realizedPnlToday = recoveredPosition.realizedPnl;
      if (pending.side === 'buy') {
        bot.stepLayer += 1;
      } else {
        if (bot.positionQty <= 1e-12) {
          bot.positionQty = 0;
          bot.avgEntryPrice = 0;
          bot.stepLayer = 1;
          bot.entryPrice = fillPrice;
        }
      }
      bot.pendingOrder = undefined;
    } else if (bot.pendingOrder) {
      bot.status = 'paused';
      bot.lastErrorReason = 'ORDER_STATUS_UNCERTAIN';
      bot.resumeAfterReconciliation = false;
    }

    if ((bot.mode === 'testnet' || bot.mode === 'live') && wasActive && !bot.pendingOrder) {
      // Never let a previously-active bot resume trading merely because the
      // Node process restarted. Startup always enters a paused reconciliation
      // gate; an explicit user resume is required unless a deployment has
      // deliberately opted into auto-resume with the two-part safety switch.
      bot.status = 'paused';
      bot.resumeAfterReconciliation = true;
      bot.lastErrorReason = 'STARTUP_RECONCILIATION_PENDING';
    }
    // Persist the final lifecycle state after startup recovery has
    // determined whether this runner is active, paused, or errored.
    try {
      await upsertBotRuntime({
        firebaseUid: uid,
        externalBotId: bot.id,
        name: bot.botName || bot.pair,
        exchange: bot.exchange,
        symbol: bot.pair,
        strategyType: bot.botMode,
        status: bot.status === 'error' ? 'ERROR' : bot.status === 'active' ? 'ACTIVE' : 'STANDBY',
        mode: bot.mode,
        config: {
          baseAmount: bot.baseAmount,
          baseTp: bot.baseTp,
          useMoneyManagement: bot.useMoneyManagement,
          tpCallbackPct: bot.tpCallbackPct,
          averageDownPct: bot.averageDownPct,
          maxLayers: Math.max(Number(bot.averagingLayers) || 0, Number(bot.gridLayers) || 0),
          maxCapitalUsd: bot.committedCapitalUsd || 0,
          minPrice: bot.minPrice,
          maxPrice: bot.maxPrice,
          timeframe: bot.timeframe,
          lastStrategyCandleTimestamp: bot.lastStrategyCandleTimestamp,
        },
      });
    } catch (error) {
      console.warn('[BOT_RECOVERY_DB_FINAL_STATE_FAILED]', {
        uid,
        runnerId: bot.id,
        exchange: bot.exchange,
        pair: bot.pair,
        status: bot.status,
        code: (error as any)?.code || 'BOT_DB_FINAL_STATE_FAILED',
        message: String((error as any)?.message || error),
      });

      // Never admit a runner whose final lifecycle state cannot be
      // represented in PostgreSQL.
      continue;
    }

    activeBotsRegistry.set(botRegistryKey(uid, bot.id), bot);
    if (GAIN_V2_ENABLED && bot.status === 'active' && (bot.mode === 'testnet' || bot.mode === 'live')) {
      try {
        v2WebSocketManager.connect(
          bot.exchange.toLowerCase(),
          bot.pair,
          bot.isSandbox
        );
      } catch {
        /* feed reconnects asynchronously */
      }
    }
    await persistBotRunner(bot);
  }
}

function validateBotOrderRisk(bot: ActiveBotRunner, side: 'buy' | 'sell', quantity: number, price: number): void {
  const notional = quantity * price;
  if (!Number.isFinite(notional) || notional <= 0) {
    throw new BotExecutionFailure('RISK_INVALID_ORDER_NOTIONAL', false);
  }
  // MM OFF means the user has explicitly opted out of GAIN's fixed capital
  // sizing ceiling. Do not silently re-introduce the same $50 cap here.
  // Exchange-native amount/cost filters are still enforced immediately after
  // this function, so the exchange remains the final execution boundary.
  if (bot.useMoneyManagement !== false && notional > MAX_BOT_ORDER_USDT) {
    throw new BotExecutionFailure('RISK_MAX_ORDER_USDT', false);
  }
  const now = Date.now();
  const recentOrders = (userBotOrderTimestamps.get(bot.uid) || []).filter((timestamp) => now - timestamp < 60_000);
  userBotOrderTimestamps.set(bot.uid, recentOrders);
  if (recentOrders.length >= MAX_USER_ORDERS_PER_MINUTE) {
    throw new BotExecutionFailure('RISK_USER_ORDER_RATE_LIMIT', false);
  }
  if (side !== 'buy') return;

  const currentBotExposure = bot.positionQty * (bot.avgEntryPrice || bot.lastEvaluatedPrice);
  if (bot.useMoneyManagement !== false) {
    if (currentBotExposure + notional > MAX_BOT_EXPOSURE_USDT) {
      throw new BotExecutionFailure('RISK_MAX_BOT_EXPOSURE_USDT', false);
    }
    const userExposure = Array.from(activeBotsRegistry.values())
      .filter((candidate) => candidate.uid === bot.uid)
      .reduce((total, candidate) => total + candidate.positionQty * (candidate.avgEntryPrice || candidate.lastEvaluatedPrice), 0);
    if (userExposure + notional > MAX_USER_EXPOSURE_USDT) {
      throw new BotExecutionFailure('RISK_MAX_USER_EXPOSURE_USDT', false);
    }
  }
}

function recordConfirmedBotOrder(uid: string): void {
  botExecutionMetrics.confirmedOrders += 1;
  const now = Date.now();
  const recentOrders = (userBotOrderTimestamps.get(uid) || []).filter((timestamp) => now - timestamp < 60_000);
  recentOrders.push(now);
  userBotOrderTimestamps.set(uid, recentOrders);
}

function applyBotRealizedPnl(
  bot: ActiveBotRunner,
  soldQty: number,
  fillPrice: number,
): ActiveBotRunner[] {
  const today = new Date().toISOString().slice(0, 10);
  if (bot.pnlDate !== today) {
    bot.pnlDate = today;
    bot.realizedPnlToday = 0;
  }
  bot.realizedPnlToday += (fillPrice - bot.avgEntryPrice) * soldQty;

  const userDailyPnl = Array.from(activeBotsRegistry.values())
    .filter((candidate) => candidate.uid === bot.uid && candidate.pnlDate === today)
    .reduce((total, candidate) => total + candidate.realizedPnlToday, 0);

  if (userDailyPnl > -MAX_USER_DAILY_LOSS_USDT) {
    return [];
  }

  const pausedBots: ActiveBotRunner[] = [];

  for (const candidate of activeBotsRegistry.values()) {
    if (candidate.uid === bot.uid && candidate.status === 'active') {
      candidate.status = 'paused';
      candidate.lastErrorReason = 'RISK_DAILY_LOSS_LIMIT';
      pausedBots.push(candidate);
    }
  }

  return pausedBots;
}

function assessRegisteredBotRisk(input: {
  botMode: 'Avarage Only' | 'Grid Only' | 'Avarage+Grid';
  averagingLayers: number;
  gridLayers: number;
  baseAmount: number;
  baseTp: number;
  averageDownPct: number;
  gridProfitPct: number;
  tpCallbackPct: number;
  layerCallbackPct: number;
  pairedCoinsCount: number;
  currentUserExposureUsdt: number;
  useMoneyManagement: boolean;
}) {
  const dcaLayers = generateDcaLayers({
    baseOrderUsd: input.baseAmount,
    stepDeviationPct: input.averageDownPct,
    stepScale: 1.25,
    volumeMultiplier: 1.3,
    maxLayers: Math.max(1, input.averagingLayers),
    maxCapitalUsd: input.useMoneyManagement ? Math.min(V2_MAX_COMMITTED_CAPITAL_USDT, MAX_BOT_EXPOSURE_USDT) : Number.POSITIVE_INFINITY,
    takeProfitPct: input.baseTp,
    trailingTpPct: input.tpCallbackPct,
    callbackPct: input.layerCallbackPct,
  });
  const dcaCapital = input.botMode === 'Grid Only' ? 0 : dcaLayers.reduce((sum, layer) => sum + layer.amountUsd, 0);
  const gridCapital = input.botMode === 'Avarage Only' ? 0 : Math.max(0, input.gridLayers) * input.baseAmount;
  const steps = [
    ...Array.from({ length: input.botMode === 'Grid Only' ? 0 : input.averagingLayers }, (_, index) => ({ amountUsdt: dcaLayers[index]?.amountUsd ?? input.baseAmount, dropPct: input.averageDownPct })),
    ...Array.from({ length: input.botMode === 'Avarage Only' ? 0 : input.gridLayers }, () => ({ amountUsdt: input.baseAmount, dropPct: 0 })),
  ];
  return assessStrategyRisk({
    botMode: input.botMode,
    averagingLayers: input.averagingLayers,
    gridLayers: input.gridLayers,
    baseAmount: input.baseAmount,
    baseTp: input.baseTp,
    averageDownPct: input.averageDownPct,
    gridProfitPct: input.gridProfitPct,
    tpCallbackPct: input.tpCallbackPct,
    layerCallbackPct: input.layerCallbackPct,
    pairedCoinsCount: input.pairedCoinsCount,
    availableBalanceUsdt: Number.POSITIVE_INFINITY,
    useMoneyManagement: input.useMoneyManagement,
    steps,
    currentUserExposureUsdt: input.currentUserExposureUsdt,
  });
}

const CoinPairSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,20}\/USDT$/);
const BotRegisterSchema = z.object({
  botId: z.string().trim().regex(/^[a-zA-Z0-9_-]{1,128}$/).optional(),
  botName: z.string().trim().max(100).optional(),
  pair: CoinPairSchema.default('BTC/USDT'),
  pairedCoins: z.array(CoinPairSchema).min(1).max(20).optional(),
  botMode: z.enum(['Avarage Only', 'Grid Only', 'Avarage+Grid']).default('Avarage Only'),
  baseAmount: z.coerce.number().min(1).max(MAX_BOT_ORDER_USDT).default(Math.min(35, MAX_BOT_ORDER_USDT)),
  baseTp: z.coerce.number().min(0.1).max(50).default(1.5),
  useMoneyManagement: z.boolean().default(true),
  averagingLayers: z.coerce.number().int().min(0).max(20).default(1),
  gridLayers: z.coerce.number().int().min(0).max(100).default(5),
  averageDownPct: z.coerce.number().min(0.1).max(50).default(2),
  uptrendFilter: z.boolean().default(true),
  tpCallbackPct: z.coerce.number().min(0.01).max(10).default(0.2),
  layerCallbackPct: z.coerce.number().min(0.01).max(10).default(0.2),
  gridTp: z.coerce.number().min(0.1).max(50).default(1.2),
  minPrice: z.coerce.number().min(0).optional().default(0),
  maxPrice: z.coerce.number().min(0).optional().default(0),
  entryPrice: z.coerce.number().positive().optional(),
  timeframe: z.enum(['3m', '5m', '10m', '15m', '30m', '1h']).default('5m'),
  exchange: z.string().trim().toUpperCase().pipe(z.enum(['BINANCE', 'BITGET', 'OKX'])).default('BINANCE'),
  mode: z.enum(['testnet', 'live']).default('testnet'),
  isSandbox: z.boolean().default(true),
}).refine((value) => !value.pairedCoins || new Set(value.pairedCoins).size === value.pairedCoins.length, {
  message: 'pairedCoins must not contain duplicates',
});
const BotCredentialSchema = z.object({
  exchange: z.string().trim().toLowerCase(),
  apiKey: z.string().trim().min(8).max(512),
  secret: z.string().trim().min(8).max(512),
  password: z.string().max(512).optional(),
  isSandbox: z.boolean().default(true),
});

// Exchange credentials are persisted in PostgreSQL encrypted at rest; Firestore is never a credential store.
function getBotCredentialEncryptionKey(): Buffer {
  const configuredKey = process.env.ENCRYPTION_MASTER_KEY || '';
  const key = Buffer.from(configuredKey, 'utf8');
  if (key.length !== 32) {
    throw new ApiError(503, 'CREDENTIAL_ENCRYPTION_NOT_CONFIGURED', 'configuration', 'A 32-byte credential encryption key is required.', 'Penyimpanan kredensial bot belum dikonfigurasi oleh administrator.');
  }
  return key;
}

function encryptBotCredential(credential: z.infer<typeof BotCredentialSchema>) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getBotCredentialEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(credential), 'utf8'),
    cipher.final(),
  ]);
  return {
    version: 1,
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    updatedAt: Date.now(),
  };
}

function decryptBotCredential(record: { iv: string; authTag: string; ciphertext: string }): z.infer<typeof BotCredentialSchema> {
  const decipher = createDecipheriv('aes-256-gcm', getBotCredentialEncryptionKey(), Buffer.from(record.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(record.authTag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  return BotCredentialSchema.parse(JSON.parse(plaintext));
}

async function loadBotCredential(uid: string, exchange: string): Promise<z.infer<typeof BotCredentialSchema> | null> {
  const record = await getExchangeCredential(uid, exchange.toLowerCase());
  if (!record) return null;
  return decryptBotCredential({ iv: record.iv, authTag: record.auth_tag, ciphertext: record.ciphertext });
}

async function cancelBotOpenOrders(uid: string, bots: ActiveBotRunner[]): Promise<{ cancelled: number; failures: number }> {
  const targets = new Map<string, ActiveBotRunner[]>();
  for (const bot of bots) {
    if (bot.mode !== 'testnet' && bot.mode !== 'live') continue;
    const key = `${bot.exchange}:${bot.pair}`;
    targets.set(key, [...(targets.get(key) || []), bot]);
  }

  let cancelled = 0;
  let failures = 0;
  for (const groupedBots of targets.values()) {
    const [firstBot] = groupedBots;
    const pendingClientOrderIds = new Set(groupedBots
      .map((bot) => bot.pendingOrder?.status && bot.pendingOrder.status !== 'filled' ? bot.pendingOrder.clientOrderId : '')
      .filter(Boolean));
    try {
      const credential = await loadBotCredential(uid, firstBot.exchange);
      if (!credential) {
        failures += 1;
        continue;
      }
      const client = createExchangeInstance(firstBot.exchange, {
        apiKey: credential.apiKey,
        secret: credential.secret,
        password: credential.password,
        isSandbox: credential.isSandbox,
      });
      const openOrders = await withTimeout(client.fetchOpenOrders(firstBot.pair), EXCHANGE_TIMEOUT_MS, 'cancel_open_orders_timeout') as Array<{
        id?: string;
        clientOrderId?: string;
        clientOrderID?: string;
        info?: { clientOrderId?: string; origClientOrderId?: string };
      }>;
      for (const order of openOrders) {
        const clientOrderId = String(order.clientOrderId || order.clientOrderID || order.info?.clientOrderId || order.info?.origClientOrderId || '');
        if (!order.id || !pendingClientOrderIds.has(clientOrderId)) continue;
        await withTimeout(client.cancelOrder(order.id, firstBot.pair), EXCHANGE_TIMEOUT_MS, 'cancel_order_timeout');
        pendingClientOrderIds.delete(clientOrderId);
        cancelled += 1;
      }
      failures += pendingClientOrderIds.size;
    } catch {
      failures += 1;
    }
  }
  return { cancelled, failures };
}

async function executeBotMarketOrder(
  bot: ActiveBotRunner,
  side: 'buy' | 'sell',
  requestedQty: number,
  referencePrice: number,
  priceTimestamp: number,
  allowManualClose = false,
): Promise<{ filledQty: number; fillPrice: number; orderId: string }> {
  const riskQty = side === 'sell'
    ? (bot.useMoneyManagement !== false ? Math.min(requestedQty, MAX_BOT_ORDER_USDT / referencePrice) : requestedQty)
    : requestedQty;
  validateBotOrderRisk(bot, side, riskQty, referencePrice);
  if (bot.mode === 'live' && !runtimeLiveTradingEnabled) throw new BotExecutionFailure('LIVE_TRADING_DISABLED', false);
  if (bot.mode === 'testnet' && !bot.isSandbox) throw new BotExecutionFailure('TESTNET_MODE_REQUIRES_SANDBOX', false);
  if (!isFreshPrice(priceTimestamp, Date.now(), BOT_PRICE_MAX_AGE_MS)) throw new BotExecutionFailure('FRESH_PRICE_UNAVAILABLE', true);

  const credential = await loadBotCredential(bot.uid, bot.exchange);
  if (!credential) throw new BotExecutionFailure('BOT_CREDENTIALS_MISSING', false);
  const client = createExchangeInstance(bot.exchange, {
    apiKey: credential.apiKey,
    secret: credential.secret,
    password: credential.password,
    isSandbox: credential.isSandbox,
  });
  await withBotExchangeRetry(() => client.loadMarkets(), EXCHANGE_TIMEOUT_MS, 'exchange_market_load_timeout');
  const market = client.market(bot.pair);
  const amount = Number(client.amountToPrecision(bot.pair, riskQty));
  const price = Number(client.priceToPrecision(bot.pair, referencePrice));
  const notional = amount * price;
  validateBotOrderRisk(bot, side, amount, price);
  const marketLimitFailure = validateMarketOrderLimits(amount, price, market.limits || {});
  if (marketLimitFailure) throw new BotExecutionFailure(marketLimitFailure, false);

  const clientOrderId = buildClientOrderId(bot.uid, bot.botId, bot.id, side, bot.orderSequence);
  const pendingOrder = {
    clientOrderId,
    side,
    requestedQty: amount,
    createdAt: Date.now(),
    status: 'submitting' as const,
  };
  // Do not mutate the in-memory runner until the transaction has atomically
  // admitted this clientOrderId. If Firestore rejects because an older
  // pendingOrder exists, recordBotFailure() must preserve that older marker
  // rather than persisting the newly-attempted clientOrderId.
  const orderDocument = firebaseAdminFirestore.collection('users').doc(bot.uid).collection('botOrders').doc(clientOrderId);
  const runnerDocument = botRunnerDocument(bot.uid, bot.id);
  const leaseDocument = botLeaseDocument(bot.uid, bot.id);
  await firebaseAdminFirestore.runTransaction(async (transaction) => {
    const [runnerSnapshot, leaseSnapshot, orderSnapshot] = await Promise.all([
      transaction.get(runnerDocument),
      transaction.get(leaseDocument),
      transaction.get(orderDocument),
    ]);
    const lease = leaseSnapshot.data();
    const runnerStatus = String(runnerSnapshot.data()?.status || '');
    const statusAllowed = runnerStatus === 'active' || (allowManualClose && side === 'sell' && ['paused', 'error'].includes(runnerStatus));
    if (!runnerSnapshot.exists || !statusAllowed
      || lease?.owner !== SERVER_INSTANCE_ID || Number(lease?.expiresAt || 0) <= Date.now()) {
      throw new BotExecutionFailure('BOT_RUNNER_NOT_LEASED', false);
    }
    if (runnerSnapshot.data()?.pendingOrder) {
      throw new BotExecutionFailure('BOT_ORDER_STATUS_UNCERTAIN', false);
    }
    if (orderSnapshot.exists) throw new BotExecutionFailure('IDEMPOTENT_ORDER_ALREADY_EXISTS', false);
    transaction.create(orderDocument, {
      uid: bot.uid,
      botId: bot.botId,
      runnerId: bot.id,
      exchange: bot.exchange,
      pair: bot.pair,
      side,
      requestedQty: amount,
      referencePrice,
      clientOrderId,
      status: 'submitting',
      createdAt: pendingOrder.createdAt,
    });
    transaction.set(runnerDocument, JSON.parse(JSON.stringify({
      ...bot,
      pendingOrder,
      updatedAt: Date.now(),
    })));
  });
  // The admission transaction succeeded; now make the in-memory state match
  // the durable runner state. On any transaction rejection the previous
  // pendingOrder remains untouched.
  bot.pendingOrder = pendingOrder;
  const financialOrder = await createOrderRecord({
    firebaseUid: bot.uid,
    botId: bot.id,
    exchange: bot.exchange,
    symbol: bot.pair,
    side,
    orderType: 'market',
    clientOrderId,
    idempotencyKey: clientOrderId,
    requestedQty: amount,
    requestedPrice: price,
    expectedNotional: notional,
    status: 'SUBMITTED',
  });
  if (financialOrder.replayed && financialOrder.status === 'filled') throw new BotExecutionFailure('IDEMPOTENT_ORDER_ALREADY_EXISTS', false);
  let order: any = await createBotExchangeOrderWithRecovery(
    client,
    bot,
    side,
    amount,
    clientOrderId,
    priceTimestamp,
    allowManualClose,
  );
  if (!order?.id) throw new BotExecutionFailure('ORDER_ID_MISSING', false);
  let orderStatus = String(order.status).toLowerCase();
  if (!['closed', 'filled', 'canceled', 'cancelled'].includes(orderStatus) && order.id) {
    try {
      await withTimeout(client.cancelOrder(order.id, bot.pair), EXCHANGE_TIMEOUT_MS, 'exchange_partial_order_cancel_timeout');
      order = await withTimeout(client.fetchOrder(order.id, bot.pair), EXCHANGE_TIMEOUT_MS, 'exchange_order_status_timeout');
    } catch {
      throw new BotExecutionFailure('ORDER_STATUS_UNCONFIRMED', false);
    }
    orderStatus = String(order.status).toLowerCase();
  } else if ((!Number(order.filled) || Number(order.filled) <= 0) && order.id) {
    try {
      order = await withTimeout(client.fetchOrder(order.id, bot.pair), EXCHANGE_TIMEOUT_MS, 'exchange_order_status_timeout');
      orderStatus = String(order.status).toLowerCase();
    } catch {
      throw new BotExecutionFailure('ORDER_STATUS_UNCONFIRMED', false);
    }
  }
  const filledQty = Number(order.filled) || 0;
  const fillPrice = Number(order.average || order.price) || 0;
  if (!order.id || filledQty <= 0 || fillPrice <= 0 || !['closed', 'filled', 'canceled', 'cancelled'].includes(orderStatus)) {
    throw new BotExecutionFailure('ORDER_NOT_CONFIRMED_FILLED', false);
  }
  const settlement = await finalizeOrderWithFill({
    orderId: financialOrder.id,
    exchangeOrderId: String(order.id),
    quantity: filledQty,
    price: fillPrice,
    quoteAmount: Number((filledQty * fillPrice).toFixed(10)),
    feeAmount: Number(order.fee?.cost || 0),
    feeAsset: order.fee?.currency
      ? String(order.fee.currency)
      : undefined,
  });

  bot.pendingOrder = {
    ...pendingOrder,
    status: 'filled',
    filledQty,
    fillPrice,
    orderId: String(order.id),
  };

  /*
   * Financial settlement succeeded first.
   * Only then advance runtime state.
   *
   * Replay settlement must not increment orderSequence or
   * record another confirmed order.
   */
  if (!settlement.replayed) {
    bot.orderSequence += 1;
    bot.failureStreak = 0;
    bot.lastErrorReason = undefined;
  }

  await orderDocument.set({
    status: settlement.status,
    exchangeOrderId: String(order.id),
    filledQty,
    fillPrice,
    filledAt: Date.now(),
    settlementDeltaQty: settlement.deltaQuantity,
    settlementReplayed: settlement.replayed,
  }, { merge: true });

  await persistBotRunner(bot);

  if (!settlement.replayed) {
    recordConfirmedBotOrder(bot.uid);
  }
  logBotExecutionEvent(bot, 'bot.order.confirmed', {
    side,
    exchange: bot.exchange,
    pair: bot.pair,
    exchangeOrderId: String(order.id),
    clientOrderId,
    filledQty,
    fillPrice,
  });
  return { filledQty, fillPrice, orderId: String(order.id) };
}

async function reconcileLiveBotPosition(bot: ActiveBotRunner): Promise<void> {
  const credential = await loadBotCredential(bot.uid, bot.exchange);
  if (!credential) throw new BotExecutionFailure('BOT_CREDENTIALS_MISSING', false);
  const client = createExchangeInstance(bot.exchange, {
    apiKey: credential.apiKey,
    secret: credential.secret,
    password: credential.password,
    isSandbox: credential.isSandbox,
  });
  const [balanceResult, openOrdersResult] = await Promise.all([
    withTimeout(client.fetchBalance(), EXCHANGE_TIMEOUT_MS, 'reconciliation_balance_timeout'),
    withTimeout(client.fetchOpenOrders(bot.pair), EXCHANGE_TIMEOUT_MS, 'reconciliation_orders_timeout'),
  ]);
  const balance = balanceResult as { total?: Record<string, number>; free?: Record<string, number> };
  const openOrders = openOrdersResult as Array<{ id?: string }>;
  const baseAsset = bot.pair.split('/')[0];
  const exchangeQty = Number(balance.total?.[baseAsset] ?? balance.free?.[baseAsset] ?? 0);
  const tolerance = Math.max(1e-8, bot.positionQty * 0.005);
  if (exchangeQty + tolerance < bot.positionQty) {
    throw new BotExecutionFailure('POSITION_BALANCE_MISMATCH', false);
  }
  if (openOrders.length > 0) throw new BotExecutionFailure('UNTRACKED_OPEN_ORDERS', false);
  bot.lastReconciledAt = Date.now();
  botEngineLogs.unshift({
    id: `log-reconcile-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
    uid: bot.uid,
    timestamp: Date.now(),
    pair: bot.pair,
    botId: bot.id,
    botName: bot.botName,
    action: 'RECONCILIATION',
    details: 'Exchange balance and open orders match the runner state.',
    price: bot.lastEvaluatedPrice,
    stepLayer: bot.stepLayer,
  });
  if (botEngineLogs.length > 50) botEngineLogs.pop();
}

app.use('/api/bot', async (req: Request, res: Response, next) => {
  const authorization = req.header('authorization') || '';
  const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!idToken) {
    return next(new ApiError(401, 'AUTH_REQUIRED', 'authentication', 'A valid Firebase sign-in is required.', 'Silakan login ulang dengan akun Firebase yang valid.'));
  }

  try {
    const decodedToken = await firebaseAdminAuth.verifyIdToken(idToken, true);
    res.locals.botUid = decodedToken.uid;
    if (!(await checkGlobalRequestRateLimit(`bot-uid:${decodedToken.uid}`, 60, 60000)) || !(await checkRedisRateLimit(`bot-user:${decodedToken.uid}`, 60, 60))) {
      return next(new ApiError(429, 'RATE_LIMITED', 'rate_limit', 'Bot API rate limit exceeded.', 'Terlalu banyak permintaan bot. Silakan tunggu sebentar.'));
    }
    if (!persistenceReady) {
      return next(new ApiError(503, 'BOT_STORAGE_UNAVAILABLE', 'configuration', 'Persistent bot storage is unavailable.', 'Penyimpanan bot belum siap. Coba lagi setelah layanan pulih.'));
    }
    next();
  } catch {
    next(new ApiError(401, 'AUTH_INVALID', 'authentication', 'Firebase sign-in token is invalid or expired.', 'Sesi login berakhir. Silakan login ulang.'));
  }
});

// Serial worker loop; the next cycle starts only after the previous one finishes.
async function runBotCycle(): Promise<void> {
  if (!isEngineRunning || activeBotsRegistry.size === 0) return;

  for (const [botId, bot] of activeBotsRegistry.entries()) {
    if (bot.status !== 'active' && bot.resumeAfterReconciliation !== true) continue;

    let leased = false;
    try {
      if (!(await acquireBotLease(bot))) continue;
      leased = true;
      if (bot.resumeAfterReconciliation) {
        try {
          await reconcileLiveBotPosition(bot);

          // Reconciliation success is not an authorization to trade.
          // Default behavior is fail-closed: keep the runner paused and
          // require an explicit user resume. Auto-resume is opt-in via the
          // two-part environment guard and is never enabled by default.
          if (BOT_STARTUP_AUTO_RESUME) {
            // Final authorization gate: a persisted live runner may only
            // auto-resume when its license is still ACTIVE. Testnet runners
            // remain available without a paid license.
            if (bot.mode === 'live') {
              try {
                await requireActiveLicense(bot.uid);
              } catch (error) {
                bot.resumeAfterReconciliation = false;
                bot.status = 'paused';
                bot.lastErrorReason = String((error as any)?.code || 'LICENSE_REQUIRED');
                await updateBotRuntimeStatus({
                  firebaseUid: bot.uid,
                  externalBotId: bot.id,
                  status: 'STANDBY',
                });
                logBotExecutionEvent(bot, 'bot.startup.auto_resume_blocked', {
                  reason: 'LICENSE_REQUIRED',
                  code: String((error as any)?.code || 'LICENSE_REQUIRED'),
                });
                await persistBotRunner(bot);
                continue;
              }
            }

            await updateBotRuntimeStatus({
              firebaseUid: bot.uid,
              externalBotId: bot.id,
              status: 'ACTIVE',
            });
            bot.resumeAfterReconciliation = false;
            bot.status = 'active';
            bot.lastErrorReason = undefined;
            logBotExecutionEvent(bot, 'bot.startup.auto_resumed', {
              reason: 'STARTUP_RECONCILIATION_COMPLETED',
            });
          } else {
            await updateBotRuntimeStatus({
              firebaseUid: bot.uid,
              externalBotId: bot.id,
              status: 'STANDBY',
            });
            bot.resumeAfterReconciliation = false;
            bot.status = 'paused';
            bot.lastErrorReason = 'STARTUP_RESUME_REQUIRED';
            logBotExecutionEvent(bot, 'bot.startup.resume_required', {
              reason: 'BOT_STARTUP_AUTO_RESUME_DISABLED',
            });
          }

          await persistBotRunner(bot);
        } catch (error) {
          await recordBotFailure(bot, error, 'RECONCILIATION');
        }
        continue;
      }
      if ((bot.mode === 'testnet' || bot.mode === 'live') && Date.now() - (bot.lastReconciledAt || 0) >= BOT_RECONCILIATION_INTERVAL_MS) {
        try {
          await reconcileLiveBotPosition(bot);
        } catch (error) {
          await recordBotFailure(bot, error, 'RECONCILIATION');
          continue;
        }
      }
      let cached: Awaited<ReturnType<typeof getPrice>> | undefined;
      try {
        cached = await getPrice(bot.exchange, bot.pair, bot.isSandbox);
      } catch {
        // Live price is useful for execution/display, but strategy decisions are candle-driven.
        cached = undefined;
      }

      let candleSnapshot: Awaited<ReturnType<typeof getClosedCandleMarketSnapshot>>;
      try {
        candleSnapshot = await getClosedCandleMarketSnapshot(bot);
      } catch (error) {
        bot.priceFailureStreak += 1;
        if (bot.priceFailureStreak >= BOT_FAILURE_PAUSE_THRESHOLD) {
          await transitionBotLifecycle(bot, 'paused', (error as any)?.code || 'CANDLE_DATA_UNAVAILABLE');
        }
        botEngineLogs.unshift({
          id: `log-candle-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          uid: bot.uid,
          timestamp: Date.now(),
          pair: bot.pair,
          botId: bot.id,
          botName: bot.botName,
          action: 'RUNNER_ERROR',
          details: `Closed ${bot.timeframe} candle unavailable; strategy cycle skipped (${bot.priceFailureStreak}/${BOT_FAILURE_PAUSE_THRESHOLD}).`,
          price: bot.lastEvaluatedPrice,
          stepLayer: bot.stepLayer,
        });
        if (botEngineLogs.length > 50) botEngineLogs.pop();
        await persistBotLog(botEngineLogs[0]);
        if (bot.status === 'paused') await persistBotRunner(bot);
        continue;
      }

      bot.priceFailureStreak = 0;
      const signalCandle = candleSnapshot.candle;
      if ((bot.lastStrategyCandleTimestamp || 0) >= signalCandle.closeTimestamp) {
        bot.lastEvaluatedPrice = cached?.last || signalCandle.close;
        continue;
      }
      const currentPrice = signalCandle.close;
      const executionPrice = cached?.last || currentPrice;
      bot.lastStrategyCandleTimestamp = signalCandle.closeTimestamp;
      bot.lastStrategySignalPrice = signalCandle.close;
      bot.lastEvaluatedPrice = executionPrice;
      if (!bot.peakPrice || currentPrice > bot.peakPrice) bot.peakPrice = currentPrice;
      if (!bot.troughPrice || currentPrice < bot.troughPrice) bot.troughPrice = currentPrice;

      // Calculate price deviation from initial/entry price
      const priceDropPct = ((bot.entryPrice - currentPrice) / bot.entryPrice) * 100;
      const positionReferencePrice = bot.avgEntryPrice || bot.entryPrice;
      const priceGainPct = bot.positionQty > 0
        ? ((currentPrice - positionReferencePrice) / positionReferencePrice) * 100
        : 0;

      // Min & Max Price Boundary Check (Applies to ALL bots)
      // "Jadi meskipun bot di start/posisi on kalau harga masih diatas 115, bot tidak buy. terapkan ke semua bot"
      const isAboveMax = Boolean(bot.maxPrice && bot.maxPrice > 0 && currentPrice > bot.maxPrice);
      const isBelowMin = Boolean(bot.minPrice && bot.minPrice > 0 && currentPrice < bot.minPrice);
      bot.priceBoundaryStatus = isAboveMax ? 'ABOVE_MAX' : isBelowMin ? 'BELOW_MIN' : 'IN_RANGE';

      // Uptrend filter verification:
      // Checks 24h ticker change or positive short-term momentum
      const isMarketUptrend = signalCandle.open > 0
        ? ((signalCandle.close - signalCandle.open) / signalCandle.open) * 100 >= -0.5
        : currentPrice >= bot.entryPrice * 0.985;

      // 1. Take Profit Trigger Condition
      // Grid: uses gridTp (or baseTp), triggers at TP target
      // Averager: uses baseTp with tpCallbackPct confirmation
      const targetTp = bot.botMode === 'Grid Only' ? (bot.gridTp || 1.2) : bot.baseTp;
      const useTpCallback = bot.botMode !== 'Grid Only'; // Averager & Avarage+Grid use TP callback

      const shouldExecuteTp = shouldExecuteTakeProfit({
        quantity: bot.positionQty,
        gainPct: priceGainPct,
        targetPct: targetTp,
        peakPrice: bot.peakPrice || currentPrice,
        currentPrice,
        callbackPct: bot.tpCallbackPct || 0.2,
        useCallback: useTpCallback,
      });

      if (shouldExecuteTp) {
          const fill = await executeBotMarketOrder(bot, 'sell', bot.positionQty, executionPrice, Date.now());
          const dailyLossPausedBots = applyBotRealizedPnl(bot, fill.filledQty, fill.fillPrice);
          for (const candidate of dailyLossPausedBots) {
            await transitionBotLifecycle(
              candidate,
              'paused',
              'RISK_DAILY_LOSS_LIMIT',
            );
          }
          const updatedPosition = applySellFill({
            quantity: bot.positionQty,
            averageEntryPrice: bot.avgEntryPrice,
            realizedPnl: 0,
          }, fill.filledQty, fill.fillPrice);
          bot.positionQty = updatedPosition.quantity;
          bot.positionVersion = Number((bot as any).positionVersion || 0) + 1;
          if (bot.positionQty <= 1e-12) {
            bot.positionQty = 0;
            bot.avgEntryPrice = 0;
            bot.stepLayer = 1;
            bot.entryPrice = fill.fillPrice;
            bot.peakPrice = fill.fillPrice;
            bot.troughPrice = fill.fillPrice;
            if (GAIN_V2_ENABLED && bot.dcaLayers) {
              bot.dcaLayers = generateDcaLayers({ baseOrderUsd: bot.baseAmount, stepDeviationPct: bot.averageDownPct, stepScale: 1.25, volumeMultiplier: 1.3, maxLayers: Math.max(1, bot.averagingLayers), maxCapitalUsd: bot.useMoneyManagement !== false ? Math.min(V2_MAX_COMMITTED_CAPITAL_USDT, MAX_BOT_EXPOSURE_USDT) : Number.POSITIVE_INFINITY, takeProfitPct: bot.baseTp, trailingTpPct: bot.tpCallbackPct || 0.2, callbackPct: bot.layerCallbackPct || 0.2, minPrice: bot.minPrice, maxPrice: bot.maxPrice });
              bot.committedCapitalUsd = 0;
            }
          }

          const logItem: BotEngineLog = {
            id: `log-tp-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
            uid: bot.uid,
            timestamp: Date.now(),
            pair: bot.pair,
            botId: bot.id,
            botName: bot.botName,
            action: 'TAKE_PROFIT',
            details: `[${bot.botName || bot.pair}] ${`SELL ${fill.filledQty} @ ${fill.fillPrice} confirmed (${fill.orderId})`} after take-profit (+${priceGainPct.toFixed(2)}%).`,
            price: fill.fillPrice,
            stepLayer: bot.stepLayer,
          };
          botEngineLogs.unshift(logItem);
          if (botEngineLogs.length > 50) botEngineLogs.pop();
          bot.pendingOrder = undefined;
          await persistBotRunner(bot);
          await persistBotLog(logItem);
          continue;
      }

      // 2. GAIN 2.0 Strategy/Risk path. The legacy path remains available when disabled.
      if (GAIN_V2_ENABLED) {
        const marketSnapshot: V2MarketSnapshot = candleSnapshot.market;
        if (!marketSnapshot.candle?.isClosed || marketSnapshot.candle.closeTimestamp > Date.now()) {
          throw new BotExecutionFailure('V2_CANDLE_NOT_CLOSED', true);
        }

        const botExposure = bot.positionQty * (bot.avgEntryPrice || currentPrice);
        const userExposure = Array.from(activeBotsRegistry.values())
          .filter((candidate) => candidate.uid === bot.uid)
          .reduce((total, candidate) => total + candidate.positionQty * (candidate.avgEntryPrice || candidate.lastEvaluatedPrice), 0);
        const committed = Number(bot.committedCapitalUsd || botExposure || 0);
        const drawdownPct = bot.positionQty > 0 && bot.avgEntryPrice > 0
          ? Math.max(0, ((bot.avgEntryPrice - currentPrice) / bot.avgEntryPrice) * 100)
          : 0;
        const riskContext = {
          botExposureUsd: botExposure,
          userExposureUsd: userExposure,
          portfolioExposureUsd: userExposure,
          futureCommittedUsd: committed,
          dailyNetPnlUsd: bot.realizedPnlToday,
          drawdownPct,
          maxOrderUsd: bot.useMoneyManagement !== false ? MAX_BOT_ORDER_USDT : Number.POSITIVE_INFINITY,
          maxBotExposureUsd: bot.useMoneyManagement !== false ? MAX_BOT_EXPOSURE_USDT : Number.POSITIVE_INFINITY,
          maxUserExposureUsd: bot.useMoneyManagement !== false ? MAX_USER_EXPOSURE_USDT : Number.POSITIVE_INFINITY,
          maxPortfolioExposureUsd: bot.useMoneyManagement !== false ? MAX_USER_EXPOSURE_USDT : Number.POSITIVE_INFINITY,
          maxCommittedCapitalUsd: bot.useMoneyManagement !== false ? V2_MAX_COMMITTED_CAPITAL_USDT : Number.POSITIVE_INFINITY,
          maxDailyLossUsd: MAX_USER_DAILY_LOSS_USDT,
          maxDrawdownPct: V2_MAX_DRAWDOWN_PCT,
          maxSpreadPct: V2_MAX_SPREAD_PCT,
          maxSlippagePct: V2_MAX_SLIPPAGE_PCT,
          marketPriceTimestamp: marketSnapshot.timestamp,
          now: Date.now(),
          killSwitch: false,
          exchangeHealthy: true,
        };

        let v2Intent;
        const dcaEnabled = bot.botMode === 'Avarage Only' || bot.botMode === 'Avarage+Grid';
        const gridEnabled = bot.botMode === 'Grid Only' || bot.botMode === 'Avarage+Grid';
        if (dcaEnabled) {
          const dcaResult = evaluateDca(
            bot.botId, bot.uid, bot.pair,
            { baseOrderUsd: bot.baseAmount, stepDeviationPct: bot.averageDownPct, stepScale: 1.25, volumeMultiplier: 1.3, maxLayers: Math.max(1, bot.averagingLayers), maxCapitalUsd: bot.useMoneyManagement !== false ? Math.min(V2_MAX_COMMITTED_CAPITAL_USDT, MAX_BOT_EXPOSURE_USDT) : Number.POSITIVE_INFINITY, takeProfitPct: bot.baseTp, trailingTpPct: bot.tpCallbackPct || 0.2, callbackPct: bot.layerCallbackPct || 0.2, minPrice: bot.minPrice, maxPrice: bot.maxPrice },
            bot.dcaLayers || [],
            { quantity: bot.positionQty, averageEntryPrice: bot.avgEntryPrice, realizedPnl: bot.realizedPnlToday },
            marketSnapshot,
          );
          bot.dcaLayers = dcaResult.layers;
          v2Intent = dcaResult.intent;
        }
        if (!v2Intent && gridEnabled && bot.gridLevels?.length && bot.minPrice && bot.maxPrice && bot.maxPrice > bot.minPrice) {
          const gridResult = evaluateGrid(
            bot.botId, bot.uid, bot.pair,
            { lowerPrice: bot.minPrice, upperPrice: bot.maxPrice, gridCount: bot.gridLevels.length - 1, orderSizeUsd: bot.baseAmount, takeProfitPct: bot.gridTp || 1.2, maxCapitalUsd: bot.useMoneyManagement !== false ? V2_MAX_COMMITTED_CAPITAL_USDT : Number.POSITIVE_INFINITY },
            bot.gridLevels,
            { quantity: bot.positionQty, averageEntryPrice: bot.avgEntryPrice, realizedPnl: bot.realizedPnlToday },
            marketSnapshot, candleSnapshot.previousCandleClose,
          );
          bot.gridLevels = gridResult.levels;
          v2Intent = gridResult.intent;
        }

        if (v2Intent) {
          const risk = evaluateRisk(v2Intent, marketSnapshot, riskContext);
          if (!risk.approved) {
            const riskLog: BotEngineLog = {
              id: `log-v2-risk-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
              uid: bot.uid, timestamp: Date.now(), pair: bot.pair, botId: bot.id, botName: bot.botName,
              action: 'RUNNER_ERROR', details: `[GAIN 2.0] Risk blocked ${v2Intent.strategy} order: ${'code' in risk ? risk.code : 'UNKNOWN_RISK'}.`, price: currentPrice, stepLayer: bot.stepLayer,
            };
            botEngineLogs.unshift(riskLog);
            if (botEngineLogs.length > 50) botEngineLogs.pop();
            await persistBotLog(riskLog);
            await persistBotRunner(bot);
          } else {
            const fill = await executeBotMarketOrder(bot, v2Intent.side, v2Intent.quantity, executionPrice, marketSnapshot.timestamp);
            if (v2Intent.side === 'buy') {
              const updated = applyBuyFill({ quantity: bot.positionQty, averageEntryPrice: bot.avgEntryPrice, realizedPnl: bot.realizedPnlToday }, fill.filledQty, fill.fillPrice);
              bot.positionQty = updated.quantity;
              bot.positionVersion = Number((bot as any).positionVersion || 0) + 1;
              bot.avgEntryPrice = updated.averageEntryPrice;
              bot.committedCapitalUsd = Math.min(V2_MAX_COMMITTED_CAPITAL_USDT, (bot.committedCapitalUsd || 0) + fill.filledQty * fill.fillPrice);
              if (v2Intent.layerNo !== undefined) bot.dcaLayers = (bot.dcaLayers || []).map((l) => l.layerNo === v2Intent.layerNo ? { ...l, status: 'FILLED' as const } : l);
              bot.stepLayer = Math.max(bot.stepLayer + 1, (v2Intent.layerNo || 0) + 1);
            } else {
              const dailyLossPausedBots = applyBotRealizedPnl(bot, fill.filledQty, fill.fillPrice);
              for (const candidate of dailyLossPausedBots) {
                await transitionBotLifecycle(
                  candidate,
                  'paused',
                  'RISK_DAILY_LOSS_LIMIT',
                );
              }
              const updated = applySellFill({ quantity: bot.positionQty, averageEntryPrice: bot.avgEntryPrice, realizedPnl: 0 }, fill.filledQty, fill.fillPrice);
              bot.positionQty = updated.quantity;
          bot.positionVersion = Number((bot as any).positionVersion || 0) + 1;
              if (bot.positionQty <= 1e-12) { bot.positionQty = 0; bot.avgEntryPrice = 0; bot.stepLayer = 1; bot.committedCapitalUsd = 0; }
              if (v2Intent.gridLevelId) bot.gridLevels = pairGridLevel(bot.gridLevels || [], v2Intent.gridLevelId, fill.fillPrice);
            }
            // The runtime position has now consumed this exchange fill.
            // Clear the durable pending-fill marker BEFORE persisting.
            //
            // Crash before this persist:
            //   Firestore still has the pre-fill runtime + pending=filled,
            //   so startup recovery applies the fill exactly once.
            //
            // Persist after this clear:
            //   Firestore contains the post-fill runtime with no pending fill,
            //   so startup recovery cannot replay the same fill.
            bot.pendingOrder = undefined;
            await persistBotRunner(bot);
            const v2Log: BotEngineLog = {
              id: `log-v2-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
              uid: bot.uid, timestamp: Date.now(), pair: bot.pair, botId: bot.id, botName: bot.botName,
              action: v2Intent.side === 'buy' ? (v2Intent.strategy === 'GRID' ? 'GRID_TP' : 'AVERAGING_ORDER') : 'TAKE_PROFIT',
              details: `[GAIN 2.0] ${v2Intent.strategy} ${v2Intent.side.toUpperCase()} ${'confirmed'} @ ${fill.fillPrice}. ${v2Intent.reason}`,
              price: fill.fillPrice, stepLayer: bot.stepLayer,
            };
            botEngineLogs.unshift(v2Log);
            if (botEngineLogs.length > 50) botEngineLogs.pop();
            await persistBotLog(v2Log);
          }
          continue;
        }
      }

      // 3. Legacy Averaging Down / Grid Trigger Condition (compatibility mode).
      // Average+Grid: 20 layer Average + 100 layer Grid (Total 120 layers max)
      // Grid Only: 100 layers max
      // Avarage Only: 20 layers max
      const maxAllowedLayers =
        bot.botMode === 'Grid Only'
          ? (bot.gridLayers || 100)
          : bot.botMode === 'Avarage+Grid'
          ? ((bot.averagingLayers || 20) + (bot.gridLayers || 100))
          : (bot.averagingLayers || 20);

      const nextTriggerDrop = bot.stepLayer * bot.averageDownPct;

      if (priceDropPct >= nextTriggerDrop && bot.stepLayer < maxAllowedLayers) {
        // Price Ceiling Protection: "kalau harga masih diatas 115, bot tidak buy. terapkan ke semua bot"
        if (isAboveMax) {
          if (!botEngineLogs.some((l) => l.botId === bot.id && l.details.includes('Proteksi Max Price') && Date.now() - l.timestamp < 60000)) {
            botEngineLogs.unshift({
              id: `log-max-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
              uid: bot.uid,
              timestamp: Date.now(),
              pair: bot.pair,
              botId: bot.id,
              botName: bot.botName,
              action: 'MONITOR_TICK',
              details: `[${bot.botName || bot.pair}] Proteksi Max Price Aktif: Harga saat ini ($${currentPrice.toFixed(2)}) > Max Price ($${Number(bot.maxPrice).toFixed(2)}). Bot aktif/ON namun TIDAK BUY hingga harga berada di bawah atau sama dengan batas maksimal.`,
              price: currentPrice,
              stepLayer: bot.stepLayer,
            });
            if (botEngineLogs.length > 50) botEngineLogs.pop();
          }
          continue;
        }

        // Price Floor Protection: Tidak buy jika harga di bawah minPrice
        if (isBelowMin) {
          if (!botEngineLogs.some((l) => l.botId === bot.id && l.details.includes('Proteksi Min Price') && Date.now() - l.timestamp < 60000)) {
            botEngineLogs.unshift({
              id: `log-min-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
              uid: bot.uid,
              timestamp: Date.now(),
              pair: bot.pair,
              botId: bot.id,
              botName: bot.botName,
              action: 'MONITOR_TICK',
              details: `[${bot.botName || bot.pair}] Proteksi Min Price Aktif: Harga saat ini ($${currentPrice.toFixed(2)}) < Min Price ($${Number(bot.minPrice).toFixed(2)}). Bot TIDAK BUY untuk proteksi crash di bawah support.`,
              price: currentPrice,
              stepLayer: bot.stepLayer,
            });
            if (botEngineLogs.length > 50) botEngineLogs.pop();
          }
          continue;
        }

        // If uptrend filter is active, avoid adding layers during an unchecked severe crash
        if (bot.uptrendFilter && !isMarketUptrend && priceDropPct > 15) {
          continue;
        }

        // Averager / Grid rebound callback verification (callback tiap layer)
        const layerCb = bot.layerCallbackPct || 0.2;
        const reboundFromTrough = bot.troughPrice ? ((currentPrice - bot.troughPrice) / bot.troughPrice) * 100 : 0;

        // Trigger order only when price has rebounded from trough by layerCallbackPct
        if (reboundFromTrough >= layerCb || priceDropPct >= nextTriggerDrop + 1.2) {
          const requestedQty = bot.baseAmount / currentPrice;
          const fill = await executeBotMarketOrder(bot, 'buy', requestedQty, executionPrice, Date.now());
          const updatedPosition = applyBuyFill({
            quantity: bot.positionQty,
            averageEntryPrice: bot.avgEntryPrice,
            realizedPnl: bot.realizedPnlToday,
          }, fill.filledQty, fill.fillPrice);
          bot.positionQty = updatedPosition.quantity;
          bot.positionVersion = Number((bot as any).positionVersion || 0) + 1;
          bot.avgEntryPrice = updatedPosition.averageEntryPrice;
          bot.stepLayer += 1;
          bot.troughPrice = currentPrice;

          const isGridLayer = bot.botMode === 'Grid Only' || (bot.botMode === 'Avarage+Grid' && bot.stepLayer > (bot.averagingLayers || 20));
          const logItem: BotEngineLog = {
            id: `log-avg-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
            uid: bot.uid,
            timestamp: Date.now(),
            pair: bot.pair,
            botId: bot.id,
            botName: bot.botName,
            action: isGridLayer ? 'GRID_TP' : 'AVERAGING_ORDER',
            details: `[${bot.botName || bot.pair}] ${`BUY ${fill.filledQty} @ ${fill.fillPrice} confirmed (${fill.orderId})`} for layer #${bot.stepLayer}/${maxAllowedLayers} [${isGridLayer ? 'Grid Sub-Layer' : 'Averaging Layer'}].`,
            price: fill.fillPrice,
            stepLayer: bot.stepLayer,
          };
          botEngineLogs.unshift(logItem);
          if (botEngineLogs.length > 50) botEngineLogs.pop();
          bot.pendingOrder = undefined;
          await persistBotRunner(bot);
          await persistBotLog(logItem);
        }
      }
    } catch (error) {
      await recordBotFailure(bot, error).catch(() => {});
    } finally {
      if (leased) await releaseBotLease(bot).catch(() => {});
    }
  }
}

async function runBotWorkerLoop(): Promise<void> {
  while (!shutdownRequested) {
    await runBotCycle();
    if (shutdownRequested) break;
    await new Promise((resolve) => setTimeout(resolve, GAIN_V2_ENABLED ? 1000 : 15000));
  }
}

// API: Register or update active bot in background runner
app.post('/api/bot/register', async (req: Request, res: Response, next) => {
  try {
    const parsed = BotRegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ApiError(400, 'BOT_CONFIGURATION_INVALID', 'validation', 'Bot configuration failed validation.', 'Konfigurasi bot tidak valid. Periksa simbol dan batas parameter.'));
    }

    const uid = res.locals.botUid as string;
    await requireSecuritySession(req, uid);
    const {
      botId: requestedBotId,
      botName,
      pair,
      pairedCoins,
      botMode,
      baseAmount,
      baseTp,
      useMoneyManagement,
      averagingLayers,
      gridLayers,
      averageDownPct,
      uptrendFilter,
      tpCallbackPct,
      layerCallbackPct,
      gridTp,
      minPrice,
      maxPrice,
      entryPrice,
      timeframe,
      exchange,
      isSandbox,
      mode,
    } = parsed.data;
    if (mode === 'live') await requireActiveLicense(uid);
    if (mode === 'live' && !runtimeLiveTradingEnabled) {
      return next(new ApiError(403, 'LIVE_TRADING_DISABLED', 'security', 'Live trading is disabled on this server.', 'Trading live belum diaktifkan oleh administrator.'));
    }
    if (mode === 'testnet' && !isSandbox) {
      return next(new ApiError(403, 'TESTNET_REQUIRES_SANDBOX', 'security', 'Testnet bots must use an exchange sandbox/testnet endpoint.', 'Bot Testnet wajib menggunakan endpoint Testnet/Sandbox exchange.'));
    }
    if (mode === 'live' && LIVE_TRADING_TESTNET_ONLY && !isSandbox) {
      return next(new ApiError(403, 'LIVE_TRADING_TESTNET_ONLY', 'security', 'This server allows live-mode bot orders only against exchange testnet.', 'Server ini hanya mengizinkan mode live ke exchange Testnet.'));
    }
    if (mode === 'testnet' || mode === 'live') {
      const botCredential = await loadBotCredential(uid, exchange);
      if (!botCredential) {
        return next(new ApiError(409, 'BOT_CREDENTIALS_REQUIRED', 'validation', 'Encrypted exchange credentials are required for live trading.', 'Simpan kredensial exchange terlebih dahulu untuk memakai mode live.'));
      }
      if (botCredential.isSandbox !== isSandbox) {
        return next(new ApiError(409, 'BOT_EXCHANGE_MODE_MISMATCH', 'validation', 'Bot sandbox mode must match the encrypted exchange credentials.', 'Mode bot harus sama dengan mode API exchange yang tersimpan.'));
      }
    }
    const currentUserExposure = Array.from(activeBotsRegistry.values())
      .filter((candidate) => candidate.uid === uid && (candidate.botId !== requestedBotId || !requestedBotId))
      .reduce((total, candidate) => total + candidate.positionQty * (candidate.avgEntryPrice || candidate.lastEvaluatedPrice), 0);
    const registrationRisk = assessRegisteredBotRisk({
      botMode, averagingLayers, gridLayers, baseAmount, baseTp, averageDownPct, gridProfitPct: gridTp, tpCallbackPct, layerCallbackPct,
      pairedCoinsCount: pairedCoins?.length || 1, currentUserExposureUsdt: currentUserExposure,
      useMoneyManagement,
    });
    if (registrationRisk.status === 'BLOCKED') {
      return next(new ApiError(422, 'BOT_RISK_GUARDRAIL_BLOCKED', 'risk',
        registrationRisk.blockers.map((rule) => rule.code).join(', '),
        registrationRisk.blockers.map((rule) => rule.message).join(' ')));
    }
    const coinsToRegister = pairedCoins?.length ? pairedCoins : [pair];
    const baseBotId = requestedBotId || `bot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const finalBotName = botName || `GAIN ${botMode} (${coinsToRegister.length} Koin)`;
    const avgL = botMode === 'Grid Only' ? 0 : Math.max(1, averagingLayers);
    const gridL = botMode === 'Avarage Only' ? 0 : Math.max(1, gridLayers);
    const parsedMinPrice = minPrice;
    const parsedMaxPrice = maxPrice;

    for (const coinPair of coinsToRegister) {
      const runnerId = deriveBotRunnerId(baseBotId, coinPair, coinsToRegister.length > 1);
      const initialPrice = (await getPrice(exchange, coinPair, isSandbox)).last;
      const boundaryStatus = (parsedMaxPrice > 0 && initialPrice > parsedMaxPrice)
        ? 'ABOVE_MAX'
        : (parsedMinPrice > 0 && initialPrice < parsedMinPrice)
        ? 'BELOW_MIN'
        : 'IN_RANGE';

      const registryKey = botRegistryKey(uid, runnerId);
      const previousRunner = activeBotsRegistry.get(registryKey);
      if (previousRunner) {
        await transitionBotLifecycle(
          previousRunner,
          'paused',
          'USER_REQUEST',
        );
      }
      const runner: ActiveBotRunner = {
        id: runnerId,
        uid,
        botId: baseBotId,
        mode,
        botName: finalBotName,
        pair: coinPair,
        pairedCoins: coinsToRegister,
        botMode,
        baseAmount: Number(baseAmount),
        baseTp: Number(baseTp),
        useMoneyManagement: useMoneyManagement !== false,
        averagingLayers: avgL,
        gridLayers: gridL,
        averageDownPct: Number(averageDownPct),
        uptrendFilter: uptrendFilter !== false,
        tpCallbackPct: Number(tpCallbackPct) || 0.2,
        layerCallbackPct: Number(layerCallbackPct) || 0.2,
        gridTp: Number(gridTp) || 1.2,
        minPrice: parsedMinPrice,
        maxPrice: parsedMaxPrice,
        priceBoundaryStatus: boundaryStatus,
        stepLayer: 1,
        entryPrice: initialPrice,
        peakPrice: initialPrice,
        troughPrice: initialPrice,
        lastEvaluatedPrice: initialPrice,
        positionQty: 0,
        positionVersion: 0,
        avgEntryPrice: 0,
        realizedPnlToday: 0,
        pnlDate: new Date().toISOString().slice(0, 10),
        failureStreak: 0,
        priceFailureStreak: 0,
        orderSequence: 0,
        status: 'paused',
        exchange: exchange.toUpperCase(),
        isSandbox,
        timeframe,
        lastStrategyCandleTimestamp: undefined,
        lastStrategySignalPrice: undefined,
        dcaLayers: GAIN_V2_ENABLED ? generateDcaLayers({
          baseOrderUsd: Number(baseAmount),
          stepDeviationPct: Number(averageDownPct),
          stepScale: 1.25,
          volumeMultiplier: 1.3,
          maxLayers: Math.max(1, avgL),
          maxCapitalUsd: useMoneyManagement !== false ? Math.min(V2_MAX_COMMITTED_CAPITAL_USDT, MAX_BOT_EXPOSURE_USDT) : Number.POSITIVE_INFINITY,
          takeProfitPct: Number(baseTp),
          trailingTpPct: Number(tpCallbackPct) || 0.2,
          callbackPct: Number(layerCallbackPct) || 0.2,
          minPrice: parsedMinPrice || undefined,
          maxPrice: parsedMaxPrice || undefined,
        }) : undefined,
        gridLevels: GAIN_V2_ENABLED && (botMode === 'Grid Only' || botMode === 'Avarage+Grid') && parsedMinPrice > 0 && parsedMaxPrice > parsedMinPrice
          ? generateGridLevels({ lowerPrice: parsedMinPrice, upperPrice: parsedMaxPrice, gridCount: Math.max(1, Math.min(100, gridL || 20)), orderSizeUsd: Number(baseAmount), takeProfitPct: Number(gridTp) || 1.2, maxCapitalUsd: V2_MAX_COMMITTED_CAPITAL_USDT })
          : undefined,
        committedCapitalUsd: 0,
      };
      await persistBotRunner(runner);
      await upsertBotRuntime({ firebaseUid: uid, externalBotId: runner.id, name: finalBotName, exchange: exchange.toUpperCase(), symbol: coinPair, strategyType: botMode, status: 'ACTIVE', mode, config:{baseAmount,baseTp,useMoneyManagement,tpCallbackPct,averageDownPct,maxLayers:Math.max(avgL,gridL),maxCapitalUsd:useMoneyManagement !== false ? V2_MAX_COMMITTED_CAPITAL_USDT : null,minPrice:parsedMinPrice,maxPrice:parsedMaxPrice,timeframe} });
      runner.status = 'active';
      await persistBotRunner(runner);
      activeBotsRegistry.set(registryKey, runner);
      if (GAIN_V2_ENABLED && (mode === 'testnet' || mode === 'live')) {
        try {
        v2WebSocketManager.connect(
          exchange.toLowerCase(),
          coinPair,
          isSandbox
        );
      } catch (error) {
        console.warn('[GAIN_V2_WS] connect failed', {
          exchange,
          coinPair,
          isSandbox,
          message: String((error as any)?.message || error),
        });
      }
      }
    }

    logAuditEvent(req, res, 'bot.registered', {
      uid,
      botId: baseBotId,
      exchange: String(exchange).slice(0, 20),
      pairedCoinCount: coinsToRegister.length,
      sandbox: Boolean(isSandbox),
    });
    res.json({
      success: true,
      message: `Bot "${finalBotName}" berhasil dipairing ke ${coinsToRegister.length} koin [${coinsToRegister.join(', ')}] & aktif di background engine 24/7!`,
      botId: baseBotId,
      botName: finalBotName,
      pairedCoins: coinsToRegister,
      activeCount: Array.from(activeBotsRegistry.values()).filter((bot) => bot.uid === uid).length,
    });
  } catch (err: any) {
    return next(err);
  }
});

app.post('/api/bot/credentials', async (req: Request, res: Response, next) => {
  try {
    const parsed = BotCredentialSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ApiError(400, 'BOT_CREDENTIALS_INVALID', 'validation', 'Exchange credentials failed validation.', 'Kredensial exchange tidak valid.'));
    }
    const uid = res.locals.botUid as string;
    await requireSecuritySession(req, uid);
    if (!parsed.data.isSandbox) await requireActiveLicense(uid);
    const requiresPassphrase = ['bitget', 'okx'].includes(parsed.data.exchange);
    const credential = sanitizeExchangeInput(parsed.data, { requirePassphrase: requiresPassphrase });
    requireDatabase();

    // Verify the credential on the server before persisting it and derive an
    // exchange-account identity. The browser never becomes the source of truth.
    const client = createExchangeInstance(credential.exchange, {
      apiKey: credential.apiKey,
      secret: credential.secret,
      password: credential.password,
      isSandbox: credential.isSandbox,
    });
    const balance = await withExchangeRetry(credential.exchange, 'fetchBalance', async () => client.fetchBalance());
    const identity = resolveExchangeAccountIdentity(credential.exchange, credential.isSandbox, balance, credential);

    const existing = await getExchangeConnection(uid, credential.exchange);
    const ownedBots = selectOwnedBotEntries(Array.from(activeBotsRegistry.entries()), uid)
      .filter(([, bot]) => bot.exchange.toLowerCase() === credential.exchange.toLowerCase());
    let identityChanged = Boolean(existing?.identity_key && existing.identity_key !== identity.identityKey);

    // If the exchange reports a stable account id, changing API keys inside the
    // same exchange account is a credential rotation, not an account rebind.
    if (existing?.reported_identity_key && identity.reportedIdentityKey) {
      identityChanged = existing.reported_identity_key !== identity.reportedIdentityKey;
    } else if (existing?.credential_fingerprint && existing.credential_fingerprint === identity.credentialFingerprint) {
      identityChanged = false;
    } else if (existing?.identity_type === 'credential_fingerprint' && identity.reportedIdentityKey && existing?.reported_identity_key == null) {
      // Legacy connection: verify the old credential once so a same-account API
      // rotation is not mistaken for a different exchange account.
      try {
        const oldCredential = await loadBotCredential(uid, credential.exchange);
        if (oldCredential) {
          const oldClient = createExchangeInstance(oldCredential.exchange, {
            apiKey: oldCredential.apiKey,
            secret: oldCredential.secret,
            password: oldCredential.password,
            isSandbox: oldCredential.isSandbox,
          });
          const oldBalance = await withExchangeRetry(oldCredential.exchange, 'fetchBalance', async () => oldClient.fetchBalance());
          const oldIdentity = resolveExchangeAccountIdentity(oldCredential.exchange, oldCredential.isSandbox, oldBalance, oldCredential);
          if (oldIdentity.reportedIdentityKey && oldIdentity.reportedIdentityKey === identity.reportedIdentityKey) identityChanged = false;
        }
      } catch (error) {
        console.warn('[EXCHANGE_IDENTITY_ROTATION_CHECK_FAILED]', { exchange: credential.exchange, message: String((error as any)?.message || error) });
      }
    }

    const botsWithPositions = ownedBots.filter(([, bot]) => Number(bot.positionQty || 0) > 0 || Boolean(bot.pendingOrder));

    if (identityChanged && botsWithPositions.length > 0) {
      return next(new ApiError(409, 'EXCHANGE_CREDENTIAL_REBIND_REQUIRES_FLAT', 'trading', 'The exchange credential can only be replaced after the existing bots are flat and reconciled.', 'API exchange tidak boleh diganti saat bot masih memiliki posisi atau order yang belum selesai. Tutup/reconcile posisi dan order terlebih dahulu, lalu ulangi penggantian API.'));
    }

    if (identityChanged && ownedBots.length > 0) {
      for (const [, bot] of ownedBots) {
        if (bot.status !== 'paused') await transitionBotLifecycle(bot, 'paused', 'EXCHANGE_CREDENTIAL_REPLACED');
      }
      const cancellation = await cancelBotOpenOrders(uid, ownedBots.map(([, bot]) => bot));
      if (cancellation.failures > 0) {
        return next(new ApiError(503, 'EXCHANGE_CREDENTIAL_REBIND_UNCONFIRMED', 'exchange', 'Open orders could not be fully confirmed before credential replacement.', 'Penggantian API dibatalkan karena open order lama belum dapat dipastikan batal. Bot tetap dijeda.'));
      }
    }

    const encrypted = encryptBotCredential({ ...credential, exchange: parsed.data.exchange, isSandbox: parsed.data.isSandbox });
    let saved;
    try {
      saved = await saveExchangeCredential({
        firebaseUid: uid,
        exchange: credential.exchange,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        sandbox: credential.isSandbox,
        identityKey: identity.identityKey,
        identityType: identity.identityType,
        identityHint: identity.identityHint,
        credentialFingerprint: identity.credentialFingerprint,
        reportedIdentityKey: identity.reportedIdentityKey,
      });
    } catch (error: any) {
      if (error?.code === 'EXCHANGE_ACCOUNT_ALREADY_LINKED') {
        return next(normalizeExchangeCredentialConflict(error));
      }
      throw error;
    }

    logAuditEvent(req, res, identityChanged ? 'bot.exchange.identity_rebound' : 'bot.credentials.updated', {
      uid,
      exchange: credential.exchange,
      storage: 'postgres_encrypted',
      identityType: identity.identityType,
      identityHint: identity.identityHint,
      exchangeAccountId: saved.exchangeAccountId || '',
      credentialVersion: saved.credentialVersion || 1,
      pausedRunnerCount: identityChanged ? ownedBots.length : 0,
    });
    res.json({
      success: true,
      exchange: credential.exchange,
      encryptedAtRest: true,
      exchangeAccountId: saved.exchangeAccountId,
      credentialVersion: saved.credentialVersion,
      identityType: identity.identityType,
      identityHint: identity.identityHint,
      reportedIdentityKey: saved.reportedIdentityKey,
      credentialStatus: 'ACTIVE',
      exchangeAccountStatus: 'ACTIVE',
      rebound: identityChanged,
    });
  } catch (error: any) {
    if (error?.code === 'EXCHANGE_ACCOUNT_ALREADY_LINKED') return next(normalizeExchangeCredentialConflict(error));
    next(error);
  }
});

app.get('/api/bot/credentials/history', async (req: Request, res: Response, next) => {
  try {
    const uid = res.locals.botUid as string;
    await requireSecuritySession(req, uid);
    requireDatabase();
    const exchange = typeof req.query.exchange === 'string' ? req.query.exchange : undefined;
    const history = await getExchangeCredentialHistory(uid, exchange);
    res.json({ success: true, history });
  } catch (error) {
    next(error);
  }
});

app.post('/api/bot/disconnect-exchange', async (req: Request, res: Response, next) => {
  try {
    const parsed = z.object({ exchange: z.string().trim().toLowerCase().pipe(z.enum(['binance', 'bitget', 'okx'])) }).safeParse(req.body);
    if (!parsed.success) {
      return next(new ApiError(400, 'EXCHANGE_INVALID', 'validation', 'Exchange is invalid.', 'Exchange tidak valid.'));
    }
    const uid = res.locals.botUid as string;
    await requireSecuritySession(req, uid);
    const ownedBots = selectOwnedBotEntries(Array.from(activeBotsRegistry.entries()), uid)
      .filter(([, bot]) => bot.exchange.toLowerCase() === parsed.data.exchange);
    await Promise.all(
      ownedBots.map(([, bot]) =>
        transitionBotLifecycle(
          bot,
          'paused',
          'EXCHANGE_DISCONNECTED',
        )
      )
    );
    const cancellation = await cancelBotOpenOrders(uid, ownedBots.map(([, bot]) => bot));
    if (cancellation.failures > 0) {
      return next(new ApiError(503, 'OPEN_ORDER_CANCELLATION_INCOMPLETE', 'exchange', 'Exchange open orders could not all be confirmed cancelled; credentials were retained.', 'Sebagian open order belum dapat dipastikan batal. Kredensial tetap disimpan dan bot dijeda agar dapat dicoba lagi.'));
    }
    requireDatabase();
    await deleteExchangeCredential(uid, parsed.data.exchange);
    logAuditEvent(req, res, 'bot.exchange.disconnected', {
      uid,
      exchange: parsed.data.exchange,
      pausedRunnerCount: ownedBots.length,
      cancelledOrderCount: cancellation.cancelled,
    });
    res.json({
      success: true,
      exchange: parsed.data.exchange,
      pausedRunnerCount: ownedBots.length,
      cancelledOrderCount: cancellation.cancelled,
      cancellationFailures: cancellation.failures,
      credentialsDeleted: true,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/bot/kill-switch', async (req: Request, res: Response, next) => {
  try {
    const uid = res.locals.botUid as string;
    await requireSecuritySession(req, uid);
    const ownedBots = selectOwnedBotEntries(Array.from(activeBotsRegistry.entries()), uid);
    await Promise.all(
      ownedBots.map(([, bot]) =>
        transitionBotLifecycle(
          bot,
          'paused',
          'KILL_SWITCH',
        )
      )
    );
    const cancellation = await cancelBotOpenOrders(uid, ownedBots.map(([, bot]) => bot));
    if (cancellation.failures > 0) {
      return next(new ApiError(503, 'OPEN_ORDER_CANCELLATION_INCOMPLETE', 'exchange', 'Exchange open orders could not all be confirmed cancelled; runners remain paused.', 'Sebagian open order belum dapat dipastikan batal. Bot tetap dijeda dan belum dihapus.'));
    }
    logAuditEvent(req, res, 'bot.kill_switch', {
      uid,
      pausedRunnerCount: ownedBots.length,
      cancelledOrderCount: cancellation.cancelled,
    });
    res.json({
      success: true,
      pausedRunnerCount: ownedBots.length,
      cancelledOrderCount: cancellation.cancelled,
      cancellationFailures: cancellation.failures,
    });
  } catch (error) {
    next(error);
  }
});

// API: Delete specific bot from background runner
app.post('/api/bot/delete', async (req: Request, res: Response, next) => {
  try {
    const parsed = z.object({ botId: z.string().trim().regex(/^[a-zA-Z0-9_-]{1,128}$/) }).safeParse(req.body);
    if (!parsed.success) {
      return next(new ApiError(400, 'BOT_ID_INVALID', 'validation', 'Bot id is invalid.', 'ID bot tidak valid.'));
    }
    const uid = res.locals.botUid as string;
    const ownedRunners = selectOwnedBotEntries(Array.from(activeBotsRegistry.entries()), uid)
      .filter(([, bot]) => bot.botId === parsed.data.botId || bot.id === parsed.data.botId);
    if (ownedRunners.length > 0) {
      await Promise.all(
        ownedRunners.map(([, bot]) =>
          transitionBotLifecycle(
            bot,
            'paused',
            'BOT_DELETED',
          )
        )
      );
      const cancellation = await cancelBotOpenOrders(uid, ownedRunners.map(([, bot]) => bot));
      if (cancellation.failures > 0) {
        return next(new ApiError(503, 'OPEN_ORDER_CANCELLATION_INCOMPLETE', 'exchange', 'Exchange open orders could not all be confirmed cancelled; runners remain paused.', 'Sebagian open order belum dapat dipastikan batal. Bot tetap dijeda dan belum dihapus.'));
      }
      await Promise.all(ownedRunners.map(([, bot]) => deletePersistedBotRunner(uid, bot.id)));
      ownedRunners.forEach(([key]) => activeBotsRegistry.delete(key));
      logAuditEvent(req, res, 'bot.deleted', { uid, botId: parsed.data.botId, found: true });
      return res.json({
        success: true,
        message: `Bot "${ownedRunners[0][1].botName || parsed.data.botId}" berhasil dihapus dari background engine.`,
        deletedRunnerCount: ownedRunners.length,
        cancellationFailures: cancellation.failures,
        activeCount: Array.from(activeBotsRegistry.values()).filter((bot) => bot.uid === uid).length,
      });
    }
    logAuditEvent(req, res, 'bot.deleted', { uid, botId: parsed.data.botId, found: false });
    res.json({ success: true, message: 'Bot id tidak ditemukan atau sudah dibersihkan.' });
  } catch (err: any) {
    return next(err);
  }
});

// API: Manually close the authoritative runtime position for one bot runner.
// The server owns credentials, quantity, market price, risk checks, and settlement.
// The frontend must never need to hold exchange credentials just to close a position.
app.post('/api/bot/force-take-profit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = z.object({
      botId: z.string().trim().regex(/^[a-zA-Z0-9_-]{1,128}$/),
      pair: z.string().trim().regex(/^[A-Z0-9]{2,12}\/[A-Z0-9]{2,10}$/).optional(),
      quantity: z.number().positive().optional(),
      layerId: z.string().trim().min(1).max(128).optional(),
    }).safeParse(req.body);
    if (!parsed.success) {
      return next(new ApiError(400, 'BOT_FORCE_TP_INVALID', 'validation', 'Manual position close request is invalid.', 'Permintaan penutupan posisi tidak valid.'));
    }

    const uid = res.locals.botUid as string;
    await requireSecuritySession(req, uid);
    const candidates = Array.from(activeBotsRegistry.values()).filter((candidate) => candidate.uid === uid);
    const target = (parsed.data.pair
      ? candidates.find((candidate) => candidate.pair === parsed.data.pair && (candidate.id === parsed.data.botId || candidate.botId === parsed.data.botId))
        || candidates.find((candidate) => candidate.pair === parsed.data.pair)
      : undefined)
      || candidates.find((candidate) => candidate.id === parsed.data.botId)
      || candidates.find((candidate) => candidate.botId === parsed.data.botId);

    if (!target) {
      return next(new ApiError(404, 'BOT_NOT_FOUND', 'not_found', 'The bot runner was not found.', 'Runner bot tidak ditemukan.'));
    }
    if (parsed.data.pair && parsed.data.pair !== target.pair) {
      return next(new ApiError(409, 'BOT_PAIR_MISMATCH', 'state', 'The requested pair does not match the authoritative runner.', 'Pasangan koin tidak cocok dengan runner yang tersimpan.'));
    }
    if (target.pendingOrder) {
      return next(new ApiError(409, 'BOT_ORDER_STATUS_UNCERTAIN', 'state', 'An order is still being reconciled. Try again after it reaches a terminal state.', 'Masih ada order yang sedang direkonsiliasi. Coba lagi setelah status order sudah pasti.'));
    }
    // Manual close is allowed for active, paused, or recovery runners as long as
    // the exchange position is authoritative. It must never restart the bot.
    if (!['active', 'paused', 'error'].includes(target.status)) {
      return next(new ApiError(409, 'BOT_NOT_CLOSEABLE', 'state', 'The bot is not in a closeable state.', 'Bot belum berada pada status yang dapat ditutup.'));
    }

    const requestedQty = parsed.data.quantity === undefined ? Number(target.positionQty) : Number(parsed.data.quantity);
    if (!(requestedQty > 0)) {
      return next(new ApiError(409, 'BOT_POSITION_EMPTY', 'state', 'There is no open position to close.', 'Tidak ada posisi terbuka yang bisa ditutup.'));
    }
    if (requestedQty > Number(target.positionQty) + 1e-12) {
      return next(new ApiError(409, 'BOT_CLOSE_QTY_EXCEEDS_POSITION', 'state', 'Requested close quantity exceeds the authoritative open position.', 'Jumlah yang akan ditutup melebihi posisi aktif.'));
    }

    if (target.resumeAfterReconciliation || target.status === 'error') {
      try {
        await reconcileLiveBotPosition(target);
        target.resumeAfterReconciliation = false;
        if (target.status === 'error') target.status = 'paused';
        await persistBotRunner(target);
      } catch (error) {
        return next(error);
      }
    }

    const manualLeaseAcquired = await acquireBotLeaseForManualClose(target);
    if (!manualLeaseAcquired) {
      return next(new ApiError(409, 'BOT_RUNNER_BUSY', 'state', 'The bot runner is busy in another execution cycle. Try again shortly.', 'Runner bot sedang sibuk menjalankan siklus lain. Coba lagi sebentar.'));
    }

    const freshPrice = await getPrice(target.exchange, target.pair, target.isSandbox);
    if (!(freshPrice.last > 0)) {
      return next(new ApiError(409, 'BOT_MARKET_PRICE_REQUIRED', 'exchange', 'A fresh market price is required before closing the position.', 'Harga pasar terbaru wajib tersedia sebelum posisi ditutup.'));
    }

    const fill = await executeBotMarketOrder(target, 'sell', requestedQty, freshPrice.last, freshPrice.timestamp, true);
    const dailyLossPausedBots = applyBotRealizedPnl(target, fill.filledQty, fill.fillPrice);
    for (const candidate of dailyLossPausedBots) {
      await transitionBotLifecycle(candidate, 'paused', 'RISK_DAILY_LOSS_LIMIT');
    }

    const gainPct = target.avgEntryPrice > 0
      ? ((fill.fillPrice - target.avgEntryPrice) / target.avgEntryPrice) * 100
      : 0;
    const updatedPosition = applySellFill({
      quantity: target.positionQty,
      averageEntryPrice: target.avgEntryPrice,
      realizedPnl: 0,
    }, fill.filledQty, fill.fillPrice);
    target.positionQty = updatedPosition.quantity;
    target.positionVersion = Number((target as any).positionVersion || 0) + 1;

    if (parsed.data.layerId) {
      const closedLayerIds = new Set(target.closedLayerIds || []);
      closedLayerIds.add(parsed.data.layerId);
      target.closedLayerIds = Array.from(closedLayerIds).slice(-200);
    }

    if (target.positionQty <= 1e-12) {
      target.positionQty = 0;
      target.avgEntryPrice = 0;
      target.stepLayer = 1;
      target.entryPrice = fill.fillPrice;
      target.peakPrice = fill.fillPrice;
      target.troughPrice = fill.fillPrice;
      target.pendingOrder = undefined;
      if (GAIN_V2_ENABLED && target.dcaLayers) {
        target.dcaLayers = generateDcaLayers({
          baseOrderUsd: target.baseAmount,
          stepDeviationPct: target.averageDownPct,
          stepScale: 1.25,
          volumeMultiplier: 1.3,
          maxLayers: Math.max(1, target.averagingLayers),
          maxCapitalUsd: target.useMoneyManagement !== false ? Math.min(V2_MAX_COMMITTED_CAPITAL_USDT, MAX_BOT_EXPOSURE_USDT) : Number.POSITIVE_INFINITY,
          takeProfitPct: target.baseTp,
          trailingTpPct: target.tpCallbackPct || 0.2,
          callbackPct: target.layerCallbackPct || 0.2,
          minPrice: target.minPrice,
          maxPrice: target.maxPrice,
        });
      }
      target.committedCapitalUsd = 0;
    } else {
      target.pendingOrder = undefined;
    }

    // A manual close is a user-directed exit, not an automatic TP cycle.
    // Pause the runner after a full manual close so the next engine tick cannot
    // immediately buy the same pair again.
    if (target.positionQty <= 1e-12) {
      target.status = 'paused';
      target.resumeAfterReconciliation = false;
      target.lastErrorReason = undefined;
    }

    const logItem: BotEngineLog = {
      id: `log-manual-tp-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      uid: target.uid,
      timestamp: Date.now(),
      pair: target.pair,
      botId: target.id,
      botName: target.botName,
      action: 'TAKE_PROFIT',
      details: `[${target.botName || target.pair}] MANUAL SELL ${fill.filledQty} @ ${fill.fillPrice} confirmed (${fill.orderId}) (${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(2)}%).`,
      price: fill.fillPrice,
      stepLayer: target.stepLayer,
    };
    botEngineLogs.unshift(logItem);
    if (botEngineLogs.length > 50) botEngineLogs.pop();
    await persistBotRunner(target);
    await persistBotLog(logItem);

    await releaseBotLease(target).catch(() => {});

    return res.json({
      success: true,
      mode: target.mode,
      runnerId: target.id,
      botId: target.botId,
      pair: target.pair,
      orderId: fill.orderId,
      filledQty: fill.filledQty,
      fillPrice: fill.fillPrice,
      avgEntryPrice: updatedPosition.averageEntryPrice,
      requestedQty,
      remainingQty: target.positionQty,
      layerId: parsed.data.layerId,
      roiPct: gainPct,
      recoveryState: getBotRecoveryStatus(target),
      message: `Posisi ${target.pair} berhasil ditutup pada harga pasar ${fill.fillPrice}.`,
    });
  } catch (error) {
    try {
      const uid = res.locals.botUid as string;
      const target = Array.from(activeBotsRegistry.values()).find((candidate) => candidate.uid === uid && (candidate.id === String(req.body?.botId || '') || (req.body?.pair && candidate.pair === String(req.body.pair))));
      if (target) await releaseBotLease(target);
    } catch {}
    return next(error);
  }
});

// API: Set status for one authenticated user's bot runner.
// Backend runner state is the lifecycle source of truth.
app.post('/api/bot/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = z.object({
      botId: z.string().trim().regex(/^[a-zA-Z0-9_-]{1,128}$/),
      status: z.enum(['active', 'paused']),
    }).safeParse(req.body);

    if (!parsed.success) {
      return next(new ApiError(
        400,
        'BOT_STATUS_INVALID',
        'validation',
        'Bot status request is invalid.',
        'Perintah status bot tidak valid.',
      ));
    }

    const uid = res.locals.botUid as string;
    await requireSecuritySession(req, uid);

    const ownedEntries = selectOwnedBotEntries(
      Array.from(activeBotsRegistry.entries()),
      uid,
    ).filter(([, bot]) => bot.botId === parsed.data.botId || bot.id === parsed.data.botId);

    if (ownedEntries.length === 0) {
      return next(new ApiError(
        404,
        'BOT_NOT_FOUND',
        'not_found',
        'Bot runner was not found for the authenticated user.',
        'Bot tidak ditemukan untuk akun Anda.',
      ));
    }

    const target = ownedEntries[0][1];
    const requestedStatus = parsed.data.status;
    if (requestedStatus === 'active' && target.mode === 'live') await requireActiveLicense(uid);

    // Never resume a runner whose order state is ambiguous.
    if (requestedStatus === 'active') {
      if (target.pendingOrder) {
        return next(new ApiError(
          409,
          'BOT_ORDER_STATUS_UNCERTAIN',
          'state',
          'Bot cannot be resumed while an order status is uncertain.',
          'Bot tidak dapat dilanjutkan karena masih ada order dengan status yang belum pasti.',
        ));
      }

      // Startup reconciliation owns this transition. Do not bypass it.
      if (target.resumeAfterReconciliation) {
        return next(new ApiError(
          409,
          'BOT_RECONCILIATION_PENDING',
          'state',
          'Bot is already waiting for reconciliation.',
          'Bot sedang menunggu proses rekonsiliasi.',
        ));
      }
    }

    const previousStatus = target.status;
    const previousErrorReason = target.lastErrorReason;

    // Keep PostgreSQL's bot registry synchronized with the runtime lifecycle.
    // If this fails, do not mutate the in-memory runner.
    await upsertBotRuntime({
      firebaseUid: uid,
      externalBotId: target.id,
      name: target.botName || target.pair,
      exchange: target.exchange,
      symbol: target.pair,
      strategyType: target.botMode,
      status: requestedStatus === 'active' ? 'ACTIVE' : 'STANDBY',
      mode: target.mode,
      config: {
        baseAmount: target.baseAmount,
        baseTp: target.baseTp,
        tpCallbackPct: target.tpCallbackPct,
        averageDownPct: target.averageDownPct,
        maxLayers: Math.max(
          Number(target.averagingLayers) || 0,
          Number(target.gridLayers) || 0,
        ),
        maxCapitalUsd: target.committedCapitalUsd || 0,
        minPrice: target.minPrice,
        maxPrice: target.maxPrice,
      },
    });

    await transitionBotLifecycle(
      target,
      requestedStatus,
      'USER_REQUEST',
    );

    logAuditEvent(
      req,
      res,
      requestedStatus === 'active' ? 'bot.resumed' : 'bot.paused',
      {
        uid,
        botId: target.botId,
        runnerId: target.id,
        previousStatus,
        status: requestedStatus,
        hadPreviousError: Boolean(previousErrorReason),
      },
    );

    return res.json({
      success: true,
      botId: target.botId,
      runnerId: target.id,
      status: target.status,
      resumeAfterReconciliation: target.resumeAfterReconciliation === true,
      lastErrorReason: target.lastErrorReason,
      message: requestedStatus === 'active'
        ? 'Bot berhasil dilanjutkan.'
        : 'Bot berhasil dijeda.',
    });
  } catch (error) {
    return next(error);
  }
});

// API: Run an exchange reconciliation for one authenticated bot without changing lifecycle state.
// This endpoint is intentionally read-only against the exchange: it fetches balance/open orders only.
app.post('/api/bot/reconcile', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = z.object({
      botId: z.string().trim().regex(/^[a-zA-Z0-9_-]{1,128}$/),
    }).safeParse(req.body);
    if (!parsed.success) {
      return next(new ApiError(400, 'BOT_ID_INVALID', 'validation', 'Bot id is invalid.', 'ID bot tidak valid.'));
    }

    const uid = res.locals.botUid as string;
    await requireSecuritySession(req, uid);
    const ownedEntries = selectOwnedBotEntries(
      Array.from(activeBotsRegistry.entries()),
      uid,
    ).filter(([, bot]) => bot.botId === parsed.data.botId || bot.id === parsed.data.botId);

    if (ownedEntries.length === 0) {
      return next(new ApiError(404, 'BOT_NOT_FOUND', 'not_found', 'Bot runner was not found for the authenticated user.', 'Bot tidak ditemukan untuk akun Anda.'));
    }

    const bot = ownedEntries[0][1];
    if (bot.pendingOrder && bot.pendingOrder.status !== 'filled') {
      return next(new ApiError(409, 'BOT_ORDER_STATUS_UNCERTAIN', 'state', 'Order status must be resolved before position reconciliation.', 'Status order belum pasti dan harus diselesaikan sebelum rekonsiliasi posisi.'));
    }

    await reconcileLiveBotPosition(bot);
    await persistBotRunner(bot);

    return res.json({
      success: true,
      runnerId: bot.id,
      botId: bot.botId,
      positionQty: bot.positionQty,
      lastReconciledAt: bot.lastReconciledAt,
      exchangeWrites: 0,
      recoveryState: getBotRecoveryStatus(bot),
      message: 'Rekonsiliasi exchange selesai. Lifecycle runner tidak diubah oleh endpoint ini.',
    });
  } catch (error) {
    return next(error);
  }
});

// API: Get background bot engine status & logs
app.get('/api/bot/engine-status', (_req: Request, res: Response) => {
  const uid = res.locals.botUid as string;
  const ownedBots = Array.from(activeBotsRegistry.values()).filter((bot) => bot.uid === uid);
  const botsList = ownedBots.map((b) => ({
    id: b.id,
    botId: b.botId,
    runnerId: b.id,
    botName: b.botName,
    pair: b.pair,
    mode: b.mode,
    strategy: b.botMode,
    stepLayer: b.stepLayer,
    maxLayers: b.averagingLayers,
    entryPrice: b.entryPrice,
    lastPrice: b.lastEvaluatedPrice,
    timeframe: b.timeframe,
    lastStrategyCandleTimestamp: b.lastStrategyCandleTimestamp || null,
    strategyPriceSource: 'CLOSED_CANDLE',
    strategySignalPrice: b.lastStrategySignalPrice || null,
    strategySignalCloseTimestamp: b.lastStrategyCandleTimestamp || null,
    status: b.status,
    positionQty: b.positionQty,
    avgEntryPrice: b.avgEntryPrice,
    realizedPnlToday: b.realizedPnlToday,
    lastErrorReason: b.lastErrorReason,
    resumeAfterReconciliation: b.resumeAfterReconciliation === true,
    startupAutoResumeEnabled: BOT_STARTUP_AUTO_RESUME,
    lastReconciledAt: b.lastReconciledAt,
    positionVersion: Number((b as any).positionVersion || 0),
    pendingOrderStatus: b.pendingOrder?.status || null,
    pendingClientOrderId: b.pendingOrder?.clientOrderId || null,
    pendingSide: b.pendingOrder?.side || null,
    pendingRequestedQty: b.pendingOrder?.requestedQty || null,
    pendingCreatedAt: b.pendingOrder?.createdAt || null,
    pendingExchangeOrderId: b.pendingOrder?.orderId || null,
    ...getBotRecoveryStatus(b),
    minPrice: b.minPrice,
    maxPrice: b.maxPrice,
    priceBoundaryStatus: b.priceBoundaryStatus,
  }));

  res.json({
    success: true,
    engineRunning: isEngineRunning,
    loopIntervalSec: GAIN_V2_ENABLED ? 1 : 15,
    startupAutoResumeEnabled: BOT_STARTUP_AUTO_RESUME,
    startupAutoResumePolicy: BOT_STARTUP_AUTO_RESUME ? 'OPT_IN_AUTO_RESUME' : 'MANUAL_RESUME_REQUIRED',
    activeBotsCount: botsList.filter((b) => b.status === 'active').length,
    totalRegisteredBots: botsList.length,
    bots: botsList,
    recentLogs: botEngineLogs.filter((log) => log.uid === uid).slice(0, 15),
  });
});

// API: Pause only the authenticated user's bots
app.post('/api/bot/pause-all', async (_req: Request, res: Response, next) => {
  try {
    const uid = res.locals.botUid as string;
    await requireSecuritySession(_req, uid);
    const ownedBots = selectOwnedBotEntries(Array.from(activeBotsRegistry.entries()), uid).map(([, bot]) => bot);
    await Promise.all(
      ownedBots.map((bot) =>
        transitionBotLifecycle(
          bot,
          'paused',
          'USER_PAUSE_ALL',
        )
      )
    );
    logAuditEvent(_req, res, 'bot.engine.paused', { uid });
    res.json({ success: true, message: 'Seluruh bot Anda berhasil dijeda.' });
  } catch (error) {
    next(error);
  }
});

// API: Resume only the authenticated user's bots
app.post('/api/bot/resume-all', async (_req: Request, res: Response, next) => {
  try {
    const uid = res.locals.botUid as string;
    await requireSecuritySession(_req, uid);
    const ownedBots = selectOwnedBotEntries(Array.from(activeBotsRegistry.entries()), uid).map(([, bot]) => bot);
    if (ownedBots.some((bot) => bot.mode === 'live' && !bot.pendingOrder && !bot.resumeAfterReconciliation)) {
      await requireActiveLicense(uid);
    }
    for (const bot of ownedBots) {
      if (bot.pendingOrder || bot.resumeAfterReconciliation) continue;
      await transitionBotLifecycle(bot, 'active', 'USER_REQUEST');
    }
    logAuditEvent(_req, res, 'bot.engine.resumed', { uid });
    res.json({ success: true, message: 'Bot tanpa order ambigu berhasil dilanjutkan.' });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/trading-kill-switch', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminUid = await requireAdmin(req);
    const requestedEnabled = req.body?.enabled === true;
    if (requestedEnabled && process.env.LIVE_TRADING_ENABLED !== 'true') return next(new ApiError(403,'LIVE_TRADING_ENV_DISABLED','security','Environment-level live trading gate is disabled.','LIVE_TRADING_ENABLED di environment masih false.'));
    const enabled = requestedEnabled;
    runtimeLiveTradingEnabled = enabled;
    await setSystemSetting('live_trading_enabled', { enabled }, adminUid);
    if (!enabled) {
      const owned = Array.from(activeBotsRegistry.values()).filter((bot) => bot.mode === 'live');
      await Promise.all(
        owned.map((bot) =>
          transitionBotLifecycle(
            bot,
            'paused',
            'GLOBAL_LIVE_TRADING_KILL_SWITCH',
          )
        )
      );
      const byUser = new Map<string, ActiveBotRunner[]>();
      owned.forEach((bot) => { const list = byUser.get(bot.uid) || []; list.push(bot); byUser.set(bot.uid, list); });
      for (const [uid, bots] of byUser) await cancelBotOpenOrders(uid, bots);
    }
    await createAuditEvent({ firebaseUid:adminUid, eventType:'admin.global_live_trading_toggle', payload:{ enabled } });
    res.json({ success:true, liveTradingEnabled:runtimeLiveTradingEnabled });
  } catch (error) { next(error); }
});

app.use('/api', (req: Request, _res: Response, next) => {
  next(new ApiError(404, 'API_ROUTE_NOT_FOUND', 'not_found', `API route not found: ${req.method} ${req.path}`, 'Endpoint tidak ditemukan.'));
});

// Boot server with Vite middleware
async function syncConfiguredAdminClaims(): Promise<void> {
  const emails = (process.env.ADMIN_EMAILS || '').split(',').map((v) => v.trim().toLowerCase()).filter(Boolean);
  if (!emails.length || !FIREBASE_ADMIN_CREDENTIALS_CONFIGURED) return;
  for (const email of emails) {
    try {
      const user = await firebaseAdminAuth.getUserByEmail(email);
      const claims = { ...(user.customClaims || {}), admin: true };
      await firebaseAdminAuth.setCustomUserClaims(user.uid, claims);
    } catch (error) {
      console.warn(JSON.stringify({ event:'auth.admin_claim_sync_failed', email, error:String((error as any)?.code || (error as any)?.message || 'unknown') }));
    }
  }
}

async function startServer() {
  await syncConfiguredAdminClaims();
  const dbHealth = await checkDatabase();
  databaseReady = dbHealth.ok;
  databaseFailureCode = dbHealth.ok ? undefined : (dbHealth.error || 'DATABASE_UNAVAILABLE');
  if (databaseReady) {
    try {
      // Exchange-account identity hardening. This is intentionally additive and
      // idempotent so existing local databases can upgrade without manual SQL.
      await dbQuery(`ALTER TABLE exchange_accounts ADD COLUMN IF NOT EXISTS identity_key text`);
      await dbQuery(`ALTER TABLE exchange_accounts ADD COLUMN IF NOT EXISTS identity_type text`);
      await dbQuery(`ALTER TABLE exchange_accounts ADD COLUMN IF NOT EXISTS identity_hint text`);
      await dbQuery(`ALTER TABLE exchange_accounts ADD COLUMN IF NOT EXISTS credential_fingerprint text`);
      await dbQuery(`ALTER TABLE exchange_accounts ADD COLUMN IF NOT EXISTS reported_identity_key text`);
      await dbQuery(`ALTER TABLE exchange_accounts ADD COLUMN IF NOT EXISTS credential_version integer NOT NULL DEFAULT 1`);
      await dbQuery(`CREATE TABLE IF NOT EXISTS exchange_credential_history (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, exchange text NOT NULL, sandbox boolean NOT NULL DEFAULT true, action text NOT NULL, previous_version integer, new_version integer NOT NULL, previous_credential_fingerprint text, new_credential_fingerprint text NOT NULL, previous_identity_key text, new_identity_key text NOT NULL, previous_reported_identity_key text, new_reported_identity_key text, previous_identity_type text, new_identity_type text, created_at timestamptz NOT NULL DEFAULT now())`);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_exchange_credential_history_user_time ON exchange_credential_history(user_id, created_at DESC)`);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_exchange_accounts_identity_lookup ON exchange_accounts(lower(exchange), sandbox, identity_key) WHERE status='ACTIVE' AND identity_key IS NOT NULL`);
      await dbQuery(`CREATE UNIQUE INDEX IF NOT EXISTS uq_exchange_accounts_active_identity ON exchange_accounts(lower(exchange), sandbox, identity_key) WHERE status='ACTIVE' AND identity_key IS NOT NULL`);
      await dbQuery(`CREATE UNIQUE INDEX IF NOT EXISTS uq_exchange_accounts_active_credential_fingerprint ON exchange_accounts(lower(exchange), sandbox, credential_fingerprint) WHERE status='ACTIVE' AND credential_fingerprint IS NOT NULL`);
      await dbQuery(`CREATE UNIQUE INDEX IF NOT EXISTS uq_exchange_accounts_active_reported_identity ON exchange_accounts(lower(exchange), sandbox, reported_identity_key) WHERE status='ACTIVE' AND reported_identity_key IS NOT NULL`);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_exchange_accounts_user_status ON exchange_accounts(user_id, status, updated_at DESC)`);
      await backfillExchangeAccountIdentityMetadata();
    } catch (error) {
      console.warn('[EXCHANGE_IDENTITY_SCHEMA_INIT_FAILED]', String((error as any)?.message || error));
    }
    try {
      // Durable OTP schema must match the runtime queries below: code_hash is BYTEA
      // and all timestamps are TIMESTAMPTZ. Older builds accidentally created
      // TEXT/BIGINT columns, which caused PostgreSQL 42883/42804 and made the
      // security session look unverified after a restart. Repair that schema
      // in-place before serving authentication requests.
      await dbQuery(`CREATE TABLE IF NOT EXISTS auth_verification_challenges (
        firebase_uid TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('login', 'email')),
        code_hash BYTEA NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        sent_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (firebase_uid, kind)
      )`);
      await dbQuery(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='auth_verification_challenges' AND column_name='code_hash' AND data_type <> 'bytea') THEN
            ALTER TABLE auth_verification_challenges
              ALTER COLUMN code_hash TYPE BYTEA USING decode(code_hash::text, 'hex');
          END IF;
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='auth_verification_challenges' AND column_name='expires_at' AND data_type <> 'timestamp with time zone') THEN
            ALTER TABLE auth_verification_challenges
              ALTER COLUMN expires_at TYPE TIMESTAMPTZ USING to_timestamp((expires_at::double precision) / 1000.0);
          END IF;
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='auth_verification_challenges' AND column_name='sent_at' AND data_type <> 'timestamp with time zone') THEN
            ALTER TABLE auth_verification_challenges
              ALTER COLUMN sent_at TYPE TIMESTAMPTZ USING to_timestamp((sent_at::double precision) / 1000.0);
          END IF;
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='auth_verification_challenges' AND column_name='updated_at' AND data_type <> 'timestamp with time zone') THEN
            ALTER TABLE auth_verification_challenges
              ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING to_timestamp((updated_at::double precision) / 1000.0);
          END IF;
        END $$;
      `);
      await dbQuery(`CREATE TABLE IF NOT EXISTS auth_session_elevations (
        token_hash TEXT PRIMARY KEY,
        firebase_uid TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
      // Repair older development databases that were created with BIGINT/TEXT
      // timestamps. A bad durable schema must never make a valid OTP login
      // impossible after logout or server restart.
      await dbQuery(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
             WHERE table_name='auth_session_elevations'
               AND column_name='expires_at'
               AND data_type <> 'timestamp with time zone'
          ) THEN
            ALTER TABLE auth_session_elevations
              ALTER COLUMN expires_at TYPE TIMESTAMPTZ
              USING to_timestamp((expires_at::double precision) / 1000.0);
          END IF;
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
             WHERE table_name='auth_session_elevations'
               AND column_name='created_at'
               AND data_type <> 'timestamp with time zone'
          ) THEN
            ALTER TABLE auth_session_elevations
              ALTER COLUMN created_at TYPE TIMESTAMPTZ
              USING to_timestamp((created_at::double precision) / 1000.0);
          END IF;
        END $$;
      `);
      await dbQuery(`CREATE INDEX IF NOT EXISTS idx_auth_session_elevations_uid_expires
        ON auth_session_elevations (firebase_uid, expires_at)`);
    } catch (error) {
      console.warn('[OTP_DURABLE_SCHEMA_INIT_FAILED]', String((error as any)?.message || error));
    }
    try { const persisted = await getSystemSetting<{enabled?:boolean}>('live_trading_enabled'); if (typeof persisted?.enabled === 'boolean') runtimeLiveTradingEnabled = process.env.LIVE_TRADING_ENABLED === 'true' && persisted.enabled; } catch (error) { console.warn('[LIVE_GATE_LOAD_FAILED]', String((error as any)?.message || error)); } }
  try {
    if (!databaseReady) throw Object.assign(new Error(databaseFailureCode), { code: databaseFailureCode });
    await restoreBotRunners();
    persistenceReady = true;
    persistenceFailureCode = undefined;
  } catch (error) {
    const errorCode = typeof (error as { code?: unknown })?.code === 'string'
      ? String((error as { code: string }).code).slice(0, 64)
      : 'BOT_STATE_RESTORE_FAILED';
    persistenceFailureCode = errorCode;
    console.error(JSON.stringify({
  event: 'bot.state.restore_failed',
  errorCode,
  errorName: error instanceof Error ? error.name : undefined,
  errorMessage: error instanceof Error ? error.message : String(error),
  errorStack: error instanceof Error ? error.stack : undefined,
}));
  }

  if (process.env.NODE_ENV !== 'production') {
    viteServer = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(viteServer.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.use(apiErrorHandler);

  httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`GAIN Server listening on 0.0.0.0:${PORT}; open http://localhost:${PORT}`);
    console.log(JSON.stringify({
      event: 'bot.startup.resume_policy',
      autoResumeEnabled: BOT_STARTUP_AUTO_RESUME,
      policy: BOT_STARTUP_AUTO_RESUME ? 'OPT_IN_AUTO_RESUME' : 'MANUAL_RESUME_REQUIRED',
      testSafeDefault: !BOT_STARTUP_AUTO_RESUME,
    }));
    if (persistenceReady) workerLoopTask = runBotWorkerLoop();
    if (databaseReady) {
      financialWorkerInterval = setInterval(() => {
        void processGasAutoRefills().then(async (results) => {
          for (const item of results || []) {
            await syncFirestoreWalletReadModel(String(item.firebaseUid));
            await createAuditEvent({firebaseUid:String(item.firebaseUid),eventType:'wallet.gas_auto_refill.completed',payload:{amount:item.amount,gasReserve:item.gasReserve}}).catch(() => {});
            await mirrorFinancialTransaction(String(item.firebaseUid), {id:`gas-auto-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,title:'Gas Auto-Refill',type:'gas',status:'Gas Tank',amount:item.amount,amountFormatted:`+${Number(item.amount).toFixed(6)} USDT`,network:'Internal Wallet'}).catch(() => {});
          }
        }).catch((error) => console.warn('[GAS_AUTO_REFILL_FAILED]', String((error as any)?.message || error)));
      }, 60_000);
    }
  });
}

let serverStopping = false;
async function shutdownServer(): Promise<void> {
  if (serverStopping) return;
  serverStopping = true;
  shutdownRequested = true;
  if (financialWorkerInterval) clearInterval(financialWorkerInterval);
  if (httpServer) {
    await new Promise<void>((resolve) => httpServer?.close(() => resolve()));
  }
  await workerLoopTask;
  // Do not persist activeBotsRegistry during shutdown. The in-memory runner
  // can be stale relative to a newer durable lifecycle/reconciliation state.
  await Promise.allSettled(Array.from(activeBotsRegistry.values()).map(releaseBotLease));
  await viteServer?.close();
}

process.once('SIGTERM', () => { void shutdownServer(); });
process.once('SIGINT', () => { void shutdownServer(); });

startServer().catch(() => {
  console.error(JSON.stringify({ event: 'server.start_failed' }));
  process.exitCode = 1;
});
