import {
  addDays,
  type Cadence,
  type Period,
  periodFor,
  shiftMonth,
  weekdayOf,
  weekStart,
} from './periods.js';

export type StatsRoutine = {
  id: number;
  name: string;
  cadence: Cadence;
  category: string | null;
  sortOrder: number;
  /** YYYY-MM-DD in the service time zone. */
  createdOn: string;
  archivedOn: string | null;
  /** Daily routines on chosen days only (0 = Sunday ... 6 = Saturday); null is every day (#245). */
  weekdays?: number[] | null;
  /** Weekly routines done on this many days of the week (2 to 7); null is one check per week (#245). */
  timesPerWeek?: number | null;
};
export type StatsCheck = { routineId: number; periodStart: string };
export type StatsSkip = StatsCheck;

/** `skipped`: left out on purpose (#243); it counts neither as done nor as missed. */
export type PeriodStatus = 'done' | 'missed' | 'skipped' | 'open' | 'none';
export type Tally = { checked: number; total: number };
type PeriodTally = Period & Tally;

// How far back each list reaches (confirmed on issue #11).
const dailyHistoryDays = 14;
const dailyWeeks = 8;
const dailyMonths = 6;
const recentPeriods: Record<Exclude<Cadence, 'daily'>, number> = {
  weekly: 8,
  four_week: 6,
  twelve_week: 4,
};

// Trend lengths (confirmed on issue #244): 12 weeks and 6 four-week periods.
const trendWeeks = 12;
const trendFourWeeks = 6;

// The same rule as "routines of that day" on the records page (day-records.ts), for any period: a
// check always counts; otherwise the routine must have been there through the end of the period.
// A period still running is not a miss yet, so it counts only once done. A skipped period (checked and
// skipped never both hold) is shown as skipped and left out of both counts.
export function periodStatus(
  routine: Pick<StatsRoutine, 'createdOn' | 'archivedOn' | 'weekdays'>,
  period: Period,
  checked: boolean,
  today: string,
  skipped = false,
): PeriodStatus {
  if (checked) return 'done';
  if (skipped) return 'skipped';
  // A day the routine does not apply to is not a miss, and not counted (#245).
  if (
    routine.weekdays &&
    period.start === period.end &&
    !routine.weekdays.includes(weekdayOf(period.start))
  )
    return 'none';
  if (routine.createdOn > period.end) return 'none';
  if (routine.archivedOn && routine.archivedOn <= period.end) return 'none';
  return period.end >= today ? 'open' : 'missed';
}

/**
 * Whether a routine's period is checked. An N-per-week routine stores one check per day, and is done
 * once the period holds N of them; every other routine has one check at the period's start (#245).
 */
export function checkLookup(checks: StatsCheck[]) {
  const keys = new Set(checks.map((check) => `${check.routineId}/${check.periodStart}`));
  const dates = new Map<number, string[]>();
  for (const { routineId, periodStart } of checks)
    dates.set(routineId, [...(dates.get(routineId) ?? []), periodStart]);
  return (routine: Pick<StatsRoutine, 'id' | 'timesPerWeek'>, period: Period) =>
    routine.timesPerWeek
      ? (dates.get(routine.id) ?? []).filter((date) => date >= period.start && date <= period.end)
          .length >= routine.timesPerWeek
      : keys.has(`${routine.id}/${period.start}`);
}

function addStatus(tally: Tally, status: PeriodStatus) {
  if (status === 'done') tally.checked += 1;
  if (status === 'done' || status === 'missed') tally.total += 1;
}

// Newest first, the period holding today included.
function previousPeriods(
  cadence: Exclude<Cadence, 'daily'>,
  today: string,
  anchorDate: string,
  count: number,
) {
  const periods: Period[] = [periodFor(cadence, today, anchorDate)];
  while (periods.length < count)
    periods.push(periodFor(cadence, addDays(periods[periods.length - 1].start, -1), anchorDate));
  return periods;
}

