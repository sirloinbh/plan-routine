import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { bodyId, pathId } from './ids.js';
import { badRequest, hasPgCode, requestBody } from './request-input.js';
import {
  anchorSettingKey,
  normalizeWeekdays,
  routineCadence,
  routineInput,
  routineName,
  routineTarget,
  routineTimesPerWeek,
  routineUnit,
  routineWeekdays,
} from './routines.js';
import { auditContext, writeAudit } from './standard/audit.js';
import { HttpError } from './standard/http.js';
import { inTransaction } from './transaction.js';

export const routineColumns =
  'id, name, cadence, category, sort_order AS "sortOrder", project_link_id AS "projectLinkId", weekdays, times_per_week AS "timesPerWeek", unit, target_amount AS "targetAmount"';
export const routineNotFound = 'Routine not found';
const projectOrRoutineNotFound = 'Routine or project not found';

export const listQuery = z.object({ cadence: routineCadence.optional() });
export const routineId = pathId('Invalid routine ID');

export type Db = Pick<Pool, 'query'>;

// Active routines only; archived ones keep their checks but leave the list. `limit` is for callers that must bound the
// result (the AI tool); the route lists them all.
export async function listRoutines(db: Db, cadence?: string, limit?: number) {
  const params: unknown[] = [cadence ?? null];
  if (limit !== undefined) params.push(limit);
  const { rows } = await db.query(
    `SELECT ${routineColumns} FROM routines
     WHERE archived_at IS NULL AND ($1::text IS NULL OR cadence = $1)
     ORDER BY cadence, category, sort_order, routines.id${limit === undefined ? '' : ' LIMIT $2'}`,
    params,
  );
  return rows;
}
const idParam = z.object({ id: routineId });
export const renameInput = z.object({ name: routineName }, badRequest);
export const moveInput = z.object(
  { direction: z.enum(['up', 'down'], { error: 'Direction must be up or down' }) },
  badRequest,
);

// The whole amount setting of a routine at once, so repeating a request changes nothing. The unit may change or go
// (decision on #276): amounts already recorded keep their numbers and show the new unit, and are hidden, not
// deleted, while there is no unit.
export const amountInput = z.object(
  { unit: routineUnit.nullish(), targetAmount: routineTarget.nullish() },
  badRequest,
);

// The whole schedule of a routine at once, so repeating a request changes nothing: weekdays for a daily routine,
// times per week for a weekly one (null or left out: every day, or once a week).
export const scheduleInput = z.object(
  { weekdays: routineWeekdays.nullish(), timesPerWeek: routineTimesPerWeek.nullish() },
  badRequest,
);

export const projectLinkInput = z.object(
  {
    projectLinkId: bodyId('Invalid project to link').nullable(),
  },
  badRequest,
);

