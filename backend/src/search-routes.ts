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
  kind: 'diary' | 'skip' | 'missed';
  date: string;
  body: string | null;
  goodNote: string | null;
  regretNote: string | null;
  tomorrowNote: string | null;
  routineId: number | null;
  routineName: string | null;
  reason: string | null;
  total: number;
};

export function searchRoutes(pool: Pool, today: () => string) {
  const router = Router();

  // Diary entries and skip reasons, newest first, that hold the text and sit in the date range, optionally only on
  // the days one daily routine was done or missed; for a routine alone also its missed days that have no diary entry.
  // Plain ILIKE: one user and a few thousand entries at most (#250).
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
    // Each source filters its own date column; the text, dates and routine are bound once and shared.
    const pattern = q !== null ? bind(`%${escapeLike(q)}%`) : null;
    const fromParam = from ? `${bind(from)}::date` : null;
    const toParam = to ? `${bind(to)}::date` : null;
    const routineParam = routineId !== undefined ? bind(routineId) : null;
    // Missed days are past days only, so "today" is bound once for both uses below.
    const todayParam = routineParam && result === 'missed' ? `${bind(today())}::date` : null;
    const range = (column: string) => [
      ...(fromParam ? [`${column} >= ${fromParam}`] : []),
      ...(toParam ? [`${column} <= ${toParam}`] : []),
    ];

    const diaryWhere = range('d.entry_date');
    if (pattern)
      diaryWhere.push(
        `(d.body ILIKE ${pattern} OR d.good_note ILIKE ${pattern} OR d.regret_note ILIKE ${pattern} OR d.tomorrow_note ILIKE ${pattern})`,
      );
    if (routineParam) {
      const checked = `EXISTS (SELECT 1 FROM routine_checks c WHERE c.routine_id = ${routineParam} AND c.period_start = d.entry_date)`;
      if (result === 'done') diaryWhere.push(checked);
      else {
        // Due that day by the same rule as the records page: created by then and not archived on or before it.
        diaryWhere.push(`d.entry_date < ${todayParam} AND NOT ${checked}
          AND EXISTS (SELECT 1 FROM routines r WHERE r.id = ${routineParam} AND r.cadence = 'daily'
            AND (r.created_at AT TIME ZONE 'Asia/Seoul')::date <= d.entry_date
            AND (r.archived_at IS NULL OR (r.archived_at AT TIME ZONE 'Asia/Seoul')::date > d.entry_date))`);
      }
    }
    const sources = [
      `SELECT 'diary' AS kind, d.entry_date AS date, d.body, d.good_note AS "goodNote",
         d.regret_note AS "regretNote", d.tomorrow_note AS "tomorrowNote",
         NULL::bigint AS "routineId", NULL::text AS "routineName", NULL::text AS reason
       FROM diary_entries d WHERE ${diaryWhere.join(' AND ') || 'true'}`,
    ];
    // A skipped day counts as not done, so skip reasons are searched unless only the days the routine was done are
    // asked for. Only daily routines (their period start is the day) and only skips that have a reason.
    if (!(routineParam && result === 'done')) {
      const skipWhere = [...range('s.period_start'), "r.cadence = 'daily'", 's.reason IS NOT NULL'];
      if (pattern) skipWhere.push(`s.reason ILIKE ${pattern}`);
      if (routineParam) skipWhere.push(`s.routine_id = ${routineParam}`);
      sources.push(
        `SELECT 'skip', s.period_start, NULL, NULL, NULL, NULL, s.routine_id, r.name, s.reason
         FROM routine_skips s JOIN routines r ON r.id = s.routine_id WHERE ${skipWhere.join(' AND ')}`,
      );
    }
    // With a routine and no text, the days it was missed that have no diary entry, so they can be found too: from the
    // later of the start date and the day the routine was created, to the earlier of the end date and yesterday.
    if (todayParam && routineParam && q === null)
      sources.push(
        `SELECT 'missed', days.date::date, NULL, NULL, NULL, NULL, r.id, r.name, NULL
         FROM routines r
         CROSS JOIN LATERAL generate_series(
           GREATEST(COALESCE(${fromParam ?? 'NULL::date'}, DATE '2000-01-01'), (r.created_at AT TIME ZONE 'Asia/Seoul')::date)::timestamp,
           LEAST(COALESCE(${toParam ?? 'NULL::date'}, ${todayParam} - 1), ${todayParam} - 1)::timestamp,
           interval '1 day'
         ) AS days(date)
         WHERE r.id = ${routineParam} AND r.cadence = 'daily'
           AND (r.archived_at IS NULL OR (r.archived_at AT TIME ZONE 'Asia/Seoul')::date > days.date::date)
           AND NOT EXISTS (SELECT 1 FROM routine_checks c WHERE c.routine_id = r.id AND c.period_start = days.date::date)
           AND NOT EXISTS (SELECT 1 FROM diary_entries d WHERE d.entry_date = days.date::date)`,
      );
    const { rows } = await pool.query<Row>(
      `SELECT *, count(*) OVER ()::int AS total FROM (${sources.join(' UNION ALL ')}) AS found
       ORDER BY date DESC, kind, "routineName"
       LIMIT ${bind(limit)} OFFSET ${bind(offset)}`,
      params,
    );
    res.json({
      limit,
      offset,
      // An offset past the last page has no row to carry the count.
      total: rows[0]?.total ?? 0,
      results: rows.map((row) => {
        if (row.kind === 'missed')
          return {
            kind: 'missed' as const,
            date: row.date,
            field: 'none' as const,
            snippet: '',
            routineId: row.routineId,
            routineName: row.routineName,
          };
        if (row.kind === 'skip')
          return {
            kind: 'skip' as const,
            date: row.date,
            field: 'skipReason' as const,
            snippet: row.reason ?? '',
            routineId: row.routineId,
            routineName: row.routineName,
          };
        const texts: DiaryTexts = {
          body: row.body,
          goodNote: row.goodNote,
          regretNote: row.regretNote,
          tomorrowNote: row.tomorrowNote,
        };
        return { kind: 'diary' as const, date: row.date, ...buildSnippet(texts, q) };
      }),
    });
  });

  return router;
}
