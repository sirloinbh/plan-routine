import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { buildStats, periodStatus, type StatsRoutine } from '../src/routine-stats.js';
import { withApi } from './helpers.js';

const today = '2026-10-22'; // A Thursday.
const anchorDate = '2026-05-03'; // A Sunday, so four-week periods include 2026-10-18 ~ 2026-11-14.

const routine = (over: Partial<StatsRoutine> & { id: number }): StatsRoutine => ({
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
    routines: [routine({ id: 1, createdOn: '2026-10-19' })],
    checks: [
      { routineId: 1, periodStart: '2026-10-19' },
      { routineId: 1, periodStart: '2026-10-21' },
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
    routines: [routine({ id: 1, createdOn: today })],
    checks: [{ routineId: 1, periodStart: today }],
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
      routine({ id: 1, cadence: 'weekly', category: null }),
      routine({ id: 2, cadence: 'four_week', category: null }),
      routine({ id: 3, cadence: 'twelve_week', category: null }),
    ],
    checks: [
      { routineId: 1, periodStart: '2026-10-11' },
      { routineId: 2, periodStart: '2026-09-20' },
      { routineId: 3, periodStart: '2026-07-26' },
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
    routines: [routine({ id: 1, createdOn: '2026-10-20' })],
    checks: [{ routineId: 1, periodStart: '2026-10-20' }],
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
  const recent = routine({ id: 1, archivedOn: '2026-10-20' });
  const gone = routine({ id: 2, createdOn: '2025-01-01', archivedOn: '2025-02-01' });
  const stats = buildStats({ today, anchorDate, routines: [recent, gone], checks: [] });
  assert.deepEqual(
    stats.items.map((item) => [item.id, item.archived]),
    [[1, true]],
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
    routines: [routine({ id: 1, createdOn: today })],
    checks: [],
  });
  assert.equal(stats.items[0].total, 0);
  assert.equal(stats.items[0].periods[0].status, 'open');
});

test('the API loads routines with archived ones and all checks and skips', async () => {
  const queries: { sql: string; params: unknown[] }[] = [];
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (sql.includes('app_settings')) return { rows: [{ value: anchorDate }] };
      if (sql.includes('FROM routine_checks'))
        return { rows: [{ routineId: 1, periodStart: '2026-10-21' }] };
      return { rows: [routine({ id: 1, createdOn: '2026-10-20' })] };
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
  assert.deepEqual(checks?.params, []);
  assert.ok(queries.some((query) => query.sql.includes('FROM routine_skips')));
});

test('a skipped period is shown as skipped and counts as neither done nor missed', () => {
  const steady = { createdOn: '2026-01-01', archivedOn: null };
  assert.equal(periodStatus(steady, day('2026-10-21'), false, today, true), 'skipped');
  // The running period can be skipped too, and a check still wins.
  assert.equal(periodStatus(steady, day(today), false, today, true), 'skipped');
  assert.equal(periodStatus(steady, day('2026-10-21'), true, today, true), 'done');

  const stats = buildStats({
    today,
    anchorDate,
    routines: [routine({ id: 1 })],
    checks: [{ routineId: 1, periodStart: '2026-10-21' }],
    skips: [
      { routineId: 1, periodStart: '2026-10-20' },
      { routineId: 1, periodStart: '2026-10-19' },
    ],
  });
  const item = stats.items[0];
  const statusOn = (date: string) => item.periods.find((period) => period.start === date)?.status;
  assert.equal(statusOn('2026-10-21'), 'done');
  assert.equal(statusOn('2026-10-20'), 'skipped');
  assert.equal(statusOn('2026-10-18'), 'missed');
  // 14 days to today (open): 13 past days, 1 done, 2 skipped, so 10 missed.
  assert.deepEqual({ checked: item.checked, total: item.total }, { checked: 1, total: 11 });
  const week = stats.daily.weeks[0];
  assert.deepEqual({ checked: week.checked, total: week.total }, { checked: 1, total: 2 });
});

