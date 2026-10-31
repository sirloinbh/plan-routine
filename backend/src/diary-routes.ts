import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';

import { addDays, calendarDate } from './periods.js';

// Past days have no limit (confirmed on issue #9), but PostgreSQL has no year 0000, so the range
// needs a floor. A floor this early is out of the way of any real diary.
const earliestDate = '2000-01-01';

const entryColumns = `entry_date AS date, body, good_note AS "goodNote",
  regret_note AS "regretNote", tomorrow_note AS "tomorrowNote"`;

const diaryQuery = z.object({ date: calendarDate.optional() });
const diaryParams = z.object({ date: calendarDate });

// A blank note is the same as no note.
const diaryNote = (label: string) =>
  z
    .string({ invalid_type_error: `${label}은 글자여야 합니다` })
    .trim()
    .max(1000, `${label}은 1000자 이하로 입력해 주세요`)
    .nullish()
    .transform((value) => value || null);

const diaryInput = z.object({
  body: z
    .string({
      required_error: '일기 본문을 입력해 주세요',
      invalid_type_error: '일기 본문은 글자여야 합니다',
    })
    .trim()
    .min(1, '일기 본문을 입력해 주세요')
    .max(5000, '일기 본문은 5000자 이하로 입력해 주세요'),
  goodNote: diaryNote('잘한 점'),
  regretNote: diaryNote('아쉬운 점'),
  tomorrowNote: diaryNote('내일 할 일'),
});

// ISO dates compare correctly as strings.
function dateRangeError(date: string, today: string) {
  if (date > today) return '미래 날짜의 일기는 쓸 수 없습니다';
  if (date < earliestDate) return '2000년 이후 날짜의 일기만 쓸 수 있습니다';
  return null;
}

export function diaryRoutes(pool: Pool, today: () => string) {
  const router = Router();

  router.get('/', async (req, res) => {
    const { date } = diaryQuery.parse(req.query);
    const current = today();
    const target = date ?? current;
    const rangeError = dateRangeError(target, current);
    if (rangeError) {
      res.status(400).json({ error: rangeError });
      return;
    }
    const entry = await pool.query(
      `SELECT ${entryColumns} FROM diary_entries WHERE entry_date = $1`,
      [target],
    );
    // That day's daily routines, to help write the feedback. Counted here rather than through
    // /api/checklist, which only answers for recent dates.
    const progress = await pool.query<{ checked: number; total: number }>(
      `SELECT count(routine_checks.routine_id)::int AS checked, count(*)::int AS total
       FROM routines
       LEFT JOIN routine_checks
         ON routine_checks.routine_id = routines.id AND routine_checks.period_start = $1
       WHERE routines.archived_at IS NULL AND routines.cadence = 'daily'`,
      [target],
    );
    const neighbour = (days: number) => {
      const other = addDays(target, days);
      return dateRangeError(other, current) ? null : other;
    };
    res.json({
      date: target,
      today: current,
      previousDate: neighbour(-1),
      nextDate: neighbour(1),
      progress: progress.rows[0],
      entry: entry.rows[0] ?? null,
    });
  });

  // One entry per day: saving a day that already has one replaces it.
  router.put('/:date', async (req, res) => {
    const { date } = diaryParams.parse(req.params);
    const rangeError = dateRangeError(date, today());
    if (rangeError) {
      res.status(400).json({ error: rangeError });
      return;
    }
    // Express leaves req.body undefined without a JSON body; parse {} so messages stay Korean.
    const input = diaryInput.parse(req.body ?? {});
    const { rows } = await pool.query(
      `INSERT INTO diary_entries (entry_date, body, good_note, regret_note, tomorrow_note)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (entry_date) DO UPDATE SET
         body = EXCLUDED.body,
         good_note = EXCLUDED.good_note,
         regret_note = EXCLUDED.regret_note,
         tomorrow_note = EXCLUDED.tomorrow_note,
         updated_at = now()
       RETURNING ${entryColumns}`,
      [date, input.body, input.goodNote, input.regretNote, input.tomorrowNote],
    );
    res.json({ entry: rows[0] });
  });

  return router;
}
