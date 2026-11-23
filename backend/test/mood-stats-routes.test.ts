import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { buildMoodWeeks, moodWeeks } from '../src/mood-stats-routes.js';
import { withApi } from './helpers.js';

// 2026-10-22 is a Thursday; its week runs Sunday 2026-10-18 to Saturday 2026-10-24, as on the stats page.
const today = '2026-10-22';

test('weeks run Sunday to Saturday, oldest first, and end with the current week', () => {
  const weeks = buildMoodWeeks(today, [], []);
  assert.equal(weeks.length, moodWeeks);
  assert.equal(weeks[0].start, '2026-08-02');
  assert.deepEqual([weeks.at(-1)!.start, weeks.at(-1)!.end], ['2026-10-18', '2026-10-24']);
  assert.deepEqual(weeks[0], {
    start: '2026-08-02',
    end: '2026-08-08',
    checked: 0,
    total: 0,
    mood: null,
    energy: null,
    moodDays: 0,
    energyDays: 0,
  });
});

test('a week averages the scores it has to one decimal and sums its daily checks', () => {
  const weeks = buildMoodWeeks(
    today,
    [
      { date: '2026-10-18', checked: 2, total: 3 },
      { date: '2026-10-19', checked: 3, total: 3 },
      { date: '2026-10-11', checked: 1, total: 4 },
    ],
    [
      { date: '2026-10-18', mood: 4, energy: null },
      { date: '2026-10-19', mood: 3, energy: 2 },
      { date: '2026-10-21', mood: 3, energy: 5 },
    ],
  );
  const current = weeks.at(-1)!;
  assert.deepEqual(
    [
      current.checked,
      current.total,
      current.mood,
      current.energy,
      current.moodDays,
      current.energyDays,
    ],
    [5, 6, 3.3, 3.5, 3, 2],
  );
  const previous = weeks.at(-2)!;
  assert.deepEqual([previous.checked, previous.total, previous.mood], [1, 4, null]);
});

test('the route reads the days and the scores of the last 12 weeks', async () => {
  const queries: { sql: string; params: unknown[] }[] = [];
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      return {
        rows: sql.includes('diary_entries')
          ? [{ date: '2026-10-21', mood: 5, energy: 1 }]
          : [{ date: '2026-10-21', checked: 1, total: 2 }],
      };
    },
  } as unknown as Pool;
  await withApi(
    pool,
    async (call) => {
      const { status, data } = await call('/api/mood-stats');
      assert.equal(status, 200);
      assert.equal(data.today, today);
      const weeks = data.weeks as { mood: number | null; checked: number }[];
      assert.equal(weeks.length, moodWeeks);
      assert.deepEqual([weeks.at(-1)!.mood, weeks.at(-1)!.checked], [5, 1]);
    },
    { today: () => today },
  );
  assert.deepEqual(queries[0].params, ['2026-08-02', today]);
  assert.deepEqual(queries[1].params, ['2026-08-02', today]);
});

test('skipped routine-days are left out of the expected count, as on the records page', async () => {
  const queries: string[] = [];
  const pool = {
    query: async (sql: string) => {
      queries.push(sql);
      return { rows: [] };
    },
  } as unknown as Pool;
  await withApi(pool, async (call) => assert.equal((await call('/api/mood-stats')).status, 200), {
    today: () => today,
  });
  assert.match(queries[0], /NOT EXISTS \(\s*SELECT 1 FROM routine_skips/);
});

test('today counts only routines already done, as on the stats page', async () => {
  const queries: { sql: string; params: unknown[] }[] = [];
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      return { rows: [] };
    },
  } as unknown as Pool;
  await withApi(pool, async (call) => assert.equal((await call('/api/mood-stats')).status, 200), {
    today: () => today,
  });
  // The days query binds today as $2 and keeps a day before it, or a routine with a check that day.
  assert.match(
    queries[0].sql,
    /days\.date < \$2::date OR EXISTS \(\s*SELECT 1 FROM routine_checks/,
  );
  assert.equal(queries[0].params[1], today);
});