export function buildStats(input: {
  today: string;
  anchorDate: string;
  routines: StatsRoutine[];
  checks: StatsCheck[];
  skips?: StatsSkip[];
}) {
  const { today, anchorDate, routines, checks, skips = [] } = input;
  const keyOf = (entry: StatsCheck) => `${entry.routineId}/${entry.periodStart}`;
  const isChecked = checkLookup(checks);
  const skippedKeys = new Set(skips.map(keyOf));
  const statusOf = (routine: StatsRoutine, period: Period) => {
    const key = `${routine.id}/${period.start}`;
    return periodStatus(routine, period, isChecked(routine, period), today, skippedKeys.has(key));
  };
  const byCadence = (cadence: Cadence) => routines.filter((routine) => routine.cadence === cadence);
  const days = (start: string, end: string) => {
    const dates: string[] = [];
    const last = end < today ? end : today;
    for (let date = start; date <= last; date = addDays(date, 1)) dates.push(date);
    return dates;
  };
  // A daily routine's own period is one day, so a longer span sums its days.
  const dailyTally = (start: string, end: string): PeriodTally => {
    const tally = { start, end, checked: 0, total: 0 };
    for (const date of days(start, end))
      for (const routine of byCadence('daily'))
        addStatus(tally, statusOf(routine, { start: date, end: date }));
    return tally;
  };

  const thisWeek = weekStart(today);
  const dailyWeeksList = Array.from({ length: dailyWeeks }, (_, index) => {
    const start = addDays(thisWeek, -7 * index);
    return dailyTally(start, addDays(start, 6));
  });
  const thisMonth = today.slice(0, 7);
  const dailyMonthsList = Array.from({ length: dailyMonths }, (_, index) => {
    const month = shiftMonth(thisMonth, -index);
    const start = `${month}-01`;
    return { month, ...dailyTally(start, addDays(`${shiftMonth(month, 1)}-01`, -1)) };
  });

  const periodsFor: Record<Exclude<Cadence, 'daily'>, Period[]> = {
    weekly: previousPeriods('weekly', today, anchorDate, recentPeriods.weekly),
    four_week: previousPeriods('four_week', today, anchorDate, recentPeriods.four_week),
    twelve_week: previousPeriods('twelve_week', today, anchorDate, recentPeriods.twelve_week),
  };
  const groupTally = (cadence: Exclude<Cadence, 'daily'>) =>
    periodsFor[cadence].map((period) => {
      const tally = { ...period, checked: 0, total: 0 };
      for (const routine of byCadence(cadence)) addStatus(tally, statusOf(routine, period));
      return tally;
    });

  // Completion trend over all daily and weekly routines (and, per four-week period, four-week routines):
  // a daily routine counts per day, a weekly one per week, so a week's rate is the weekly review's rate.
  const trendTally = (period: Period, cadences: Cadence[]): PeriodTally => {
    const tally = { ...period, checked: 0, total: 0 };
    if (cadences.includes('daily')) {
      const daily = dailyTally(period.start, period.end);
      tally.checked += daily.checked;
      tally.total += daily.total;
    }
    if (cadences.includes('weekly'))
      for (let start = period.start; start <= period.end; start = addDays(start, 7))
        for (const routine of byCadence('weekly'))
          addStatus(tally, statusOf(routine, { start, end: addDays(start, 6) }));
    if (cadences.includes('four_week'))
      for (const routine of byCadence('four_week')) addStatus(tally, statusOf(routine, period));
    return tally;
  };
  const trend = {
    weeks: Array.from({ length: trendWeeks }, (_, index) => {
      const start = addDays(thisWeek, -7 * index);
      return trendTally({ start, end: addDays(start, 6) }, ['daily', 'weekly']);
    }),
    fourWeeks: previousPeriods('four_week', today, anchorDate, trendFourWeeks).map((period) =>
      trendTally(period, ['daily', 'weekly', 'four_week']),
    ),
  };

  // Streaks count periods of the routine's own cadence, oldest to newest, from its first record. Done adds
  // one, a miss resets, and skipped, not-applicable and the still-open period change nothing (#244). The
  // open period therefore never breaks a streak, and adds to it once done.
  const firstRecord = new Map<number, string>();
  for (const { routineId, periodStart } of [...checks, ...skips])
    if (periodStart < (firstRecord.get(routineId) ?? '9999-12-31'))
      firstRecord.set(routineId, periodStart);
  const streakOf = (routine: StatsRoutine) => {
    const first = firstRecord.get(routine.id);
    const from = first && first < routine.createdOn ? first : routine.createdOn;
    let current = 0;
    let best = 0;
    for (
      let period = periodFor(routine.cadence, from, anchorDate);
      period.start <= today;
      period = periodFor(routine.cadence, addDays(period.end, 1), anchorDate)
    ) {
      const status = statusOf(routine, period);
      if (status === 'done') best = Math.max(best, (current += 1));
      else if (status === 'missed') current = 0;
    }
    return { current, best };
  };

  const dailyHistory = days(addDays(today, 1 - dailyHistoryDays), today)
    .reverse()
    .map((date) => ({ start: date, end: date }));
  const items = routines
    .map((routine) => {
      const periods = (
        routine.cadence === 'daily' ? dailyHistory : periodsFor[routine.cadence]
      ).map((period) => ({ ...period, status: statusOf(routine, period) }));
      const tally = { checked: 0, total: 0 };
      for (const { status } of periods) addStatus(tally, status);
      return {
        id: routine.id,
        name: routine.name,
        cadence: routine.cadence,
        category: routine.category,
        sortOrder: routine.sortOrder,
        archived: routine.archivedOn !== null,
        ...tally,
        streak: streakOf(routine),
        periods,
      };
    })
    // Long gone: an archived routine with nothing in the window has no story to tell here.
    .filter((item) => !item.archived || item.periods.some(({ status }) => status !== 'none'));

  return {
    today,
    daily: { weeks: dailyWeeksList, months: dailyMonthsList },
    weekly: groupTally('weekly'),
    fourWeek: groupTally('four_week'),
    twelveWeek: groupTally('twelve_week'),
    trend,
    items,
  };
}
