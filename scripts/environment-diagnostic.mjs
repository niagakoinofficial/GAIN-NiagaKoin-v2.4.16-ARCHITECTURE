import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import dotenv from 'dotenv';

let siblingEnvFiles = [];
try {
  const parent = path.resolve(process.cwd(), '..');
  siblingEnvFiles = fs.readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('gain-niagakoin-v4-'))
    .map((entry) => path.join(parent, entry.name, '.env'));
} catch {}
const candidates = [
  process.env.GAIN24_ENV_FILE,
  path.resolve(process.cwd(), '.env'),
  ...siblingEnvFiles,
].filter(Boolean);
const envFile = candidates.find((p) => fs.existsSync(p));
if (envFile) dotenv.config({ path: envFile });

const results = [];
const pass = (name, detail = {}) => results.push({ name, status: 'PASS', ...detail });
const fail = (name, error) => results.push({ name, status: 'FAIL', error: String(error?.message || error).slice(0, 300) });
const blocked = (name, reason) => results.push({ name, status: 'BLOCKED', reason });
const configured = (key) => Boolean(process.env[key]);

if (envFile) pass('env-file', { found: true }); else blocked('env-file', 'No .env file found; use GAIN24_ENV_FILE if needed');
pass('config-presence', {
  databaseUrl: configured('DATABASE_URL'),
  redisUrl: configured('REDIS_URL'),
  encryptionMasterKey: configured('ENCRYPTION_MASTER_KEY'),
  firebaseProjectId: Boolean(process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID),
  googleApplicationCredentials: configured('GOOGLE_APPLICATION_CREDENTIALS'),
});

try {
  const out = execFileSync('docker', ['ps', '--format', '{{.Names}}|{{.Status}}|{{.Ports}}'], { encoding: 'utf8', timeout: 5000 });
  const lines = out.trim() ? out.trim().split('\n') : [];
  pass('docker', { installed: true, containers: lines.map((line) => line.split('|')[0]).filter(Boolean) });
} catch (error) { blocked('docker', 'Docker CLI unavailable or daemon not reachable'); }

try {
  const out = execFileSync('docker', ['volume', 'ls', '--format', '{{.Name}}'], { encoding: 'utf8', timeout: 5000 });
  const volumes = out.trim() ? out.trim().split('\n') : [];
  pass('docker-volumes', { volumes: volumes.filter((v) => /gain.*(pg|postgres|redis)|postgres|redis/i.test(v)) });
} catch { blocked('docker-volumes', 'Docker volume metadata unavailable'); }

console.log(JSON.stringify({ readOnly: true, exchangeWrites: 0, envFile: envFile || null, results }, null, 2));