const check = (routineId: number, periodStart: string) => ({ routineId, periodStart });
const streakOf = (
  routines: StatsRoutine[],
  checks: { routineId: number; periodStart: string }[],
  skips: { routineId: number; periodStart: string }[] = [],
) => buildStats({ today, anchorDate, routines, checks, skips }).items.map((item) => item.streak);

test('daily streaks: a miss resets, skips neither break nor extend, today open does not break', () => {
  // Created 10-10. Done 10-10..10-12, missed 10-13, done 10-14, skipped 10-15, done 10-16..10-17,
  // missed 10-18..10-20, done 10-21; today (10-22) still open.
  const done = ['10', '11', '12', '14', '16', '17', '21'].map((d) => check(1, `2026-10-${d}`));
  const routines = [routine({ id: 1, createdOn: '2026-10-10' })];
  assert.deepEqual(streakOf(routines, done, [check(1, '2026-10-15')]), [{ current: 1, best: 3 }]);
  // Without the skip, 10-15 is a miss and 14 / 16-17 are separate runs; the best is still 3.
  assert.deepEqual(streakOf(routines, done), [{ current: 1, best: 3 }]);
  // The skip bridges 14 and 16: 14, (skip), 16, 17 is a run of 3.
  const bridged = ['14', '16', '17', '18', '19', '20', '21'].map((d) => check(1, `2026-10-${d}`));
  assert.deepEqual(streakOf(routines, bridged, [check(1, '2026-10-15')]), [
    { current: 7, best: 7 },
  ]);
  // Today done adds to the run; today open and unchecked leaves it.
  assert.deepEqual(streakOf(routines, [...done, check(1, today)], [check(1, '2026-10-15')]), [
    { current: 2, best: 3 },
  ]);
});

test('streaks count periods of the routine cadence and ignore times before it existed', () => {
  const weekly = routine({ id: 2, cadence: 'weekly', category: null, createdOn: '2026-09-27' });
  // Weeks from 09-27: done 09-27, 10-04; missed 10-11; done 10-18 (running, so it counts).
  const checks = ['2026-09-27', '2026-10-04', '2026-10-18'].map((d) => check(2, d));
  assert.deepEqual(streakOf([weekly], checks), [{ current: 1, best: 2 }]);
  // Archived: later periods are not applicable, so the streak stays where it ended.
  const archived = routine({ id: 3, createdOn: '2026-10-10', archivedOn: '2026-10-14' });
  const kept = ['10', '11', '12', '13'].map((d) => check(3, `2026-10-${d}`));
  assert.deepEqual(streakOf([archived], kept), [{ current: 4, best: 4 }]);
  // A routine with nothing done has no streak.
  assert.deepEqual(streakOf([routine({ id: 4 })], []), [{ current: 0, best: 0 }]);
});

test('the trend lists 12 weeks and 6 four-week periods, newest first, with skips left out', () => {
  const routines = [
    routine({ id: 1 }),
    routine({ id: 2, cadence: 'weekly', category: null }),
    routine({ id: 5, cadence: 'four_week', category: null }),
  ];
  const stats = buildStats({
    today,
    anchorDate,
    routines,
    checks: [check(1, '2026-10-19'), check(2, '2026-10-18'), check(5, '2026-10-18')],
    skips: [check(1, '2026-10-20')],
  });
  assert.equal(stats.trend.weeks.length, 12);
  assert.equal(stats.trend.fourWeeks.length, 6);
  assert.deepEqual(stats.trend.weeks[0], {
    start: '2026-10-18',
    end: '2026-10-24',
    checked: 2,
    total: 4,
  });
  // 10-18 missed, 10-19 done, 10-20 skipped (not counted), 10-21 missed; weekly done; today open.
  assert.deepEqual(
    [stats.trend.weeks[0].start, stats.trend.weeks[1].start],
    ['2026-10-18', '2026-10-11'],
  );
  const fourWeek = stats.trend.fourWeeks[0];
  assert.equal(fourWeek.start, '2026-10-18');
  // The 4-week routine is done; the current week's weekly is done; days as above.
  assert.deepEqual([fourWeek.checked, fourWeek.total], [3, 5]);
  assert.ok(stats.trend.fourWeeks[1].end < fourWeek.start);
});

