import assert from 'node:assert/strict';
import { test } from 'node:test';

import { url, withClient } from './db-helpers.js';
import { withApi } from './helpers.js';

// Rows of every table are counted as the export sees them, so this holds for a table added later too.
test(
  'the JSON export holds every row of every table, checked against seeded data',
  { skip: !url, timeout: 30_000 },
  () =>
    withClient(async (client, pool) => {
      await client.query('BEGIN');
      try {
        const { rows } = await client.query<{ id: number }>(
          `INSERT INTO routines (name, cadence, category) VALUES ('Export test', 'daily', 'care') RETURNING id`,
        );
        await client.query(
          `INSERT INTO routine_checks (routine_id, period_start) VALUES ($1, '2001-02-03')`,
          [rows[0].id],
        );
        await client.query(
          `INSERT INTO diary_entries (entry_date, body, mood) VALUES ('2001-02-03', 'Export diary', 3)`,
        );
        // The test API uses its own pool, so it cannot see this transaction: commit, then clean up.
        await client.query('COMMIT');
        await withApi(pool, async (call) => {
          const { status, data } = await call('/api/export');
          assert.equal(status, 200);
          const tables = data.tables as Record<string, Record<string, unknown>[]>;
          const names = await client.query<{ name: string }>(
            `SELECT table_name AS name FROM information_schema.tables
             WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> 'schema_migrations'`,
          );
          assert.deepEqual(Object.keys(tables).sort(), names.rows.map((row) => row.name).sort());
          // Tables other work added must be there too.
          for (const name of ['weekly_reviews', 'routine_skips']) assert.ok(name in tables, name);
          for (const { name } of names.rows) {
            const count = await client.query<{ n: number }>(
              `SELECT count(*)::int AS n FROM "${name}"`,
            );
            assert.equal(tables[name].length, count.rows[0].n, name);
          }
          assert.ok(tables.routines.some((row) => row.name === 'Export test'));
          assert.ok(
            tables.diary_entries.some((row) => row.body === 'Export diary' && row.mood === 3),
          );
        });
      } finally {
        await client.query('ROLLBACK').catch(() => undefined);
        await client.query(`DELETE FROM routine_checks WHERE period_start = '2001-02-03'`);
        await client.query(`DELETE FROM diary_entries WHERE entry_date = '2001-02-03'`);
        await client.query(`DELETE FROM routines WHERE name = 'Export test'`);
      }
    }),
);

test(
  'checks.csv holds amounts with their unit and skipped periods with their reason',
  { skip: !url, timeout: 30_000 },
  () =>
    withClient(async (client, pool) => {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO routines (name, cadence, category, unit) VALUES ('Export csv test', 'daily', 'study', 'pages') RETURNING id`,
      );
      const id = rows[0].id;
      try {
        await client.query(
          `INSERT INTO routine_checks (routine_id, period_start, amount) VALUES ($1, '2001-02-03', 12.5)`,
          [id],
        );
        await client.query(
          `INSERT INTO routine_skips (routine_id, period_start, reason) VALUES ($1, '2001-02-04', 'Sick')`,
          [id],
        );
        await withApi(pool, async (call) => {
          const { status, text } = await call('/api/export/checks.csv');
          assert.equal(status, 200);
          // fetch's text() drops the byte order mark, which the route test checks.
          const lines = text.split('\r\n');
          assert.equal(
            lines[0],
            'date,routine,cadence,category,checked_at,status,amount,unit,skip_reason',
          );
          const mine = lines.filter((line) => line.includes('Export csv test'));
          assert.equal(mine.length, 2);
          assert.match(mine[0], /^2001-02-03,Export csv test,daily,study,[^,]+,done,12\.5,pages,$/);
          assert.equal(mine[1], '2001-02-04,Export csv test,daily,study,,skipped,,pages,Sick');
        });
      } finally {
        await client.query('DELETE FROM routine_skips WHERE routine_id = $1', [id]);
        await client.query('DELETE FROM routine_checks WHERE routine_id = $1', [id]);
        await client.query('DELETE FROM routines WHERE id = $1', [id]);
      }
    }),
);
