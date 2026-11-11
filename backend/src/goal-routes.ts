import { Router } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod/v4';

import { daysBetween, periodFor } from './periods.js';
import { badRequest, noNul, nulMessage, requestBody } from './request-input.js';
import { routineAnchorDate } from './routines.js';

// Names id as text, so an ORDER BY on plain id would put 10 before 9: write twelve_week_goals.id.
const goalColumns = `id::text AS id, period_start AS "periodStart", title, achieved,
  review_note AS "reviewNote", reviewed_at AS "reviewedAt"`;
const notFound = { error: 'Goal not found' };
const pastGoal = { error: 'Goals of past periods cannot be edited' };

const goalIdMessage = 'Invalid goal ID';
const goalId = z.string({ error: goalIdMessage }).regex(/^\d{1,18}$/, goalIdMessage);
const idParam = z.object({ id: goalId });
// Not .min()/.max(): those also run on a non-string with a length and add a second message.
const goalInput = z.object(
  {
    title: z
      .string({
        error: (issue) => (issue.input === undefined ? 'Enter a goal' : 'The goal must be text'),
      })
      .trim()
      .refine((value) => value.length >= 1, 'Enter a goal')
      .refine((value) => value.length <= 200, 'The goal must be 200 characters or fewer')
      .refine(noNul, nulMessage),
  },
  badRequest,
);
// Far above any real period. Keep .max() first: zod 4.6.7 uses only leading length checks to refuse
// an oversized array before reading its elements (GHSA-mrhx-c7xc-m3w5).
const maxReviews = 1000;
const reviewsInput = z.object(
  {
    reviews: z
      .array(
        z.object(
          {
            id: goalId,
            achieved: z.boolean({ error: 'Invalid achieved value' }).nullable(),
            // A blank note is the same as no note.
            note: z
              .string({ error: 'The note must be text' })
              .trim()
              .refine((value) => value.length <= 1000, 'The note must be 1000 characters or fewer')
              .refine(noNul, nulMessage)
              .nullish()
              .transform((value) => value || null),
          },
          { error: 'Invalid review content' },
        ),
        { error: 'There are no goals to review' },
      )
      .max(maxReviews, `You can review at most ${maxReviews} goals at a time`)
      .refine((reviews) => reviews.length >= 1, 'There are no goals to review')
      .refine(
        (reviews) => new Set(reviews.map((review) => review.id)).size === reviews.length,
        'The same goal cannot be reviewed twice',
      ),
  },
  badRequest,
);

const routineIdMessage = 'Invalid routine ID';
const maxLinks = 200;
const routineLinksInput = z.object(
  {
    routineIds: z
      .array(z.string({ error: routineIdMessage }).regex(/^\d{1,18}$/, routineIdMessage), {
        error: 'Invalid list of routines to link',
      })
      .max(maxLinks, `A goal can link at most ${maxLinks} routines`)
      .refine((ids) => new Set(ids).size === ids.length, 'The same routine cannot be linked twice'),
  },
  badRequest,
);

// Only active daily and weekly routines can serve a goal, and only those are shown.
const linkedRoutinesSql = `SELECT r.id::text AS id, r.name, l.goal_id::text AS "goalId"
  FROM twelve_week_goal_routines l JOIN routines r ON r.id = l.routine_id
  WHERE l.goal_id = ANY($1::bigint[]) AND r.archived_at IS NULL
    AND r.cadence IN ('daily', 'weekly')
  ORDER BY CASE r.cadence WHEN 'daily' THEN 0 ELSE 1 END, r.category, r.sort_order, r.id`;

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
       ORDER BY period_start DESC, sort_order, twelve_week_goals.id`,
      [period.start],
    );
    const currentGoals = rows.filter((row) => row.periodStart === period.start);
    const links = await pool.query<{ id: string; name: string; goalId: string }>(
      linkedRoutinesSql,
      [currentGoals.map((row) => row.id)],
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
      current: {
        period,
        goals: currentGoals.map((row) => ({
          ...row,
          routines: links.rows
            .filter((link) => link.goalId === row.id)
            .map(({ id, name }) => ({ id, name })),
        })),
      },
      past: [...past].map(([start, goals]) => ({
        period: periodFor('twelve_week', start, anchorDate),
        goals,
      })),
    });
  });

  // First use and the new goal commit together; the server decides which period it belongs to.
  router.post('/', async (req, res) => {
    const { title } = goalInput.parse(requestBody(req.body));
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
  const refuseUnchanged = async (id: string, db: Pool | PoolClient = pool) => {
    const { rows } = await db.query('SELECT 1 FROM twelve_week_goals WHERE id = $1', [id]);
    return rows[0] ? pastGoal : notFound;
  };

  router.patch('/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { title } = goalInput.parse(requestBody(req.body));
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

  // Replaces the goal's links in one step, so a failure leaves the earlier ones as they were.
  router.put('/:id/routines', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { routineIds } = routineLinksInput.parse(requestBody(req.body));
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { period } = await currentPeriod(client);
      const target = await client.query(
        'SELECT id FROM twelve_week_goals WHERE id = $1 AND period_start = $2 FOR UPDATE',
        [id, period.start],
      );
      if (!target.rows[0]) {
        await client.query('ROLLBACK');
        // On this connection: waiting for another while holding it could stall every request.
        const refusal = await refuseUnchanged(id, client);
        res.status(refusal === notFound ? 404 : 400).json(refusal);
        return;
      }
      // FOR SHARE makes a concurrent archive wait, so an archived routine cannot gain a link.
      const allowed = await client.query(
        `SELECT id FROM routines
         WHERE id = ANY($1::bigint[]) AND archived_at IS NULL AND cadence IN ('daily', 'weekly')
         ORDER BY id FOR SHARE`,
        [routineIds],
      );
      if (allowed.rows.length !== routineIds.length) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: 'Some routines cannot be linked. Please check again' });
        return;
      }
      await client.query('DELETE FROM twelve_week_goal_routines WHERE goal_id = $1', [id]);
      await client.query(
        `INSERT INTO twelve_week_goal_routines (goal_id, routine_id)
         SELECT $1, unnest($2::bigint[])`,
        [id, routineIds],
      );
      const { rows } = await client.query<{ id: string; name: string; goalId: string }>(
        linkedRoutinesSql,
        [[id]],
      );
      await client.query('COMMIT');
      res.json({ routines: rows.map((row) => ({ id: row.id, name: row.name })) });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
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
    const { reviews } = reviewsInput.parse(requestBody(req.body));
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
        res.status(400).json({ error: 'Goals of a period that has not ended cannot be reviewed' });
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
         ORDER BY sort_order, twelve_week_goals.id`,
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
