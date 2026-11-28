import { z } from 'zod/v4';

export const cadences = ['daily', 'weekly', 'four_week', 'twelve_week'] as const;
export type Cadence = (typeof cadences)[number];

export type Period = { start: string; end: string };

const periodDays: Record<Cadence, number> = { daily: 1, weekly: 7, four_week: 28, twelve_week: 84 };
const dayMs = 24 * 60 * 60 * 1000;

// Dates are calendar days, so arithmetic runs in UTC to avoid DST and host time zone shifts.
function toDayNumber(date: string) {
  return Date.parse(`${date}T00:00:00Z`) / dayMs;
}

function fromDayNumber(day: number) {
  return new Date(day * dayMs).toISOString().slice(0, 10);
}

export function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  // Impossible months parse to NaN; impossible days (02-30) roll over and no longer match.
  const day = toDayNumber(value);
  return !Number.isNaN(day) && fromDayNumber(day) === value;
}

export const calendarDate = z
  .string({
    error: (issue) => (issue.input === undefined ? 'Enter a date' : 'Invalid date format'),
  })
  .refine(isCalendarDate, 'Date must be a real date in YYYY-MM-DD format');

export function addDays(date: string, days: number) {
  return fromDayNumber(toDayNumber(date) + days);
}

/** A YYYY-MM month moved by whole months. */
export function shiftMonth(month: string, months: number) {
  const [year, number] = month.split('-').map(Number);
  const index = year * 12 + number - 1 + months;
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** 0 = Sunday ... 6 = Saturday, as PostgreSQL's DOW. */
export function weekdayOf(date: string) {
  return (((toDayNumber(date) + 4) % 7) + 7) % 7;
}

export function daysBetween(from: string, to: string) {
  return toDayNumber(to) - toDayNumber(from);
}

// Weeks run Sunday to Saturday.
export function weekStart(date: string) {
  const day = toDayNumber(date);
  // 1970-01-01 was a Thursday, so day 0 is weekday 4 (Sunday = 0).
  const weekday = (((day + 4) % 7) + 7) % 7;
  return fromDayNumber(day - weekday);
}

// Four- and twelve-week periods repeat from the Sunday of the first-use week (the anchor),
// so each period holds whole weeks. Dates before the anchor fall into earlier periods.
export function periodFor(cadence: Cadence, date: string, anchorDate: string): Period {
  if (cadence === 'daily') return { start: date, end: date };
  if (cadence === 'weekly') {
    const start = weekStart(date);
    return { start, end: addDays(start, 6) };
  }
  const length = periodDays[cadence];
  const origin = toDayNumber(weekStart(anchorDate));
  const index = Math.floor((toDayNumber(date) - origin) / length);
  const start = fromDayNumber(origin + index * length);
  return { start, end: addDays(start, length - 1) };
}

export function periodsFor(date: string, anchorDate: string) {
  return Object.fromEntries(
    cadences.map((cadence) => [cadence, periodFor(cadence, date, anchorDate)]),
  ) as Record<Cadence, Period>;
}

// Plan horizons (#341). Week, twelve_week and year periods run in whole weeks from the same Sunday anchor as the
// routine periods (52 weeks = 364 days). A decade runs 10 whole calendar years from January 1 of a year the owner
// picks, so it is not tied to the anchor.
export const planHorizons = ['week', 'twelve_week', 'year', 'decade'] as const;
export type PlanHorizon = (typeof planHorizons)[number];

const planPeriodDays = { week: 7, twelve_week: 84, year: 364 } as const;
/** Years are kept at four digits so every date stays in YYYY-MM-DD form. */
export const lastPlanDate = '2999-12-31';

export function planPeriodFor(horizon: PlanHorizon, date: string, anchorDate: string): Period {
  if (horizon === 'decade') {
    const year = Number(date.slice(0, 4));
    return { start: `${String(year).padStart(4, '0')}-01-01`, end: `${year + 9}-12-31` };
  }
  const length = planPeriodDays[horizon];
  const origin = toDayNumber(weekStart(anchorDate));
  const index = Math.floor((toDayNumber(date) - origin) / length);
  const start = fromDayNumber(origin + index * length);
  return { start, end: addDays(start, length - 1) };
}
