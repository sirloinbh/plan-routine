import { Pool, type PoolClient } from 'pg';

import { migrate as runMigrate, type Migration } from '../src/standard/migrations.js';

// Shared setup for the *.integration.test.ts files. They need a dedicated test DB with database/migrations
// applied; without TEST_DATABASE_URL each test is skipped (not passed).
export const url = process.env.TEST_DATABASE_URL;

// The runner takes the app's advisory lock key; tests use their own.
const lockKey = 581_900;
export const migrate = (db: Parameters<typeof runMigrate>[0], files: Migration[]) =>
  runMigrate(db, files, lockKey);

// Cleanup lives in finally blocks: pool.end() waits for checked-out clients, so it must run
// after release() regardless of hook order.
export async function withClient(run: (client: PoolClient, pool: Pool) => Promise<void>) {
  const pool = new Pool({ connectionString: url, max: 4 });
  try {
    const client = await pool.connect();
    try {
      await run(client, pool);
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}
