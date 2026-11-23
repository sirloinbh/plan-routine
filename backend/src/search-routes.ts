import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { bodyId } from './ids.js';
import { calendarDate } from './periods.js';
import { buildSnippet, type DiaryTexts, escapeLike } from './search.js';
import { HttpError } from './standard/http.js';

export const maxQueryLength = 100;
const maxOffset = 100_000;
const defaultLimit = 20;
const maxLimit = 50;

const whole = (label: string, min: number, max: number) =>
  z
    .string({ error: `${label} must be a number` })
    .regex(/^\d{1,9}$/, `${label} must be a whole number`)
    .transform(Number)
    .refine((value) => value >= min && value <= max, `${label} must be from ${min} to ${max}`);

export const searchQuery = z.object({
  q: z
    .string({ error: 'The search text must be text' })
    .trim()
    .refine(
      (value) => value.length <= maxQueryLength,
      `Search text must be ${maxQueryLength} characters or fewer`,
    )
    .refine((value) => !value.includes('\0'), 'Contains characters that are not allowed')
    .optional()
    .transform((value) => value || null),
  from: calendarDate.optional(),
  to: calendarDate.optional(),
  routineId: z
    .string({ error: 'Invalid routine ID' })
    .transform(Number)
    .pipe(bodyId('Invalid routine ID'))
    .optional(),
  // With a routine: the days it was done, or the days it was due and not done (past days only).
  result: z
    .enum(['missed', 'done'], { error: 'The result must be missed or done' })
    .default('missed'),
  limit: whole('The limit', 1, maxLimit).default(defaultLimit),
  offset: whole('The offset', 0, maxOffset).default(0),
});

type Row = {
  date: string;
  body: string;
  goodNote: string | null;
  regretNote: string | null;
  tomorrowNote: string | null;
  total: number;
};

export function searchRoutes(pool: Pool, today: () => string) {
  const router = Router();

  // Diary entries, newest first, that hold the text and sit in the date range, optionally only on the days one
  // daily routine was done or missed. Plain ILIKE: one user and a few thousand entries at most (#250).
  router.get('/', async (req, res) => {
    const { q, from, to, routineId, result, limit, offset } = searchQuery.parse(req.query);
    if (q === null && routineId === undefined)
      throw new HttpError(400, 'Enter a word to search for or choose a routine');
    if (from && to && from > to)
      throw new HttpError(400, 'The start date must not be after the end date');

    const params: unknown[] = [];
    const bind = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };
    const where: string[] = [];
    if (q !== null) {
      const pattern = bind(`%${escapeLike(q)}%`);
      where.push(
        `(d.body ILIKE ${pattern} OR d.good_note ILIKE ${pattern} OR d.regret_note ILIKE ${pattern} OR d.tomorrow_note ILIKE ${pattern})`,
      );
    }
    if (from) where.push(`d.entry_date >= ${bind(from)}::date`);
    if (to) where.push(`d.entry_date <= ${bind(to)}::date`);
    if (routineId !== undefined) {
      const id = bind(routineId);
      const checked = `EXISTS (SELECT 1 FROM routine_checks c WHERE c.routine_id = ${id} AND c.period_start = d.entry_date)`;
      if (result === 'done') where.push(checked);
      else {
        // Due that day by the same rule as the records page: created by then and not archived on or before it.
        where.push(`d.entry_date < ${bind(today())}::date AND NOT ${checked}
          AND EXISTS (SELECT 1 FROM routines r WHERE r.id = ${id} AND r.cadence = 'daily'
            AND (r.created_at AT TIME ZONE 'Asia/Seoul')::date <= d.entry_date
            AND (r.archived_at IS NULL OR (r.archived_at AT TIME ZONE 'Asia/Seoul')::date > d.entry_date))`);
      }
    }
    const { rows } = await pool.query<Row>(
      `SELECT d.entry_date AS date, d.body, d.good_note AS "goodNote", d.regret_note AS "regretNote",
         d.tomorrow_note AS "tomorrowNote", count(*) OVER ()::int AS total
       FROM diary_entries d
       WHERE ${where.join(' AND ')}
       ORDER BY d.entry_date DESC
       LIMIT ${bind(limit)} OFFSET ${bind(offset)}`,
      params,
    );
    res.json({
      limit,
      offset,
      // An offset past the last page has no row to carry the count.
      total: rows[0]?.total ?? 0,
      results: rows.map((row) => {
        const texts: DiaryTexts = {
          body: row.body,
          goodNote: row.goodNote,
          regretNote: row.regretNote,
          tomorrowNote: row.tomorrowNote,
        };
        return { date: row.date, ...buildSnippet(texts, q) };
      }),
    });
  });

  return router;
}
