import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { addDays, calendarDate, weekStart } from './periods.js';
import { badRequest, noNul, nulMessage, requestBody } from './request-input.js';
import type { StatsCheck } from './routine-stats.js';
import { HttpError } from './standard/http.js';
import { buildWeeklyReview, type ReviewRoutine } from './weekly-review.js';

// The first week is the one holding 2000-01-01 (it starts on 1999-12-26), so every day of it has a place.
const earliestWeek = weekStart('2000-01-01');
const noteLimit = 1000;

// A blank note is the same as no note. Not .min()/.max(): those also run on a non-string with a length.
const reviewNote = (label: string) =>
  z
    .string({ error: `${label} must be text` })
    .trim()
    .refine(
      (value) => value.length <= noteLimit,
      `${label} must be ${noteLimit} characters or fewer`,
    )
    .refine(noNul, nulMessage)
    .nullish()
    .transform((value) => value || null);

export const reviewQuery = z.object({ week: calendarDate.optional() });
const reviewParams = z.object({ week: calendarDate });
export const reviewInput = z.object(
  { wentWell: reviewNote('What went well'), toChange: reviewNote('What to change') },
  badRequest,
);

const noteColumns = `went_well AS "wentWell", to_change AS "toChange"`;

export function weeklyReviewRoutes(pool: Pool, today: () => string) {
  const router = Router();

  // The week holding `week` (this week when omitted). Weeks after this one cannot be reviewed yet.
  router.get('/', async (req, res) => {
    const { week } = reviewQuery.parse(req.query);
    const current = today();
    const thisWeek = weekStart(current);
    const start = weekStart(week ?? current);
    if (start < earliestWeek) throw new HttpError(400, `The week cannot be before ${earliestWeek}`);
    if (start > thisWeek)
      throw new HttpError(400, 'A week that has not started cannot be reviewed');
    const end = addDays(start, 6);
    const routines = await pool.query<ReviewRoutine>(
      `SELECT id, name, cadence, category, sort_order AS "sortOrder",
         (created_at AT TIME ZONE 'Asia/Seoul')::date AS "createdOn",
         (archived_at AT TIME ZONE 'Asia/Seoul')::date AS "archivedOn"
       FROM routines WHERE cadence IN ('daily', 'weekly')
       ORDER BY cadence, category, sort_order, routines.id`,
    );
    const checks = await pool.query<StatsCheck>(
      `SELECT routine_id AS "routineId", period_start AS "periodStart"
       FROM routine_checks WHERE period_start BETWEEN $1 AND $2`,
      [start, end],
    );
    const skips = await pool.query<StatsCheck>(
      `SELECT routine_id AS "routineId", period_start AS "periodStart"
       FROM routine_skips WHERE period_start BETWEEN $1 AND $2`,
      [start, end],
    );
    const notes = await pool.query<{ wentWell: string | null; toChange: string | null }>(
      `SELECT ${noteColumns} FROM weekly_reviews WHERE week_start = $1`,
      [start],
    );
    res.json({
      today: current,
      week: { start, end },
      previousWeek: start > earliestWeek ? addDays(start, -7) : null,
      nextWeek: start < thisWeek ? addDays(start, 7) : null,
      ...buildWeeklyReview({
        weekStart: start,
        today: current,
        routines: routines.rows,
        checks: checks.rows,
        skips: skips.rows,
      }),
      notes: notes.rows[0] ?? { wentWell: null, toChange: null },
    });
  });

  router.put('/:week', async (req, res) => {
    const { week } = reviewParams.parse(req.params);
    const { wentWell, toChange } = reviewInput.parse(requestBody(req.body));
    if (weekStart(week) !== week) throw new HttpError(400, 'The week must start on a Sunday');
    if (week < earliestWeek) throw new HttpError(400, `The week cannot be before ${earliestWeek}`);
    if (week > weekStart(today()))
      throw new HttpError(400, 'A week that has not started cannot be reviewed');
    const { rows } = await pool.query(
      `INSERT INTO weekly_reviews (week_start, went_well, to_change) VALUES ($1, $2, $3)
       ON CONFLICT (week_start) DO UPDATE
       SET went_well = EXCLUDED.went_well, to_change = EXCLUDED.to_change, updated_at = now()
       RETURNING ${noteColumns}`,
      [week, wentWell, toChange],
    );
    res.json({ notes: rows[0] });
  });

  return router;
}
