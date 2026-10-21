import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { cadences } from './periods.js';
import { routineAnchorDate, routineInput, routineName } from './routines.js';

const routineColumns = 'id::text AS id, name, cadence, category, sort_order AS "sortOrder"';
const notFound = { error: '루틴을 찾을 수 없습니다' };

const listQuery = z.object({
  cadence: z
    .enum(cadences, {
      errorMap: () => ({ message: '루틴 주기는 매일, 매주, 4주, 12주 중 하나여야 합니다' }),
    })
    .optional(),
});
const idParam = z.object({ id: z.string().regex(/^\d{1,18}$/, '루틴 번호가 올바르지 않습니다') });
const renameInput = z.object({ name: routineName });
const moveInput = z.object({
  direction: z.enum(['up', 'down'], {
    errorMap: () => ({ message: '이동 방향은 위 또는 아래여야 합니다' }),
  }),
});

// Express leaves req.body undefined without a JSON body; parse {} so field messages stay Korean.
const body = (value: unknown) => value ?? {};

export function routineRoutes(pool: Pool, today: () => string) {
  const router = Router();

  // Active routines only; archived ones keep their checks but leave the list.
  router.get('/', async (req, res) => {
    const { cadence } = listQuery.parse(req.query);
    const { rows } = await pool.query(
      `SELECT ${routineColumns} FROM routines
       WHERE archived_at IS NULL AND ($1::text IS NULL OR cadence = $1)
       ORDER BY cadence, category, sort_order, id`,
      [cadence ?? null],
    );
    res.json({ routines: rows });
  });

  router.post('/', async (req, res) => {
    const input = routineInput.parse(body(req.body));
    // Creating the first routine counts as first use for four/twelve-week periods.
    await routineAnchorDate(pool, today());
    const { rows } = await pool.query(
      `INSERT INTO routines (name, cadence, category, sort_order)
       SELECT $1, $2::text, $3::text, COALESCE(MAX(sort_order) + 1, 0) FROM routines
       WHERE cadence = $2::text AND category IS NOT DISTINCT FROM $3::text AND archived_at IS NULL
       RETURNING ${routineColumns}`,
      [input.name, input.cadence, input.category ?? null],
    );
    res.status(201).json({ routine: rows[0] });
  });

  router.patch('/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { name } = renameInput.parse(body(req.body));
    const { rows } = await pool.query(
      `UPDATE routines SET name = $1, updated_at = now()
       WHERE id = $2 AND archived_at IS NULL RETURNING ${routineColumns}`,
      [name, id],
    );
    if (!rows[0]) {
      res.status(404).json(notFound);
      return;
    }
    res.json({ routine: rows[0] });
  });

  // Swaps the routine with its neighbour and renumbers the group 0..n in one transaction.
  router.post('/:id/move', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { direction } = moveInput.parse(body(req.body));
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const target = await client.query<{ cadence: string; category: string | null }>(
        'SELECT cadence, category FROM routines WHERE id = $1 AND archived_at IS NULL',
        [id],
      );
      if (!target.rows[0]) {
        await client.query('ROLLBACK');
        res.status(404).json(notFound);
        return;
      }
      // Lock the whole group in id order so concurrent moves queue instead of deadlocking.
      await client.query(
        `SELECT id FROM routines
         WHERE cadence = $1 AND category IS NOT DISTINCT FROM $2 AND archived_at IS NULL
         ORDER BY id FOR UPDATE`,
        [target.rows[0].cadence, target.rows[0].category],
      );
      const group = await client.query<{ id: string }>(
        `SELECT id::text AS id FROM routines
         WHERE cadence = $1 AND category IS NOT DISTINCT FROM $2 AND archived_at IS NULL
         ORDER BY sort_order, id`,
        [target.rows[0].cadence, target.rows[0].category],
      );
      const ids = group.rows.map((row) => row.id);
      const index = ids.indexOf(id);
      if (index < 0) {
        // Archived by another request between the two reads.
        await client.query('ROLLBACK');
        res.status(404).json(notFound);
        return;
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
        `SELECT ${routineColumns} FROM routines WHERE id = ANY($1::bigint[]) ORDER BY sort_order, id`,
        [ids],
      );
      await client.query('COMMIT');
      res.json({ routines: rows });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  });

  // "Delete" archives: the routine leaves the list but its past checks stay.
  router.post('/:id/archive', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { rows } = await pool.query(
      `UPDATE routines SET archived_at = now(), updated_at = now()
       WHERE id = $1 AND archived_at IS NULL RETURNING ${routineColumns}`,
      [id],
    );
    if (!rows[0]) {
      res.status(404).json(notFound);
      return;
    }
    res.json({ routine: rows[0] });
  });

  return router;
}
