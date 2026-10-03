import 'dotenv/config';
import process from 'node:process';
import { Pool } from 'pg';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  await pool.query(`DELETE FROM bot_runtime_snapshots WHERE created_at < now() - interval '180 days'`);
  console.log(JSON.stringify({ success: true, policy: 'operational-only', financialRecordsUntouched: true }));
} finally {
  await pool.end();
}
