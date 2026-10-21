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

test(
  'daily routines are added, renamed, reordered and archived against the real DB',
  { skip: !url, timeout: 30_000 },
  () =>
    withClient(async (client, pool) => {
      const original = await client.query<{ value: string }>(
        'SELECT value FROM app_settings WHERE key = $1',
        [anchorSettingKey],
      );
      const created: string[] = [];
      try {
        await withApi(
          pool,
          async (call) => {
            for (const name of ['6시 기상', '물 한 잔', '스트레칭']) {
              const { status, data } = await call('/api/routines', {
                method: 'POST',
                body: { name, cadence: 'daily', category: 'wake' },
              });
              assert.equal(status, 201);
              created.push((data.routine as { id: string }).id);
            }
            const names = async () => {
              const { data } = await call('/api/routines?cadence=daily');
              return (data.routines as { id: string; name: string }[])
                .filter((routine) => created.includes(routine.id))
                .map((routine) => routine.name);
            };
            assert.deepEqual(await names(), ['6시 기상', '물 한 잔', '스트레칭']);
            // Adding a routine records the first-use date (or keeps an existing one).
            const anchor = await client.query<{ value: string }>(
              'SELECT value FROM app_settings WHERE key = $1',
              [anchorSettingKey],
            );
            assert.equal(anchor.rows[0]?.value, original.rows[0]?.value ?? '2026-10-22');

            const moved = await call(`/api/routines/${created[2]}/move`, {
              method: 'POST',
              body: { direction: 'up' },
            });
            assert.equal(moved.status, 200);
            assert.deepEqual(await names(), ['6시 기상', '스트레칭', '물 한 잔']);
            // Moving the first item up leaves the order unchanged.
            await call(`/api/routines/${created[0]}/move`, {
              method: 'POST',
              body: { direction: 'up' },
            });
            assert.deepEqual(await names(), ['6시 기상', '스트레칭', '물 한 잔']);

            const renamed = await call(`/api/routines/${created[0]}`, {
              method: 'PATCH',
              body: { name: '6시 30분 기상' },
            });
            assert.equal(renamed.status, 200);

            await client.query(
              "INSERT INTO routine_checks (routine_id, period_start) VALUES ($1, '2026-10-22')",
              [created[1]],
            );
            const archived = await call(`/api/routines/${created[1]}/archive`, { method: 'POST' });
            assert.equal(archived.status, 200);
            assert.deepEqual(await names(), ['6시 30분 기상', '스트레칭']);
            // The archived routine keeps its check and can no longer be changed.
            const checks = await client.query(
              'SELECT 1 FROM routine_checks WHERE routine_id = $1',
              [created[1]],
            );
            assert.equal(checks.rowCount, 1);
            const again = await call(`/api/routines/${created[1]}/move`, {
              method: 'POST',
              body: { direction: 'down' },
            });
            assert.equal(again.status, 404);
          },
          { today: () => '2026-10-22' },
        );
      } finally {
        await client.query('DELETE FROM routine_checks WHERE routine_id = ANY($1::bigint[])', [
          created,
        ]);
        await client.query('DELETE FROM routines WHERE id = ANY($1::bigint[])', [created]);
        await client.query('DELETE FROM app_settings WHERE key = $1', [anchorSettingKey]);
        if (original.rows[0])
          await client.query('INSERT INTO app_settings (key, value) VALUES ($1, $2)', [
            anchorSettingKey,
            original.rows[0].value,
          ]);
      }
    }),
);
