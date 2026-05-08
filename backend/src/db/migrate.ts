/**
 * Database migration runner.
 *
 * All migration SQL files live in ./migrations/ and are named NNN_description.sql.
 * They are designed to be idempotent (IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, etc.)
 * so running them twice is safe.
 *
 * On first startup of an existing installation (users table present, schema_migrations
 * absent) every migration file is stamped as applied without executing it — the
 * schema is already up to date from the docker-entrypoint-initdb.d scripts.
 * Only migrations added AFTER the initial stamp will actually run SQL.
 */

import fs from 'fs';
import path from 'path';
import { Pool, PoolClient } from 'pg';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureMigrationsTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id       SERIAL PRIMARY KEY,
      version  VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function isExistingInstall(client: PoolClient): Promise<boolean> {
  const res = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'users'
    ) AS exists
  `);
  return res.rows[0].exists === true;
}

async function appliedVersions(client: PoolClient): Promise<Set<string>> {
  const res = await client.query('SELECT version FROM schema_migrations ORDER BY version');
  return new Set(res.rows.map((r: { version: string }) => r.version));
}

export async function runMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureMigrationsTable(client);

    const applied = await appliedVersions(client);
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      await client.query('COMMIT');
      return;
    }

    // If users table exists but nothing has been stamped yet, this is an
    // existing installation that predates the migration system. Stamp ALL
    // migration files as applied without running them so only genuinely new
    // migrations run on subsequent deployments.
    const freshMigrations = applied.size === 0;
    const existingDb     = await isExistingInstall(client);

    if (freshMigrations && existingDb) {
      for (const file of files) {
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING',
          [file]
        );
        console.log(`[migrations] Stamped (existing DB): ${file}`);
      }
      await client.query('COMMIT');
      console.log(`[migrations] Stamped ${files.length} baseline migration(s)`);
      return;
    }

    let ran = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`[migrations] Applying ${file} …`);
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (version) VALUES ($1)',
        [file]
      );
      console.log(`[migrations] Applied  ${file}`);
      ran++;
    }

    await client.query('COMMIT');
    if (ran > 0) console.log(`[migrations] ${ran} migration(s) applied`);
    else          console.log(`[migrations] Up to date`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
