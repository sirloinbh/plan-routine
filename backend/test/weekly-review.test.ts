import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { buildStats } from '../src/routine-stats.js';
import { buildWeeklyReview, type ReviewRoutine } from '../src/weekly-review.js';
import { withApi } from './helpers.js';

const routine = (
  id: number,
  name: string,
  cadence: 'daily' | 'weekly' | 'four_week',
  extra: Partial<ReviewRoutine> = {},
): ReviewRoutine => ({
  id,
  name,
  cadence,
  category: cadence === 'daily' ? 'study' : null,
  sortOrder: id,
  createdOn: '2026-01-01',
  archivedOn: null,
  ...extra,
});
const check = (routineId: number, periodStart: string) => ({ routineId, periodStart });

// Week Sun 2026-10-11 to Sat 2026-10-17, long over on 2026-10-22.
const week = '2026-10-11';
const today = '2026-10-22';

test('the rate counts daily days and weekly weeks; the most-missed come first, three at most', () => {
  const routines = [
    routine(1, 'Read', 'daily'),
    routine(2, 'Run', 'daily'),
    routine(3, 'Clean', 'weekly'),
    routine(4, 'Stretch', 'daily'),
    routine(5, 'Journal', 'daily'),
    routine(6, 'Every four weeks', 'four_week'),
  ];
  const checks = [
    // Read: 7 of 7. Run: 3 of 7. Stretch: 5 of 7. Journal: 4 of 7. Clean: done.
    ...Array.from({ length: 7 }, (_, i) => check(1, `2026-10-${11 + i}`)),
    ...[11, 12, 13].map((d) => check(2, `2026-10-${d}`)),
    ...[11, 12, 13, 14, 15].map((d) => check(4, `2026-10-${d}`)),
    ...[11, 12, 13, 14].map((d) => check(5, `2026-10-${d}`)),
    check(3, week),
    check(6, week),
  ];
  const review = buildWeeklyReview({ weekStart: week, today, routines, checks });
  assert.deepEqual(review.rate, { checked: 7 + 3 + 1 + 5 + 4, total: 7 * 4 + 1 });
  assert.deepEqual(
    review.mostMissed.map(({ name, missed, total }) => [name, missed, total]),
    [
      ['Run', 4, 7],
      ['Journal', 3, 7],
      ['Stretch', 2, 7],
    ],
  );
});

test('a routine that was not there, was archived, or is still running is not a miss', () => {
  const routines = [
    routine(1, 'New', 'daily', { createdOn: '2026-10-15' }),
    routine(2, 'Gone', 'daily', { archivedOn: '2026-10-12' }),
  ];
  const review = buildWeeklyReview({ weekStart: week, today, routines, checks: [] });
  // New counts from 10-15 (3 days); Gone only 10-11.
  assert.deepEqual(review.rate, { checked: 0, total: 3 + 1 });
  // The running week: days after today are not counted, and today only once done.
  const running = buildWeeklyReview({
    weekStart: '2026-10-18',
    today,
    routines: [routine(1, 'Read', 'daily'), routine(3, 'Clean', 'weekly')],
    checks: [check(1, '2026-10-22')],
  });
  assert.deepEqual(running.rate, { checked: 1, total: 1 + 4 });
  assert.deepEqual(
    running.mostMissed.map(({ name }) => name),
    ['Read'],
  );
});

test('a week with no misses lists nothing', () => {
  const review = buildWeeklyReview({
    weekStart: week,
    today,
    routines: [routine(3, 'Clean', 'weekly')],
    checks: [check(3, week)],
  });
  assert.deepEqual(review, { rate: { checked: 1, total: 1 }, mostMissed: [] });
});

test('the rate matches the stats page for the same week', () => {
  const routines = [routine(1, 'Read', 'daily'), routine(3, 'Clean', 'weekly')];
  const checks = [check(1, '2026-10-19'), check(1, '2026-10-20'), check(3, '2026-10-18')];
  const stats = buildStats({ today, anchorDate: '2026-10-04', routines, checks });
  const daily = stats.daily.weeks[0];
  const weekly = stats.weekly[0];
  const review = buildWeeklyReview({ weekStart: daily.start, today, routines, checks });
  assert.deepEqual(review.rate, {
    checked: daily.checked + weekly.checked,
    total: daily.total + weekly.total,
  });
});

