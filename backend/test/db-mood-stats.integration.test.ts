import assert from 'node:assert/strict';
import { test } from 'node:test';

import { url, withClient } from './db-helpers.js';
import { withApi } from './helpers.js';

test(
  'a skipped routine-day leaves the week expected count, and the check count stays',
  { skip: !url, timeout: 30_000 },
  () =>
    withClient(async (client, pool) => {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO routines (name, cadence, category, created_at)
         VALUES ('Mood stats skip test', 'daily', 'care', '2026-01-01T00:00:00Z') RETURNING id`,
      );
      const id = rows[0].id;
      try {
        await withApi(
          pool,
          async (call) => {
            const lastWeek = async () => {
              const { data } = await call('/api/mood-stats');
              const weeks = data.weeks as { start: string; checked: number; total: number }[];
              return weeks.find((week) => week.start === '2026-10-18')!;
            };
            await client.query(
              `INSERT INTO routine_checks (routine_id, period_start) VALUES ($1, '2026-10-20')`,
              [id],
            );
            const before = await lastWeek();
            await client.query(
              `INSERT INTO routine_skips (routine_id, period_start) VALUES ($1, '2026-10-19')`,
              [id],
            );
            const after = await lastWeek();
            assert.equal(after.total, before.total - 1);
            assert.equal(after.checked, before.checked);
          },
          { today: () => '2026-10-22' },
        );
      } finally {
        await client.query('DELETE FROM routine_skips WHERE routine_id = $1', [id]);
        await client.query('DELETE FROM routine_checks WHERE routine_id = $1', [id]);
        await client.query('DELETE FROM routines WHERE id = $1', [id]);
      }
    }),
);

test(
  'today counts only routines already done, so the week matches the stats page',
  { skip: !url, timeout: 30_000 },
  () =>
    withClient(async (client, pool) => {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO routines (name, cadence, category, created_at)
         VALUES ('Mood stats open day test', 'daily', 'care', '2026-01-01T00:00:00Z') RETURNING id`,
      );
      const id = rows[0].id;
      try {
        await withApi(
          pool,
          async (call) => {
            const lastWeek = async () => {
              const { data } = await call('/api/mood-stats');
              const weeks = data.weeks as { start: string; checked: number; total: number }[];
              return weeks.find((week) => week.start === '2026-10-18')!;
            };
            const open = await lastWeek();
            await client.query(
              `INSERT INTO routine_checks (routine_id, period_start) VALUES ($1, '2026-10-22')`,
              [id],
            );
            const done = await lastWeek();
            // Unchecked today is not expected yet; once checked it counts as done and as expected.
            assert.equal(done.total, open.total + 1);
            assert.equal(done.checked, open.checked + 1);
          },
          { today: () => '2026-10-22' },
        );
      } finally {
        await client.query('DELETE FROM routine_checks WHERE routine_id = $1', [id]);
        await client.query('DELETE FROM routines WHERE id = $1', [id]);
      }
    }),
);
