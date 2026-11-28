import { Router } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod/v4';

import { pathId } from './ids.js';
import { badRequest, noNul, nulMessage, requestBody } from './request-input.js';
import { HttpError } from './standard/http.js';
import { inTransaction } from './transaction.js';

const notFoundMessage = 'Mandalart not found';
const idParam = z.object({ id: pathId('Invalid Mandalart ID') });

export const mandalartTitleInput = z.object(
  {
    title: z
      .string({
        error: (issue) => (issue.input === undefined ? 'Enter a title' : 'The title must be text'),
      })
      .trim()
      .refine((value) => value.length >= 1, 'Enter a title')
      .refine((value) => value.length <= 100, 'The title must be 100 characters or fewer')
      .refine(noNul, nulMessage),
  },
  badRequest,
);

const cellText = z
  .string({ error: 'A cell must be text' })
  .trim()
  .refine((value) => value.length <= 100, 'A cell must be 100 characters or fewer')
  .refine(noNul, nulMessage);
// 9 blocks of 9 cells: cells[block][position]. Keep .max() first (zod refuses an oversized array before reading it).
const block = z
  .array(cellText, { error: 'Each block must have 9 cells' })
  .max(9, 'Each block must have 9 cells')
  .refine((cells) => cells.length === 9, 'Each block must have 9 cells');
export const mandalartCellsInput = z.object(
  {
    cells: z
      .array(block, { error: 'The grid must have 9 blocks' })
      .max(9, 'The grid must have 9 blocks')
      .refine((blocks) => blocks.length === 9, 'The grid must have 9 blocks'),
  },
  badRequest,
);

const centre = 4;

/** The grid as 9 blocks of 9 cells, with the centre of each outer block equal to its sub-goal (block 4, same position). */
export function mirrorGrid(cells: string[][]): string[][] {
  return cells.map((cellsOfBlock, b) =>
    b === centre
      ? [...cellsOfBlock]
      : cellsOfBlock.map((text, p) => (p === centre ? cells[centre][b] : text)),
  );
}

type Row = { block: number; position: number; text: string };
const emptyGrid = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ''));
const gridOf = (rows: Row[]) => {
  const grid = emptyGrid();
  for (const row of rows) grid[row.block][row.position] = row.text;
  return mirrorGrid(grid);
};

const columns = `id, title, created_at AS "createdAt", updated_at AS "updatedAt"`;
type MandalartRow = { id: number; title: string; createdAt: string; updatedAt: string };

export function mandalartRoutes(pool: Pool) {
  const router = Router();

  const load = async (db: Pool | PoolClient, id: number) => {
    const found = await db.query<MandalartRow>(`SELECT ${columns} FROM mandalarts WHERE id = $1`, [
      id,
    ]);
    if (!found.rows[0]) throw new HttpError(404, notFoundMessage);
    const cells = await db.query<Row>(
      'SELECT block, position, text FROM mandalart_cells WHERE mandalart_id = $1',
      [id],
    );
    return { ...found.rows[0], cells: gridOf(cells.rows) };
  };

  router.get('/', async (_req, res) => {
    // Counts the filled cells the grid shows: stored outer centres are ignored and mirrored from block 4 instead.
    const { rows } = await pool.query<MandalartRow & { filledCount: number }>(
      `SELECT m.id, m.title, m.created_at AS "createdAt", m.updated_at AS "updatedAt",
         (SELECT count(*)::int FROM mandalart_cells c WHERE c.mandalart_id = m.id
            AND c.text <> '' AND (c.position <> 4 OR c.block = 4)) +
         (SELECT count(*)::int FROM mandalart_cells c WHERE c.mandalart_id = m.id
            AND c.text <> '' AND c.block = 4 AND c.position <> 4) AS "filledCount"
       FROM mandalarts m ORDER BY m.updated_at DESC, m.id DESC`,
    );
    res.json({ mandalarts: rows });
  });

  router.get('/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json({ mandalart: await load(pool, id) });
  });

  // All 81 cells are created with the Mandalart (decision on #345), so a PUT only changes their text.
  router.post('/', async (req, res) => {
    const { title } = mandalartTitleInput.parse(requestBody(req.body));
    const reply = await inTransaction(pool, async (client) => {
      const { rows } = await client.query<MandalartRow>(
        `INSERT INTO mandalarts (title) VALUES ($1) RETURNING ${columns}`,
        [title],
      );
      await client.query(
        `INSERT INTO mandalart_cells (mandalart_id, block, position)
         SELECT $1, b, p FROM generate_series(0, 8) AS b, generate_series(0, 8) AS p`,
        [rows[0].id],
      );
      return { status: 201, body: { mandalart: { ...rows[0], cells: emptyGrid() } } };
    });
    res.status(reply.status).json(reply.body);
  });

  router.patch('/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { title } = mandalartTitleInput.parse(requestBody(req.body));
    const { rows } = await pool.query(
      'UPDATE mandalarts SET title = $1, updated_at = now() WHERE id = $2 RETURNING id',
      [title, id],
    );
    if (!rows[0]) throw new HttpError(404, notFoundMessage);
    res.json({ mandalart: await load(pool, id) });
  });

  // Replaces the text of all 81 cells in one transaction. The centres of the outer blocks are not read from the
  // request: the server copies them from the sub-goals, so the grid cannot drift.
  router.put('/:id/cells', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { cells } = mandalartCellsInput.parse(requestBody(req.body));
    const grid = mirrorGrid(cells);
    const reply = await inTransaction(pool, async (client) => {
      const target = await client.query('SELECT id FROM mandalarts WHERE id = $1 FOR UPDATE', [id]);
      if (!target.rows[0]) throw new HttpError(404, notFoundMessage);
      const blocks: number[] = [];
      const positions: number[] = [];
      const texts: string[] = [];
      grid.forEach((cellsOfBlock, b) =>
        cellsOfBlock.forEach((text, p) => {
          blocks.push(b);
          positions.push(p);
          texts.push(text);
        }),
      );
      // Upsert, so a Mandalart whose rows are missing is repaired too.
      await client.query(
        `INSERT INTO mandalart_cells (mandalart_id, block, position, text)
         SELECT $1, b, p, t FROM unnest($2::smallint[], $3::smallint[], $4::text[]) AS cell(b, p, t)
         ON CONFLICT (mandalart_id, block, position) DO UPDATE SET text = EXCLUDED.text`,
        [id, blocks, positions, texts],
      );
      await client.query('UPDATE mandalarts SET updated_at = now() WHERE id = $1', [id]);
      return { status: 200, body: { mandalart: await load(client, id) } };
    });
    res.status(reply.status).json(reply.body);
  });

  router.delete('/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { rows } = await pool.query('DELETE FROM mandalarts WHERE id = $1 RETURNING id', [id]);
    if (!rows[0]) throw new HttpError(404, notFoundMessage);
    res.json({ id });
  });

  return router;
}
