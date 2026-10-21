import { z } from 'zod';

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
    required_error: '날짜를 입력해 주세요',
    invalid_type_error: '날짜 형식이 올바르지 않습니다',
  })
  .refine(isCalendarDate, '날짜는 YYYY-MM-DD 형식의 실제 날짜여야 합니다');

export function addDays(date: string, days: number) {
  return fromDayNumber(toDayNumber(date) + days);
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
