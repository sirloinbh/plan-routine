import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { Pool } from 'pg';

// deploy/remote-deploy.sh runs this as dist/migrate.js with the files mounted here.
const defaultDirectory = '/database/migrations';

// Any fixed number, so that only one run applies migrations at a time.
const migrationLock = 7_205_001;

/**
 * Applies every migration in file order, each in its own transaction. Every file is safe to run
 * again (database/README.md), so nothing records what has run. A failure stops the run and leaves
 * the failing file unapplied.
 */
export async function applyMigrations(pool: Pool, directory: string) {
  const files = readdirSync(directory)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  if (files.length === 0) throw new Error(`No migrations found in ${directory}`);
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [migrationLock]);
    for (const file of files) {
      await client.query('BEGIN');
      try {
        await client.query(readFileSync(join(directory, file), 'utf8'));
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(
          `Migration ${file} failed: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
    }
    return files;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [migrationLock]).catch(() => {});
    client.release();
  }
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const files = await applyMigrations(pool, process.env.MIGRATIONS_DIR ?? defaultDirectory);
    console.log(JSON.stringify({ event: 'migrations_applied', files }));
  } finally {
    await pool.end();
  }
}

// Only when run as a program, so tests can import this file.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(
      JSON.stringify({
        event: 'migrations_failed',
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  });
}
