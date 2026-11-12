import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { buildStats, periodStatus, type StatsRoutine, statsStart } from '../src/routine-stats.js';
import { withApi } from './helpers.js';

const today = '2026-10-22'; // A Thursday.
const anchorDate = '2026-05-03'; // A Sunday, so four-week periods include 2026-10-18 ~ 2026-11-14.

const routine = (over: Partial<StatsRoutine> & { id: string }): StatsRoutine => ({
  name: `Routine ${over.id}`,
  cadence: 'daily',
  category: 'wake',
  sortOrder: 0,
  createdOn: '2026-01-01',
  archivedOn: null,
  ...over,
});
const day = (date: string) => ({ start: date, end: date });

test('a check is done whatever else is true about the routine', () => {
  const later = { createdOn: '2026-10-20', archivedOn: '2026-10-10' };
  assert.equal(periodStatus(later, day('2026-10-01'), true, today), 'done');
});

test('a period before the routine was made is not counted', () => {
  const routineMade = { createdOn: '2026-10-20', archivedOn: null };
  assert.equal(periodStatus(routineMade, day('2026-10-19'), false, today), 'none');
  assert.equal(periodStatus(routineMade, day('2026-10-20'), false, today), 'missed');
  // Made inside the period: it was there by the end, so it counts.
  assert.equal(
    periodStatus(routineMade, { start: '2026-10-11', end: '2026-10-20' }, false, today),
    'missed',
  );
});

test('a period ending on or after the archive day is not counted', () => {
  const archived = { createdOn: '2026-01-01', archivedOn: '2026-10-15' };
  assert.equal(periodStatus(archived, day('2026-10-14'), false, today), 'missed');
  assert.equal(periodStatus(archived, day('2026-10-15'), false, today), 'none');
  assert.equal(
    periodStatus(archived, { start: '2026-10-11', end: '2026-10-17' }, false, today),
    'none',
  );
  assert.equal(
    periodStatus(archived, { start: '2026-10-04', end: '2026-10-10' }, false, today),
    'missed',
  );
});

test('a period still running is open, not missed, until its last day has passed', () => {
  const steady = { createdOn: '2026-01-01', archivedOn: null };
  assert.equal(periodStatus(steady, day(today), false, today), 'open');
  assert.equal(periodStatus(steady, { start: '2026-10-18', end: today }, false, today), 'open');
  assert.equal(periodStatus(steady, day('2026-10-21'), false, today), 'missed');
});

test('daily weeks and months count routine-days, leaving out today until it is done', () => {
  const stats = buildStats({
    today,
    anchorDate,
    routines: [routine({ id: '1', createdOn: '2026-10-19' })],
    checks: [
      { routineId: '1', periodStart: '2026-10-19' },
      { routineId: '1', periodStart: '2026-10-21' },
    ],
  });
  // Mon done, Tue missed, Wed done, Thu is today and still open.
  assert.deepEqual(stats.daily.weeks[0], {
    start: '2026-10-18',
    end: '2026-10-24',
    checked: 2,
    total: 3,
  });
  assert.deepEqual(stats.daily.weeks[1], {
    start: '2026-10-11',
    end: '2026-10-17',
    checked: 0,
    total: 0,
  });
  assert.equal(stats.daily.weeks.length, 8);
  assert.deepEqual(stats.daily.months[0], {
    month: '2026-10',
    start: '2026-10-01',
    end: '2026-10-31',
    checked: 2,
    total: 3,
  });
  assert.deepEqual(
    stats.daily.months.map((month) => month.month),
    ['2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05'],
  );
});

test("today's check counts as soon as it is done", () => {
  const stats = buildStats({
    today,
    anchorDate,
    routines: [routine({ id: '1', createdOn: today })],
    checks: [{ routineId: '1', periodStart: today }],
  });
  assert.equal(stats.daily.weeks[0].checked, 1);
  assert.equal(stats.daily.weeks[0].total, 1);
});

test('months cross year ends and keep their real last day', () => {
  const stats = buildStats({ today: '2026-02-10', anchorDate, routines: [], checks: [] });
  assert.deepEqual(
    stats.daily.months.slice(0, 3).map(({ month, end }) => [month, end]),
    [
      ['2026-02', '2026-02-28'],
      ['2026-01', '2026-01-31'],
      ['2025-12', '2025-12-31'],
    ],
  );
});

