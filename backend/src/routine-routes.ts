import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { bodyId, pathId } from './ids.js';
import { badRequest, requestBody } from './request-input.js';
import { anchorSettingKey, routineCadence, routineInput, routineName } from './routines.js';
import { HttpError } from './standard/http.js';
import { inTransaction } from './transaction.js';

export const routineColumns =
  'id, name, cadence, category, sort_order AS "sortOrder", project_link_id AS "projectLinkId"';
export const routineNotFound = 'Routine not found';

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
       INSERT INTO routines (name, cadence, category, sort_order)
       SELECT $1, $2::text, $3::text, COALESCE(MAX(sort_order) + 1, 0) FROM routines
       WHERE cadence = $2::text AND category IS NOT DISTINCT FROM $3::text AND archived_at IS NULL
       RETURNING ${routineColumns}`,
      [input.name, input.cadence, input.category ?? null, anchorSettingKey, today()],
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
  router.put('/:id/project-link', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { projectLinkId } = projectLinkInput.parse(requestBody(req.body));
    const { rows } = await pool.query(
      `UPDATE routines SET project_link_id = $1::bigint, updated_at = now()
       WHERE id = $2 AND archived_at IS NULL
         AND ($1::bigint IS NULL OR EXISTS (SELECT 1 FROM project_links WHERE id = $1::bigint))
       RETURNING ${routineColumns}`,
      [projectLinkId, id],
    );
    if (!rows[0]) throw new HttpError(404, 'Routine or project not found');
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
