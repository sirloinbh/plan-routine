import assert from 'node:assert/strict';
import { test } from 'node:test';

import { url, withClient } from './db-helpers.js';
import { withApi } from './helpers.js';

test(
  'the diary lists a skipped routine as skipped with its reason and leaves it out of the total',
  { skip: !url, timeout: 30_000 },
  () =>
    withClient(async (client, pool) => {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO routines (name, cadence, category, created_at)
         VALUES ('Diary skip test', 'daily', 'care', '2026-01-01T00:00:00Z') RETURNING id`,
      );
      const id = rows[0].id;
      try {
        await withApi(
          pool,
          async (call) => {
            type Day = {
              progress: { total: number };
              routines: {
                id: number;
                checked: boolean;
                skipped: boolean;
                skipReason: string | null;
              }[];
            };
            const day = async () =>
              (await call('/api/diary?date=2026-10-19')).data as unknown as Day;
            const before = await day();
            assert.deepEqual(
              before.routines.find((routine) => routine.id === id),
              {
                id,
                name: 'Diary skip test',
                category: 'care',
                checked: false,
                skipped: false,
                skipReason: null,
              },
            );
            await client.query(
              `INSERT INTO routine_skips (routine_id, period_start, reason) VALUES ($1, '2026-10-19', 'Sick in bed')`,
              [id],
            );
            const after = await day();
            const routine = after.routines.find((item) => item.id === id)!;
            assert.deepEqual(
              [routine.checked, routine.skipped, routine.skipReason],
              [false, true, 'Sick in bed'],
            );
            assert.equal(after.progress.total, before.progress.total - 1);
          },
          { today: () => '2026-10-22' },
        );
      } finally {
        await client.query('DELETE FROM routine_skips WHERE routine_id = $1', [id]);
        await client.query('DELETE FROM routines WHERE id = $1', [id]);
      }
    }),
);
