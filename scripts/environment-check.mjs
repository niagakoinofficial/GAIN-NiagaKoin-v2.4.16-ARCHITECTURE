#!/usr/bin/env node
import fs from 'node:fs';

const env = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
const values = new Map();
for (const line of env.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const m = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) values.set(m[1], m[2]);
}
const required = [
  'DATABASE_URL',
  'REDIS_URL',
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'ENCRYPTION_MASTER_KEY',
];
const placeholders = new Set(['', 'replace-me', 'your-firebase-project', 'your-firebase-project.firebaseapp.com', 'your-firebase-project.appspot.com', 'changeme']);
const missing = [];
const placeholder = [];
for (const key of required) {
  const value = values.get(key) ?? '';
  if (!value) missing.push(key);
  else if (placeholders.has(value)) placeholder.push(key);
}
const encryption = values.get('ENCRYPTION_MASTER_KEY') ?? '';
const errors = [];
if (fs.existsSync('.env.example') && !fs.existsSync('.env')) {
  // Report only; setup-local can create it.
}
if (encryption && Buffer.byteLength(encryption, 'utf8') !== 32) errors.push('ENCRYPTION_MASTER_KEY must be exactly 32 bytes for AES-256-GCM.');
const safeKeys = ['NODE_ENV','PORT','DATABASE_URL','REDIS_URL','REDIS_REQUIRED','LIVE_TRADING_ENABLED','LIVE_TRADING_TESTNET_ONLY','BOT_STARTUP_AUTO_RESUME','EXCHANGE_CERT_MICRO_LIVE_ENABLED'];
const summary = {};
for (const key of safeKeys) if (values.has(key)) summary[key] = key === 'DATABASE_URL' || key === 'REDIS_URL' ? '[configured]' : values.get(key);
const ok = missing.length === 0 && placeholder.length === 0 && errors.length === 0;
console.log(JSON.stringify({ ok, missing, placeholder, errors, safeSummary: summary }, null, 2));
process.exitCode = ok ? 0 : 1;
