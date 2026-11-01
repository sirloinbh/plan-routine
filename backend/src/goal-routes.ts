import { Router } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';

import { daysBetween, periodFor } from './periods.js';
import { routineAnchorDate } from './routines.js';

const goalColumns = `id::text AS id, period_start AS "periodStart", title, achieved,
  review_note AS "reviewNote", reviewed_at AS "reviewedAt"`;
const notFound = { error: '목표를 찾을 수 없습니다' };
const pastGoal = { error: '지난 기간의 목표는 고칠 수 없습니다' };

// PostgreSQL text cannot hold a NUL character; without this check it would answer a 500.
const noNul = (value: string) => !value.includes('\0');
const nulMessage = '쓸 수 없는 문자가 들어 있습니다';

const goalIdMessage = '목표 번호가 올바르지 않습니다';
const goalId = z
  .string({ required_error: goalIdMessage, invalid_type_error: goalIdMessage })
  .regex(/^\d{1,18}$/, goalIdMessage);
const badRequest = { invalid_type_error: '요청 형식이 올바르지 않습니다' };
const idParam = z.object({ id: goalId });
const goalInput = z.object(
  {
    title: z
      .string({
        required_error: '목표를 입력해 주세요',
        invalid_type_error: '목표는 글자여야 합니다',
      })
      .trim()
      .min(1, '목표를 입력해 주세요')
      .max(200, '목표는 200자 이하로 입력해 주세요')
      .refine(noNul, nulMessage),
  },
  badRequest,
);
const reviewsInput = z.object(
  {
    reviews: z
      .array(
        z.object(
          {
            id: goalId,
            achieved: z
              .boolean({
                required_error: '달성 여부가 올바르지 않습니다',
                invalid_type_error: '달성 여부가 올바르지 않습니다',
              })
              .nullable(),
            // A blank note is the same as no note.
            note: z
              .string({ invalid_type_error: '메모는 글자여야 합니다' })
              .trim()
              .max(1000, '메모는 1000자 이하로 입력해 주세요')
              .refine(noNul, nulMessage)
              .nullish()
              .transform((value) => value || null),
          },
          { invalid_type_error: '회고 내용이 올바르지 않습니다' },
        ),
        { required_error: '회고할 목표가 없습니다', invalid_type_error: '회고할 목표가 없습니다' },
      )
      .min(1, '회고할 목표가 없습니다')
      .refine(
        (reviews) => new Set(reviews.map((review) => review.id)).size === reviews.length,
        '같은 목표를 두 번 회고할 수 없습니다',
      ),
  },
  badRequest,
);

// Express leaves req.body undefined without a JSON body; parse {} so field messages stay Korean.
const body = (value: unknown) => value ?? {};

type GoalRow = {
  id: string;
  periodStart: string;
  title: string;
  achieved: boolean | null;
  reviewNote: string | null;
  reviewedAt: string | null;
};

export function goalRoutes(pool: Pool, today: () => string) {
  const router = Router();

  const currentPeriod = async (db: Pool | PoolClient) => {
    const current = today();
    const anchorDate = await routineAnchorDate(db, current);
    return { current, anchorDate, period: periodFor('twelve_week', current, anchorDate) };
  };

  router.get('/', async (_req, res) => {
    const { current, anchorDate, period } = await currentPeriod(pool);
    const { rows } = await pool.query<GoalRow>(
      `SELECT ${goalColumns} FROM twelve_week_goals
       WHERE period_start <= $1
       ORDER BY period_start DESC, sort_order, id`,
      [period.start],
    );
    // Rows arrive newest period first, so a Map keeps past periods in that order.
    const past = new Map<string, GoalRow[]>();
    for (const row of rows)
      if (row.periodStart !== period.start)
        past.set(row.periodStart, [...(past.get(row.periodStart) ?? []), row]);
    res.json({
      today: current,
      // Counts the week in progress, so the last week reads as 1 rather than 0.
      remainingWeeks: Math.ceil((daysBetween(current, period.end) + 1) / 7),
      current: { period, goals: rows.filter((row) => row.periodStart === period.start) },
      past: [...past].map(([start, goals]) => ({
        period: periodFor('twelve_week', start, anchorDate),
        goals,
      })),
    });
  });

  // First use and the new goal commit together; the server decides which period it belongs to.
  router.post('/', async (req, res) => {
    const { title } = goalInput.parse(body(req.body));
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { period } = await currentPeriod(client);
      const { rows } = await client.query<GoalRow>(
        `INSERT INTO twelve_week_goals (period_start, title, sort_order)
         SELECT $1::date, $2, COALESCE(MAX(sort_order) + 1, 0) FROM twelve_week_goals
         WHERE period_start = $1::date
         RETURNING ${goalColumns}`,
        [period.start, title],
      );
      await client.query('COMMIT');
      res.status(201).json({ goal: rows[0] });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  });

  // Answers why a goal outside the current period could not be changed.
  const refuseUnchanged = async (id: string) => {
    const { rows } = await pool.query('SELECT 1 FROM twelve_week_goals WHERE id = $1', [id]);
    return rows[0] ? pastGoal : notFound;
  };

  router.patch('/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { title } = goalInput.parse(body(req.body));
    const { period } = await currentPeriod(pool);
    const { rows } = await pool.query(
      `UPDATE twelve_week_goals SET title = $1, updated_at = now()
       WHERE id = $2 AND period_start = $3 RETURNING ${goalColumns}`,
      [title, id, period.start],
    );
    if (!rows[0]) {
      const refusal = await refuseUnchanged(id);
      res.status(refusal === notFound ? 404 : 400).json(refusal);
      return;
    }
    res.json({ goal: rows[0] });
  });

  router.delete('/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { period } = await currentPeriod(pool);
    const { rows } = await pool.query(
      'DELETE FROM twelve_week_goals WHERE id = $1 AND period_start = $2 RETURNING id::text AS id',
      [id, period.start],
    );
    if (!rows[0]) {
      const refusal = await refuseUnchanged(id);
      res.status(refusal === notFound ? 404 : 400).json(refusal);
      return;
    }
    res.json({ id });
  });

  // All of a period's reviews save together: one bad goal cancels the whole request.
  router.put('/reviews', async (req, res) => {
    const { reviews } = reviewsInput.parse(body(req.body));
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { period } = await currentPeriod(client);
      const ids = reviews.map((review) => review.id);
      const found = await client.query<{ periodStart: string }>(
        `SELECT period_start AS "periodStart" FROM twelve_week_goals
         WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE`,
        [ids],
      );
      if (found.rows.length !== ids.length) {
        await client.query('ROLLBACK');
        res.status(404).json(notFound);
        return;
      }
      if (found.rows.some((row) => row.periodStart >= period.start)) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: '아직 끝나지 않은 기간의 목표는 회고할 수 없습니다' });
        return;
      }
      for (const { id, achieved, note } of reviews)
        // Clearing both answers takes the goal back to "not reviewed yet".
        await client.query(
          `UPDATE twelve_week_goals
           SET achieved = $2, review_note = $3,
               reviewed_at = CASE WHEN $2::boolean IS NULL AND $3::text IS NULL THEN NULL ELSE now() END,
               updated_at = now()
           WHERE id = $1`,
          [id, achieved, note],
        );
      const { rows } = await client.query(
        `SELECT ${goalColumns} FROM twelve_week_goals WHERE id = ANY($1::bigint[])
         ORDER BY sort_order, id`,
        [ids],
      );
      await client.query('COMMIT');
      res.json({ goals: rows });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  });

  return router;
}
