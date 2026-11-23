import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { dailyRoutineOn } from './day-records.js';
import { addDays, calendarDate } from './periods.js';
import { badRequest, fromEarliestDate, noNul, nulMessage, requestBody } from './request-input.js';
import { HttpError } from './standard/http.js';

// Past days have no limit (confirmed on issue #9), but PostgreSQL has no year 0000, so the range
// needs a floor. A floor this early is out of the way of any real diary.
const earliestDate = '2000-01-01';

export const entryColumns = `entry_date AS date, body, good_note AS "goodNote",
  regret_note AS "regretNote", tomorrow_note AS "tomorrowNote", mood, energy`;

export const diaryQuery = z.object({ date: calendarDate.optional() });
const diaryParams = z.object({ date: calendarDate });

// Not .min()/.max(): those also run on a non-string with a length and add a second message.
// A blank note is the same as no note.
const diaryNote = (label: string) =>
  z
    .string({ error: `${label} must be text` })
    .trim()
    .refine((value) => value.length <= 1000, `${label} must be 1000 characters or fewer`)
    .refine(noNul, nulMessage)
    .nullish()
    .transform((value) => value || null);

// A score is a whole number from 1 to 5, or none. Checked in steps so each case has its own message.
const diaryScore = (label: string) =>
  z
    .number({ error: `${label} must be a number from 1 to 5` })
    .refine(Number.isInteger, `${label} must be a whole number from 1 to 5`)
    .refine((value) => value >= 1 && value <= 5, `${label} must be from 1 to 5`)
    .nullish()
    .transform((value) => value ?? null);

export const diaryInput = z.object(
  {
    body: z
      .string({
        error: (issue) =>
          issue.input === undefined ? 'Enter the diary entry' : 'The diary entry must be text',
      })
      .trim()
      .refine((value) => value.length >= 1, 'Enter the diary entry')
      .refine((value) => value.length <= 5000, 'The diary entry must be 5000 characters or fewer')
      .refine(noNul, nulMessage),
    goodNote: diaryNote('Good points'),
    regretNote: diaryNote('Regrets'),
    tomorrowNote: diaryNote("Tomorrow's tasks"),
    mood: diaryScore('Mood'),
    energy: diaryScore('Energy'),
  },
  badRequest,
);

// ISO dates compare correctly as strings.
function dateRangeError(date: string, today: string) {
  if (date > today) return 'A diary entry cannot be written for a future date';
  if (date < earliestDate) return `Diary entries can only be written ${fromEarliestDate}`;
  return null;
}

export function diaryRoutes(pool: Pool, today: () => string) {
  const router = Router();

  router.get('/', async (req, res) => {
    const { date } = diaryQuery.parse(req.query);
    const current = today();
    const target = date ?? current;
    const rangeError = dateRangeError(target, current);
    if (rangeError) throw new HttpError(400, rangeError);
    const entry = await pool.query(
      `SELECT ${entryColumns} FROM diary_entries WHERE entry_date = $1`,
      [target],
    );
    // The routines of that day and their checks, to help write the feedback. Read here rather than
    // through /api/checklist, which only answers for recent dates.
    const routines = await pool.query<{ checked: boolean; skipped: boolean }>(
      `SELECT routines.id, routines.name, routines.category,
         EXISTS (
           SELECT 1 FROM routine_checks
           WHERE routine_checks.routine_id = routines.id AND routine_checks.period_start = $1
         ) AS checked,
         EXISTS (
           SELECT 1 FROM routine_skips
           WHERE routine_skips.routine_id = routines.id AND routine_skips.period_start = $1
         ) AS skipped
       FROM routines
       WHERE ${dailyRoutineOn('routines', '$1::date')}
       ORDER BY routines.category, routines.sort_order, routines.id`,
      [target],
    );
    const neighbour = (days: number) => {
      const other = addDays(target, days);
      return dateRangeError(other, current) ? null : other;
    };
    // A routine skipped that day (#243) is left out of the total, as on the records page and the stats.
    const counted = routines.rows.filter((routine) => !routine.skipped);
    res.json({
      date: target,
      today: current,
      previousDate: neighbour(-1),
      nextDate: neighbour(1),
      progress: {
        checked: counted.filter((routine) => routine.checked).length,
        total: counted.length,
      },
      routines: routines.rows,
      entry: entry.rows[0] ?? null,
    });
  });

  // One entry per day: saving a day that already has one replaces it.
  router.put('/:date', async (req, res) => {
    const { date } = diaryParams.parse(req.params);
    const rangeError = dateRangeError(date, today());
    if (rangeError) throw new HttpError(400, rangeError);
    const input = diaryInput.parse(requestBody(req.body));
    const { rows } = await pool.query(
      `INSERT INTO diary_entries (entry_date, body, good_note, regret_note, tomorrow_note, mood, energy)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (entry_date) DO UPDATE SET
         body = EXCLUDED.body,
         good_note = EXCLUDED.good_note,
         regret_note = EXCLUDED.regret_note,
         tomorrow_note = EXCLUDED.tomorrow_note,
         mood = EXCLUDED.mood,
         energy = EXCLUDED.energy,
         updated_at = now()
       RETURNING ${entryColumns}`,
      [
        date,
        input.body,
        input.goodNote,
        input.regretNote,
        input.tomorrowNote,
        input.mood,
        input.energy,
      ],
    );
    res.json({ entry: rows[0] });
  });

  return router;
}
