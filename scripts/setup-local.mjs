#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';

const envPath = '.env';
const templatePath = '.env.example';

if (!fs.existsSync(templatePath)) {
  console.error('Missing .env.example');
  process.exit(1);
}

if (fs.existsSync(envPath)) {
  console.log(JSON.stringify({ ok: true, action: 'unchanged', file: '.env', message: '.env already exists; nothing was overwritten.' }, null, 2));
  process.exit(0);
}

let content = fs.readFileSync(templatePath, 'utf8');
const localKey = crypto.randomBytes(24).toString('base64url').slice(0, 32);
const processorSecret = crypto.randomBytes(24).toString('base64url');
content = content.replace(/^ENCRYPTION_MASTER_KEY=.*$/m, `ENCRYPTION_MASTER_KEY=${localKey}`);
content = content.replace(/^WITHDRAWAL_PROCESSOR_SECRET=.*$/m, `WITHDRAWAL_PROCESSOR_SECRET=${processorSecret}`);
fs.writeFileSync(envPath, content);
console.log(JSON.stringify({ ok: true, action: 'created', file: '.env', generated: ['ENCRYPTION_MASTER_KEY', 'WITHDRAWAL_PROCESSOR_SECRET'], note: 'Firebase and exchange credentials remain explicit configuration items.' }, null, 2));
