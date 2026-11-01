import { addDays, type Cadence, type Period, periodFor, weekStart } from './periods.js';

export type StatsRoutine = {
  id: string;
  name: string;
  cadence: Cadence;
  category: string | null;
  sortOrder: number;
  /** YYYY-MM-DD in the service time zone. */
  createdOn: string;
  archivedOn: string | null;
};
export type StatsCheck = { routineId: string; periodStart: string };

export type PeriodStatus = 'done' | 'missed' | 'open' | 'none';
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

/** The earliest date buildStats looks at, so a caller can load no more checks than it needs. */
export function statsStart(today: string, anchorDate: string) {
  const longest = (cadence: Exclude<Cadence, 'daily'>) =>
    previousPeriods(cadence, today, anchorDate, recentPeriods[cadence]).at(-1)!.start;
  const firstMonth = `${shiftMonth(today.slice(0, 7), 1 - dailyMonths)}-01`;
  return [
    firstMonth,
    addDays(weekStart(today), -7 * (dailyWeeks - 1)),
    addDays(today, 1 - dailyHistoryDays),
    longest('weekly'),
    longest('four_week'),
    longest('twelve_week'),
  ].sort()[0];
}

// The same rule as "routines of that day" on the records page (day-records.ts), for any period: a
// check always counts; otherwise the routine must have been there through the end of the period.
// A period still running is not a miss yet, so it counts only once done.
export function periodStatus(
  routine: Pick<StatsRoutine, 'createdOn' | 'archivedOn'>,
  period: Period,
  checked: boolean,
  today: string,
): PeriodStatus {
  if (checked) return 'done';
  if (routine.createdOn > period.end) return 'none';
  if (routine.archivedOn && routine.archivedOn <= period.end) return 'none';
  return period.end >= today ? 'open' : 'missed';
}

function addStatus(tally: Tally, status: PeriodStatus) {
  if (status === 'done') tally.checked += 1;
  if (status === 'done' || status === 'missed') tally.total += 1;
}

function shiftMonth(month: string, months: number) {
  const [year, number] = month.split('-').map(Number);
  const index = year * 12 + number - 1 + months;
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`;
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
}) {
  const { today, anchorDate, routines, checks } = input;
  const checkedKeys = new Set(checks.map((check) => `${check.routineId}/${check.periodStart}`));
  const statusOf = (routine: StatsRoutine, period: Period) =>
    periodStatus(routine, period, checkedKeys.has(`${routine.id}/${period.start}`), today);
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
    items,
  };
}
