import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { mirrorGrid } from '../src/mandalart-routes.js';
import { withApi } from './helpers.js';

type Query = { sql: string; params: unknown[] };

// Fake pool: answers by matching the SQL and records every query. The real SQL runs in the DB tests.
function fakePool(options: { exists?: boolean; cells?: unknown[] } = {}) {
  const exists = options.exists ?? true;
  const queries: Query[] = [];
  const query = async (sql: string, params: unknown[] = []) => {
    queries.push({ sql, params });
    const row = { id: 7, title: 'Plan', createdAt: 'c', updatedAt: 'u' };
    if (sql.startsWith('INSERT INTO mandalarts')) return { rows: [{ ...row, title: params[0] }] };
    if (sql.startsWith('SELECT id, title')) return { rows: exists ? [row] : [] };
    if (sql.startsWith('SELECT block')) return { rows: options.cells ?? [] };
    if (
      sql.startsWith('SELECT id FROM mandalarts') ||
      sql.startsWith('UPDATE mandalarts SET title')
    )
      return { rows: exists ? [{ id: 7 }] : [] };
    if (sql.startsWith('DELETE FROM mandalarts')) return { rows: exists ? [{ id: 7 }] : [] };
    return { rows: [] };
  };
  const pool = { query, connect: async () => ({ query, release() {} }) } as unknown as Pool;
  return { pool, queries };
}

const emptyGrid = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ''));

test('the centre of each outer block is copied from its sub-goal', () => {
  const grid = emptyGrid();
  grid[4][4] = 'Main';
  grid[4][0] = 'Health';
  grid[4][8] = 'Money';
  grid[0][4] = 'stale';
  grid[8][4] = '';
  grid[0][1] = 'Run';
  const mirrored = mirrorGrid(grid);
  assert.equal(mirrored[0][4], 'Health');
  assert.equal(mirrored[8][4], 'Money');
  assert.equal(mirrored[0][1], 'Run');
  assert.equal(mirrored[4][4], 'Main');
  assert.equal(grid[0][4], 'stale');
});

test('saving cells mirrors the sub-goals and writes all 81 cells in one transaction', async () => {
  const { pool, queries } = fakePool();
  const grid = emptyGrid();
  grid[4][4] = ' Main ';
  grid[4][2] = 'Sub';
  grid[2][4] = 'ignored';
  await withApi(pool, async (call) => {
    const { status } = await call('/api/mandalarts/7/cells', {
      method: 'PUT',
      body: { cells: grid },
    });
    assert.equal(status, 200);
  });
  const insert = queries.find((query) => query.sql.includes('INSERT INTO mandalart_cells'));
  const [, blocks, positions, texts] = insert?.params as [number, number[], number[], string[]];
  const stored = blocks.map((b, i) => `${b}.${positions[i]}=${texts[i]}`).sort();
  assert.equal(stored.length, 81);
  for (const cell of ['2.4=Sub', '4.2=Sub', '4.4=Main']) assert.ok(stored.includes(cell), cell);
  assert.equal(queries[0].sql, 'BEGIN');
  assert.equal(queries.at(-1)?.sql, 'COMMIT');
});

test('invalid requests are English 400s before any query', async () => {
  const { pool, queries } = fakePool();
  const tooLong = emptyGrid();
  tooLong[0][0] = 'a'.repeat(101);
  const shortBlock = emptyGrid();
  shortBlock[3] = shortBlock[3].slice(0, 8);
  await withApi(pool, async (call) => {
    for (const [path, method, body, message] of [
      ['/api/mandalarts', 'POST', undefined, 'Enter a title'],
      ['/api/mandalarts', 'POST', { title: '   ' }, 'Enter a title'],
      ['/api/mandalarts', 'POST', { title: 5 }, 'The title must be text'],
      [
        '/api/mandalarts',
        'POST',
        { title: 'a'.repeat(101) },
        'The title must be 100 characters or fewer',
      ],
      ['/api/mandalarts/7', 'PATCH', { title: '' }, 'Enter a title'],
      ['/api/mandalarts/abc', 'GET', undefined, 'Invalid Mandalart ID'],
      [
        '/api/mandalarts/7/cells',
        'PUT',
        { cells: tooLong },
        'A cell must be 100 characters or fewer',
      ],
      ['/api/mandalarts/7/cells', 'PUT', { cells: shortBlock }, 'Each block must have 9 cells'],
      [
        '/api/mandalarts/7/cells',
        'PUT',
        { cells: emptyGrid().slice(1) },
        'The grid must have 9 blocks',
      ],
      ['/api/mandalarts/7/cells', 'PUT', { cells: [[1]] }, 'A cell must be text'],
    ] as const) {
      const { status, data } = await call(path, { method, body });
      assert.equal(status, 400, `${method} ${path}`);
      assert.equal(data.error, message, `${method} ${path}`);
    }
  });
  assert.equal(queries.length, 0);
});

test('an unknown Mandalart is a 404', async () => {
  const { pool } = fakePool({ exists: false });
  await withApi(pool, async (call) => {
    assert.equal((await call('/api/mandalarts/7')).status, 404);
    assert.equal(
      (await call('/api/mandalarts/7', { method: 'PATCH', body: { title: 'x' } })).status,
      404,
    );
    assert.equal((await call('/api/mandalarts/7', { method: 'DELETE' })).status, 404);
    const put = await call('/api/mandalarts/7/cells', {
      method: 'PUT',
      body: { cells: emptyGrid() },
    });
    assert.equal(put.status, 404);
    assert.equal(put.data.error, 'Mandalart not found');
  });
});

test('a created Mandalart comes back with an empty 9x9 grid', async () => {
  const { pool } = fakePool();
  await withApi(pool, async (call) => {
    const { status, data } = await call('/api/mandalarts', {
      method: 'POST',
      body: { title: ' Plan ' },
    });
    assert.equal(status, 201);
    const mandalart = data.mandalart as { title: string; cells: string[][] };
    assert.equal(mandalart.title, 'Plan');
    assert.equal(mandalart.cells.length, 9);
    assert.ok(
      mandalart.cells.every((cells) => cells.length === 9 && cells.every((text) => text === '')),
    );
  });
});

test('reading a Mandalart returns all 81 cells with the centres mirrored', async () => {
  const { pool } = fakePool({
    cells: [
      { block: 4, position: 4, text: 'Main' },
      { block: 4, position: 6, text: 'Sub' },
      { block: 6, position: 4, text: 'drifted' },
    ],
  });
  await withApi(pool, async (call) => {
    const { data } = await call('/api/mandalarts/7');
    const cells = (data.mandalart as { cells: string[][] }).cells;
    assert.equal(cells.flat().length, 81);
    assert.equal(cells[6][4], 'Sub');
    assert.equal(cells[4][4], 'Main');
  });
});
