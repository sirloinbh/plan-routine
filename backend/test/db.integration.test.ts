import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Pool, type PoolClient } from 'pg';
import { anchorSettingKey, routineAnchorDate } from '../src/routines.js';
import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

// Requires a dedicated test DB with database/migrations applied. Skipped (not passed) without it.
test(
  'baseline schema is applied and health answers against the real database',
  { skip: !url, timeout: 30_000 },
  async (t) => {
    const pool = new Pool({ connectionString: url });
    t.after(() => pool.end());
    const tables = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'app_settings'",
    );
    assert.equal(tables.rowCount, 1, 'Apply database/migrations/001_initial.sql to the test DB');
    await withApi(pool, async (call) => {
      const { status, data } = await call('/api/health');
      assert.equal(status, 200);
      assert.equal(data.ok, true);
    });
  },
);

const routinesMigration = new URL('../../database/migrations/002_routines.sql', import.meta.url);

// Cleanup lives in finally blocks: pool.end() waits for checked-out clients, so it must run
// after release() regardless of hook order.
async function withClient(run: (client: PoolClient, pool: Pool) => Promise<void>) {
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

test(
  'routines migration re-runs safely and enforces routine and check rules',
  { skip: !url, timeout: 30_000 },
  () =>
    withClient(async (client) => {
      await client.query(readFileSync(routinesMigration, 'utf8'));
      // Each rule runs in a rolled-back transaction so the test DB keeps no rows.
      const rejects = async (sql: string, code: string) => {
        await client.query('BEGIN');
        try {
          const { rows } = await client.query<{ id: string }>(
            "INSERT INTO routines (name, cadence, category) VALUES ('기상', 'daily', 'wake') RETURNING id",
          );
          await client.query(
            "INSERT INTO routine_checks (routine_id, period_start) VALUES ($1, '2026-10-22')",
            [rows[0].id],
          );
          await assert.rejects(client.query(sql.replaceAll(':id', rows[0].id)), { code });
        } finally {
          await client.query('ROLLBACK');
        }
      };
      await rejects("INSERT INTO routines (name, cadence) VALUES ('운동', 'daily')", '23514');
      await rejects(
        "INSERT INTO routines (name, cadence, category) VALUES ('청소', 'weekly', 'housework')",
        '23514',
      );
      await rejects("INSERT INTO routines (name, cadence) VALUES ('  ', 'weekly')", '23514');
      await rejects("INSERT INTO routines (name, cadence) VALUES ('월간', 'monthly')", '23514');
      await rejects(
        "INSERT INTO routine_checks (routine_id, period_start) VALUES (:id, '2026-10-22')",
        '23505',
      );
      await rejects('DELETE FROM routines WHERE id = :id', '23503');
    }),
);

test(
  'the first-use date is stored once and kept on later calls',
  { skip: !url, timeout: 30_000 },
  () =>
    withClient(async (client) => {
      await client.query('BEGIN');
      try {
        await client.query('DELETE FROM app_settings WHERE key = $1', [anchorSettingKey]);
        const db = client as unknown as Pool;
        assert.equal(await routineAnchorDate(db, '2026-10-22'), '2026-10-22');
        assert.equal(await routineAnchorDate(db, '2026-11-20'), '2026-10-22');
      } finally {
        await client.query('ROLLBACK');
      }
    }),
);

test('simultaneous first calls agree on one first-use date', { skip: !url, timeout: 30_000 }, () =>
  withClient(async (client, pool) => {
    // Separate connections cannot share a rolled-back transaction, so restore the original row.
    const original = await client.query<{ value: string }>(
      'SELECT value FROM app_settings WHERE key = $1',
      [anchorSettingKey],
    );
    await client.query('DELETE FROM app_settings WHERE key = $1', [anchorSettingKey]);
    try {
      // One connection is held here, so the pool's other three run the calls concurrently.
      const dates = await Promise.all(
        ['2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'].map((today) =>
          routineAnchorDate(pool, today),
        ),
      );
      assert.equal(new Set(dates).size, 1);
    } finally {
      await client.query('DELETE FROM app_settings WHERE key = $1', [anchorSettingKey]);
      if (original.rows[0])
        await client.query('INSERT INTO app_settings (key, value) VALUES ($1, $2)', [
          anchorSettingKey,
          original.rows[0].value,
        ]);
    }
  }),
);