// Fake pool answering by SQL; the real SQL runs in the DB tests.
function fakePool(notes: { wentWell: string | null; toChange: string | null } | null = null) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (sql.includes('FROM routines')) return { rows: [routine(1, 'Read', 'daily')] };
      if (sql.includes('FROM routine_checks')) return { rows: [check(1, '2026-10-11')] };
      if (sql.includes('FROM weekly_reviews')) return { rows: notes ? [notes] : [] };
      if (sql.startsWith('INSERT INTO weekly_reviews'))
        return { rows: [{ wentWell: params[1], toChange: params[2] }] };
      return { rows: [] };
    },
  } as unknown as Pool;
  return { pool, queries };
}
const clock = { today: () => today };

test('GET returns the week, its neighbours, the rate and the notes', async () => {
  const { pool, queries } = fakePool({ wentWell: 'Ran', toChange: null });
  await withApi(
    pool,
    async (call) => {
      const { status, data } = await call('/api/weekly-review?week=2026-10-14');
      assert.equal(status, 200);
      assert.deepEqual(data.week, { start: week, end: '2026-10-17' });
      assert.equal(data.previousWeek, '2026-10-04');
      assert.equal(data.nextWeek, '2026-10-18');
      assert.deepEqual(data.rate, { checked: 1, total: 7 });
      assert.deepEqual(data.notes, { wentWell: 'Ran', toChange: null });
      assert.deepEqual(queries.find((q) => q.sql.includes('routine_checks'))?.params, [
        week,
        '2026-10-17',
      ]);
    },
    clock,
  );
});

test('GET defaults to this week, which has no next week', async () => {
  await withApi(
    fakePool().pool,
    async (call) => {
      const { data } = await call('/api/weekly-review');
      assert.deepEqual(data.week, { start: '2026-10-18', end: '2026-10-24' });
      assert.equal(data.nextWeek, null);
      assert.deepEqual(data.notes, { wentWell: null, toChange: null });
    },
    clock,
  );
});

test('GET refuses a bad date, a future week and a week before 2000', async () => {
  await withApi(
    fakePool().pool,
    async (call) => {
      assert.equal((await call('/api/weekly-review?week=nope')).status, 400);
      const future = await call('/api/weekly-review?week=2026-10-25');
      assert.equal(future.status, 400);
      assert.equal(future.data.error, 'A week that has not started cannot be reviewed');
      assert.equal((await call('/api/weekly-review?week=1999-12-01')).status, 400);
    },
    clock,
  );
});

test('PUT saves trimmed notes and turns blank ones into null', async () => {
  const { pool, queries } = fakePool();
  await withApi(
    pool,
    async (call) => {
      const { status, data } = await call(`/api/weekly-review/${week}`, {
        method: 'PUT',
        body: { wentWell: '  Ran  ', toChange: '   ' },
      });
      assert.equal(status, 200);
      assert.deepEqual(data.notes, { wentWell: 'Ran', toChange: null });
      assert.deepEqual(queries.at(-1)?.params, [week, 'Ran', null]);
      const empty = await call(`/api/weekly-review/${week}`, { method: 'PUT', body: {} });
      assert.deepEqual(empty.data.notes, { wentWell: null, toChange: null });
    },
    clock,
  );
});

test('PUT validates the week and the notes', async () => {
  const { pool, queries } = fakePool();
  await withApi(
    pool,
    async (call) => {
      const put = (path: string, body: unknown) => call(path, { method: 'PUT', body });
      assert.equal((await put('/api/weekly-review/nope', {})).status, 400);
      const notSunday = await put('/api/weekly-review/2026-10-12', {});
      assert.equal(notSunday.data.error, 'The week must start on a Sunday');
      const future = await put('/api/weekly-review/2026-10-25', {});
      assert.equal(future.data.error, 'A week that has not started cannot be reviewed');
      const long = await put(`/api/weekly-review/${week}`, { wentWell: 'a'.repeat(1001) });
      assert.equal(long.data.error, 'What went well must be 1000 characters or fewer');
      const edge = await put(`/api/weekly-review/${week}`, { toChange: 'a'.repeat(1000) });
      assert.equal(edge.status, 200);
      assert.equal((await put(`/api/weekly-review/${week}`, { toChange: 5 })).status, 400);
      assert.equal((await put(`/api/weekly-review/${week}`, { toChange: 'a\0' })).status, 400);
      assert.equal((await put(`/api/weekly-review/${week}`, [])).status, 400);
      assert.equal(queries.filter((q) => q.sql.startsWith('INSERT')).length, 1);
    },
    clock,
  );
});