test('longer cadences list their recent periods, newest first, on period boundaries', () => {
  const stats = buildStats({
    today,
    anchorDate,
    routines: [
      routine({ id: '1', cadence: 'weekly', category: null }),
      routine({ id: '2', cadence: 'four_week', category: null }),
      routine({ id: '3', cadence: 'twelve_week', category: null }),
    ],
    checks: [
      { routineId: '1', periodStart: '2026-10-11' },
      { routineId: '2', periodStart: '2026-09-20' },
      { routineId: '3', periodStart: '2026-07-26' },
    ],
  });
  assert.equal(stats.weekly.length, 8);
  assert.deepEqual(stats.weekly[0], {
    start: '2026-10-18',
    end: '2026-10-24',
    checked: 0,
    total: 0,
  });
  assert.deepEqual(stats.weekly[1], {
    start: '2026-10-11',
    end: '2026-10-17',
    checked: 1,
    total: 1,
  });
  assert.deepEqual(stats.weekly[2], {
    start: '2026-10-04',
    end: '2026-10-10',
    checked: 0,
    total: 1,
  });
  assert.equal(stats.fourWeek.length, 6);
  assert.deepEqual(stats.fourWeek[0], {
    start: '2026-10-18',
    end: '2026-11-14',
    checked: 0,
    total: 0,
  });
  assert.deepEqual(stats.fourWeek[1], {
    start: '2026-09-20',
    end: '2026-10-17',
    checked: 1,
    total: 1,
  });
  assert.equal(stats.twelveWeek.length, 4);
  assert.deepEqual(stats.twelveWeek[1], {
    start: '2026-07-26',
    end: '2026-10-17',
    checked: 1,
    total: 1,
  });
});

test('each routine lists its own recent history with its rate', () => {
  const stats = buildStats({
    today,
    anchorDate,
    routines: [routine({ id: '1', createdOn: '2026-10-20' })],
    checks: [{ routineId: '1', periodStart: '2026-10-20' }],
  });
  const [item] = stats.items;
  assert.equal(item.periods.length, 14);
  assert.deepEqual(item.periods.slice(0, 4), [
    { start: '2026-10-22', end: '2026-10-22', status: 'open' },
    { start: '2026-10-21', end: '2026-10-21', status: 'missed' },
    { start: '2026-10-20', end: '2026-10-20', status: 'done' },
    { start: '2026-10-19', end: '2026-10-19', status: 'none' },
  ]);
  assert.equal(item.checked, 1);
  assert.equal(item.total, 2);
  assert.equal(item.archived, false);
});

test('an archived routine stays while its periods count and goes once they are all out of range', () => {
  const recent = routine({ id: '1', archivedOn: '2026-10-20' });
  const gone = routine({ id: '2', createdOn: '2025-01-01', archivedOn: '2025-02-01' });
  const stats = buildStats({ today, anchorDate, routines: [recent, gone], checks: [] });
  assert.deepEqual(
    stats.items.map((item) => [item.id, item.archived]),
    [['1', true]],
  );
  // The archived routine still weighs on weeks before it was archived, and not after.
  assert.equal(stats.daily.weeks[1].total, 7);
  // 10-18 and 10-19 count; the archive day 10-20 and after do not.
  assert.equal(stats.daily.weeks[0].total, 2);
});

test('a routine with no record yet stays in the list with nothing to count', () => {
  const stats = buildStats({
    today,
    anchorDate,
    routines: [routine({ id: '1', createdOn: today })],
    checks: [],
  });
  assert.equal(stats.items[0].total, 0);
  assert.equal(stats.items[0].periods[0].status, 'open');
});

test('the loading window reaches back as far as any list does', () => {
  // Four twelve-week periods reach further than six months here.
  const start = statsStart(today, anchorDate);
  assert.equal(start, '2026-02-08');
  const stats = buildStats({ today, anchorDate, routines: [], checks: [] });
  for (const period of [...stats.twelveWeek, ...stats.fourWeek, ...stats.weekly])
    assert.ok(start <= period.start, period.start);
  for (const month of stats.daily.months) assert.ok(start <= month.start, month.start);
  for (const week of stats.daily.weeks) assert.ok(start <= week.start, week.start);
});

test('the API loads routines with archived ones and checks from the window start', async () => {
  const queries: { sql: string; params: unknown[] }[] = [];
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (sql.includes('app_settings')) return { rows: [{ value: anchorDate }] };
      if (sql.includes('FROM routine_checks'))
        return { rows: [{ routineId: '1', periodStart: '2026-10-21' }] };
      return { rows: [routine({ id: '1', createdOn: '2026-10-20' })] };
    },
  } as unknown as Pool;
  await withApi(
    pool,
    async (call) => {
      const { status, data } = await call('/api/stats');
      assert.equal(status, 200);
      assert.equal(data.today, today);
      const items = data.items as { checked: number; total: number }[];
      assert.deepEqual([items[0].checked, items[0].total], [1, 2]);
    },
    { today: () => today },
  );
  const routines = queries.find((query) => query.sql.includes('FROM routines'));
  assert.ok(routines);
  assert.doesNotMatch(routines.sql, /archived_at IS NULL/);
  const checks = queries.find((query) => query.sql.includes('FROM routine_checks'));
  assert.deepEqual(checks?.params, [statsStart(today, anchorDate)]);
});