export function routineRoutes(pool: Pool, today: () => string) {
  const router = Router();

  router.get('/', async (req, res) => {
    const { cadence } = listQuery.parse(req.query);
    res.json({ routines: await listRoutines(pool, cadence) });
  });

  router.post('/', async (req, res) => {
    const input = routineInput.parse(requestBody(req.body));
    // Creating the first routine counts as first use for four/twelve-week periods. One statement
    // keeps both writes atomic. Concurrent adds may share a sort_order; id breaks the tie and the
    // next move renumbers the group.
    const { rows } = await pool.query(
      `WITH first_use AS (
         INSERT INTO app_settings (key, value) VALUES ($4, $5) ON CONFLICT (key) DO NOTHING
       )
       INSERT INTO routines (name, cadence, category, weekdays, times_per_week, unit, target_amount, sort_order)
       SELECT $1, $2::text, $3::text, $6::smallint[], $7::smallint, $8::text, $9::double precision, COALESCE(MAX(sort_order) + 1, 0) FROM routines
       WHERE cadence = $2::text AND category IS NOT DISTINCT FROM $3::text AND archived_at IS NULL
       RETURNING ${routineColumns}`,
      [
        input.name,
        input.cadence,
        input.category ?? null,
        anchorSettingKey,
        today(),
        normalizeWeekdays(input.weekdays),
        input.timesPerWeek ?? null,
        input.unit ?? null,
        input.targetAmount ?? null,
      ],
    );
    res.status(201).json({ routine: rows[0] });
  });

  router.patch('/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { name } = renameInput.parse(requestBody(req.body));
    const { rows } = await pool.query(
      `UPDATE routines SET name = $1, updated_at = now()
       WHERE id = $2 AND archived_at IS NULL RETURNING ${routineColumns}`,
      [name, id],
    );
    if (!rows[0]) throw new HttpError(404, routineNotFound);
    res.json({ routine: rows[0] });
  });

  // Swaps the routine with its neighbour and renumbers the group 0..n in one transaction.
  router.post('/:id/move', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { direction } = moveInput.parse(requestBody(req.body));
    const reply = await inTransaction(pool, async (client) => {
      const target = await client.query<{ cadence: string; category: string | null }>(
        'SELECT cadence, category FROM routines WHERE id = $1 AND archived_at IS NULL',
        [id],
      );
      if (!target.rows[0]) throw new HttpError(404, routineNotFound);
      // Lock the whole group in id order so concurrent moves queue instead of deadlocking.
      await client.query(
        `SELECT id FROM routines
         WHERE cadence = $1 AND category IS NOT DISTINCT FROM $2 AND archived_at IS NULL
         ORDER BY id FOR UPDATE`,
        [target.rows[0].cadence, target.rows[0].category],
      );
      const group = await client.query<{ id: number }>(
        `SELECT id FROM routines
         WHERE cadence = $1 AND category IS NOT DISTINCT FROM $2 AND archived_at IS NULL
         ORDER BY sort_order, routines.id`,
        [target.rows[0].cadence, target.rows[0].category],
      );
      const ids = group.rows.map((row) => row.id);
      const index = ids.indexOf(id);
      if (index < 0) {
        // Archived by another request between the two reads.
        throw new HttpError(404, routineNotFound);
      }
      const swapWith = direction === 'up' ? index - 1 : index + 1;
      if (swapWith >= 0 && swapWith < ids.length)
        [ids[index], ids[swapWith]] = [ids[swapWith], ids[index]];
      await client.query(
        `UPDATE routines SET sort_order = ordered.position - 1, updated_at = now()
         FROM unnest($1::bigint[]) WITH ORDINALITY AS ordered(id, position)
         WHERE routines.id = ordered.id AND routines.sort_order <> ordered.position - 1`,
        [ids],
      );
      const { rows } = await client.query(
        `SELECT ${routineColumns} FROM routines WHERE id = ANY($1::bigint[]) ORDER BY sort_order, routines.id`,
        [ids],
      );
      return { status: 200, body: { routines: rows } };
    });
    res.status(reply.status).json(reply.body);
  });

  // Null clears the link. A project removed meanwhile answers 404, not a database error.
  // A schedule change applies to the whole history (decision on #276): past periods are read with the new
  // schedule. Switching a weekly routine between once a week and N times a week also converts its checks, in
  // the same transaction, and writes an audit entry.
  router.put('/:id/schedule', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const input = scheduleInput.parse(requestBody(req.body));
    const reply = await inTransaction(pool, async (client) => {
      const current = await client.query<{
        cadence: string;
        weekdays: number[] | null;
        timesPerWeek: number | null;
        hasUnit: boolean;
      }>(
        `SELECT cadence, weekdays, times_per_week AS "timesPerWeek", unit IS NOT NULL AS "hasUnit"
         FROM routines WHERE id = $1 AND archived_at IS NULL FOR UPDATE`,
        [id],
      );
      const before = current.rows[0];
      if (!before) throw new HttpError(404, routineNotFound);
      if (input.weekdays && before.cadence !== 'daily')
        throw new HttpError(400, 'Only daily routines can have weekdays');
      if (input.weekdays?.length === 0) throw new HttpError(400, 'Choose at least one weekday');
      if (input.timesPerWeek && before.cadence !== 'weekly')
        throw new HttpError(400, 'Only weekly routines can have times per week');
      const weekdays = normalizeWeekdays(input.weekdays);
      const timesPerWeek = input.timesPerWeek ?? null;
      let converted = null as null | { from: string; to: string };
      if (
        before.cadence === 'weekly' &&
        (before.timesPerWeek === null) !== (timesPerWeek === null)
      ) {
        if (timesPerWeek !== null) {
          // Once a week -> N times: a check sits on the week's first day, so it stays there as a check on that
          // day only. Nothing moves; skips (one per week, at the week start) stay as they are.
          converted = { from: 'once a week', to: 'times per week' };
        } else {
          // N times -> once a week: each week's checks collapse into one check on the week's first day (Sunday),
          // keeping the earliest check time and the sum of the week's amounts. Skips stay (a skipped week has no
          // checks, so there is nothing to merge into it).
          await client.query(
            `WITH weeks AS (
               DELETE FROM routine_checks WHERE routine_id = $1
               RETURNING period_start, checked_at, amount
             ), merged AS (
               SELECT (period_start - EXTRACT(DOW FROM period_start)::int) AS week_start,
                      min(checked_at) AS checked_at, sum(amount) AS amount
               FROM weeks GROUP BY 1
             )
             INSERT INTO routine_checks (routine_id, period_start, checked_at, amount)
             SELECT $1, week_start, checked_at, amount FROM merged`,
            [id],
          );
          converted = { from: 'times per week', to: 'once a week' };
        }
      }
      const { rows } = await client.query(
        `UPDATE routines SET weekdays = $1::smallint[], times_per_week = $2::smallint, updated_at = now()
         WHERE id = $3 RETURNING ${routineColumns}`,
        [weekdays, timesPerWeek, id],
      );
      await writeAudit(client, {
        ...auditContext(req, res),
        action: 'update',
        entity: 'routine_schedule',
        entityId: id,
        before: { weekdays: before.weekdays, timesPerWeek: before.timesPerWeek },
        after: { weekdays, timesPerWeek, ...(converted ? { checksConverted: converted } : {}) },
      });
      return { status: 200, body: { routine: rows[0] } };
    });
    res.status(reply.status).json(reply.body);
  });

  router.put('/:id/amount', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { unit = null, targetAmount = null } = amountInput.parse(requestBody(req.body));
    const reply = await inTransaction(pool, async (client) => {
      const current = await client.query(
        'SELECT 1 FROM routines WHERE id = $1 AND archived_at IS NULL FOR UPDATE',
        [id],
      );
      if (!current.rows[0]) throw new HttpError(404, routineNotFound);
      if (targetAmount !== null && unit === null)
        throw new HttpError(400, 'Enter a unit for the target');
      const { rows } = await client.query(
        `UPDATE routines SET unit = $1, target_amount = $2, updated_at = now()
         WHERE id = $3 RETURNING ${routineColumns}`,
        [unit, targetAmount, id],
      );
      return { status: 200, body: { routine: rows[0] } };
    });
    res.status(reply.status).json(reply.body);
  });

  router.put('/:id/project-link', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { projectLinkId } = projectLinkInput.parse(requestBody(req.body));
    const { rows } = await pool
      .query(
        `UPDATE routines SET project_link_id = $1::bigint, updated_at = now()
         WHERE id = $2 AND archived_at IS NULL
           AND ($1::bigint IS NULL OR EXISTS (SELECT 1 FROM project_links WHERE id = $1::bigint))
         RETURNING ${routineColumns}`,
        [projectLinkId, id],
      )
      .catch((error: unknown) => {
        // The project was deleted after the EXISTS check: the foreign key refuses the link (#152).
        if (hasPgCode(error, '23503')) throw new HttpError(404, projectOrRoutineNotFound);
        throw error;
      });
    if (!rows[0]) throw new HttpError(404, projectOrRoutineNotFound);
    res.json({ routine: rows[0] });
  });

  // "Delete" archives: the routine leaves the list but its past checks stay.
  router.post('/:id/archive', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { rows } = await pool.query(
      `UPDATE routines SET archived_at = now(), updated_at = now()
       WHERE id = $1 AND archived_at IS NULL RETURNING ${routineColumns}`,
      [id],
    );
    if (!rows[0]) throw new HttpError(404, routineNotFound);
    res.json({ routine: rows[0] });
  });

  return router;
}