test('a weekday routine does not count its off days, and a check on one still counts (#245)', () => {
  // Mon/Wed/Fri (1, 3, 5). Week 10-18 (Sun) .. 10-24: Mon 19 done, Wed 21 missed, Fri 23 is in the future.
  const run = routine({ id: 1, weekdays: [1, 3, 5] });
  const stats = buildStats({
    today,
    anchorDate,
    routines: [run],
    checks: [check(1, '2026-10-19'), check(1, '2026-10-20')],
  });
  const statusOn = (date: string) =>
    stats.items[0].periods.find((period) => period.start === date)?.status;
  assert.equal(statusOn('2026-10-19'), 'done');
  assert.equal(statusOn('2026-10-20'), 'done'); // Tuesday, checked anyway
  assert.equal(statusOn('2026-10-21'), 'missed');
  assert.equal(statusOn('2026-10-22'), 'none'); // Thursday, today, off day
  assert.equal(statusOn('2026-10-18'), 'none'); // Sunday
  // Week of 10-18: done 19, 20 (extra), missed 21.
  assert.deepEqual(
    { checked: stats.daily.weeks[0].checked, total: stats.daily.weeks[0].total },
    { checked: 2, total: 3 },
  );
});

test('an N-per-week routine is done at N checks in the week and missed otherwise (#245)', () => {
  const read = routine({ id: 2, cadence: 'weekly', category: null, timesPerWeek: 3 });
  const periods = (checks: string[], day: string) =>
    buildStats({
      today: day,
      anchorDate,
      routines: [read],
      checks: checks.map((date) => check(2, date)),
    }).items[0].periods;
  // The running week (10-18..10-24): open with 2 checks, done with 3.
  assert.equal(periods(['2026-10-18', '2026-10-19'], today)[0].status, 'open');
  assert.equal(periods(['2026-10-18', '2026-10-19', '2026-10-21'], today)[0].status, 'done');
  // The same week once it is over (today 10-28, so it is the second period).
  assert.equal(periods(['2026-10-18', '2026-10-19'], '2026-10-28')[1].status, 'missed');
  assert.equal(periods(['2026-10-18', '2026-10-19', '2026-10-24'], '2026-10-28')[1].status, 'done');
  // A check in another week does not count.
  assert.equal(
    periods(['2026-10-11', '2026-10-12', '2026-10-13'], '2026-10-28')[1].status,
    'missed',
  );
});

test('a routine with a unit totals the amounts of its checks per week and four-week period (#246)', () => {
  const read = routine({ id: 7, unit: 'pages', targetAmount: 20 });
  const plain = routine({ id: 8 });
  const stats = buildStats({
    today,
    anchorDate,
    routines: [read, plain],
    checks: [
      { routineId: 7, periodStart: '2026-10-19', amount: 20 },
      { routineId: 7, periodStart: '2026-10-21', amount: 15.5 },
      { routineId: 7, periodStart: '2026-10-20', amount: null }, // done without an amount
      { routineId: 7, periodStart: '2026-10-14', amount: 10 },
      { routineId: 8, periodStart: '2026-10-19', amount: 99 },
    ],
  });
  const [item, other] = stats.items;
  assert.deepEqual([item.unit, item.targetAmount], ['pages', 20]);
  assert.deepEqual(
    item.amountTotals?.weeks.slice(0, 2).map((week) => week.total),
    [35.5, 10],
  );
  assert.equal(item.amountTotals?.weeks.length, 8);
  // Four-week period 10-18..11-14 holds this week only; the one before holds 10-14.
  assert.deepEqual(
    item.amountTotals?.fourWeeks.slice(0, 2).map((period) => period.total),
    [35.5, 10],
  );
  // The amounts do not change what counts as done, and a routine without a unit has no totals.
  assert.equal(item.checked, 4);
  assert.equal(other.amountTotals, null);
  assert.equal(other.unit, null);
});
