import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(root, 'db', 'migrations');

if (!process.env.DATABASE_URL) {
  console.error(JSON.stringify({ ok: false, code: 'DATABASE_NOT_CONFIGURED', message: 'DATABASE_URL is required.' }));
  process.exit(2);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 4,
  connectionTimeoutMillis: 5000,
  ssl: process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
    : undefined,
});

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now(),
      checksum text NOT NULL
    )
  `);

  const files = (await fs.readdir(migrationsDir))
    .filter((name) => /^\d+_.*\.sql$/.test(name))
    .sort();

  const applied = new Map((await pool.query('SELECT version, checksum FROM schema_migrations ORDER BY version')).rows.map((r) => [r.version, r.checksum]));
  const report = [];

  for (const file of files) {
    const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
    const checksum = (await import('node:crypto')).createHash('sha256').update(sql).digest('hex');
    const version = file.replace(/\.sql$/, '');
    if (applied.has(version)) {
      if (applied.get(version) !== checksum) throw new Error(`MIGRATION_CHECKSUM_MISMATCH:${version}`);
      report.push({ version, status: 'already_applied' });
      continue;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(version, checksum) VALUES ($1,$2)', [version, checksum]);
      await client.query('COMMIT');
      report.push({ version, status: 'applied' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  console.log(JSON.stringify({ ok: true, migrations: report }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, code: error?.code || 'MIGRATION_FAILED', message: String(error?.message || error).slice(0, 500) }, null, 2));
  process.exitCode = 1;
} finally {
  await pool.end();
}
