import { addDays } from './periods.js';
import {
  checkLookup,
  periodStatus,
  type StatsCheck,
  type StatsRoutine,
  type StatsSkip,
} from './routine-stats.js';

/** How many of the most-missed routines the review lists (issue #242). */
export const mostMissedCount = 3;

export type ReviewRoutine = Pick<
  StatsRoutine,
  | 'id'
  | 'name'
  | 'cadence'
  | 'category'
  | 'sortOrder'
  | 'createdOn'
  | 'archivedOn'
  | 'weekdays'
  | 'timesPerWeek'
>;

/**
 * One week's completion rate and its most-missed routines. Daily and weekly routines count, by the rules of the
 * stats page (`periodStatus`): a check always counts, a routine counts as missed only when it was active through the
 * end of the day or week and that has passed, and a day or week still running counts only once done.
 */
export function buildWeeklyReview(input: {
  weekStart: string;
  today: string;
  routines: ReviewRoutine[];
  /** Checks of the week: a daily check has the day as periodStart, a weekly one the week's start. */
  checks: StatsCheck[];
  /** Skips of the week (#243): shown as skipped, counted neither as done nor as missed. */
  skips?: StatsSkip[];
}) {
  const { today, routines, checks, skips = [] } = input;
  const start = input.weekStart;
  const end = addDays(start, 6);
  const isChecked = checkLookup(checks);
  const skippedKeys = new Set(skips.map((skip) => `${skip.routineId}/${skip.periodStart}`));
  const statusOf = (routine: ReviewRoutine, period: { start: string; end: string }) => {
    const key = `${routine.id}/${period.start}`;
    return periodStatus(routine, period, isChecked(routine, period), today, skippedKeys.has(key));
  };

  const rate = { checked: 0, total: 0 };
  const missedList: {
    id: number;
    name: string;
    cadence: 'daily' | 'weekly';
    missed: number;
    total: number;
  }[] = [];
  for (const routine of routines) {
    if (routine.cadence !== 'daily' && routine.cadence !== 'weekly') continue;
    const periods =
      routine.cadence === 'daily'
        ? Array.from({ length: 7 }, (_, index) => {
            const date = addDays(start, index);
            return { start: date, end: date };
          })
        : [{ start, end }];
    let missed = 0;
    let total = 0;
    for (const period of periods) {
      const status = statusOf(routine, period);
      if (status === 'done') rate.checked += 1;
      if (status === 'done' || status === 'missed') {
        rate.total += 1;
        total += 1;
      }
      if (status === 'missed') missed += 1;
    }
    if (missed > 0)
      missedList.push({
        id: routine.id,
        name: routine.name,
        cadence: routine.cadence,
        missed,
        total,
      });
  }
  // Most missed first; a tie goes to the routine with more records, then to the routines' own order.
  const order = new Map(routines.map((routine, index) => [routine.id, index]));
  missedList.sort(
    (a, b) => b.missed - a.missed || b.total - a.total || order.get(a.id)! - order.get(b.id)!,
  );
  return { rate, mostMissed: missedList.slice(0, mostMissedCount) };
}
