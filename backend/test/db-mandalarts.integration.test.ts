import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { url, withClient } from './db-helpers.js';
import { withApi } from './helpers.js';

const migration = new URL('../../database/migrations/015_mandalarts.sql', import.meta.url);

type Mandalart = { id: number; title: string; cells: string[][] };

test(
  'mandalarts migration re-runs safely and enforces its limits',
  { skip: !url, timeout: 30_000 },
  () =>
    withClient(async (client) => {
      await client.query(readFileSync(migration, 'utf8'));
      await client.query(readFileSync(migration, 'utf8'));
      const rejects = async (sql: string) => {
        await client.query('BEGIN');
        try {
          await assert.rejects(client.query(sql), { code: '23514' });
        } finally {
          await client.query('ROLLBACK');
        }
      };
      await rejects("INSERT INTO mandalarts (title) VALUES ('   ')");
      await rejects("INSERT INTO mandalarts (title) VALUES (repeat('a', 101))");
      await client.query('BEGIN');
      try {
        const { rows } = await client.query<{ id: number }>(
          "INSERT INTO mandalarts (title) VALUES ('limits') RETURNING id",
        );
        for (const values of ["9, 0, 'a'", "0, 9, 'a'", "0, 0, repeat('a', 101)"]) {
          await client.query('SAVEPOINT s');
          await assert.rejects(
            client.query(
              `INSERT INTO mandalart_cells (mandalart_id, block, position, text) VALUES (${rows[0].id}, ${values})`,
            ),
            { code: '23514' },
          );
          await client.query('ROLLBACK TO SAVEPOINT s');
        }
      } finally {
        await client.query('ROLLBACK');
      }
    }),
);

test(
  'a Mandalart saves and reads back as the same 81-cell grid, mirrors sub-goals and deletes its cells',
  { skip: !url, timeout: 30_000 },
  () =>
    withClient(async (client, pool) => {
      await withApi(pool, async (call) => {
        const created = await call('/api/mandalarts', {
          method: 'POST',
          body: { title: 'DB test' },
        });
        assert.equal(created.status, 201);
        const { id } = created.data.mandalart as Mandalart;
        try {
          const grid = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ''));
          grid[4][4] = 'Main goal';
          grid[4][1] = 'Health';
          grid[4][7] = 'Work';
          grid[1][0] = 'Walk';
          grid[7][8] = 'Ship';
          const saved = await call(`/api/mandalarts/${id}/cells`, {
            method: 'PUT',
            body: { cells: grid },
          });
          assert.equal(saved.status, 200);
          const read = (await call(`/api/mandalarts/${id}`)).data.mandalart as Mandalart;
          assert.equal(read.cells.flat().length, 81);
          assert.equal(read.cells[4][4], 'Main goal');
          assert.equal(read.cells[1][4], 'Health');
          assert.equal(read.cells[7][4], 'Work');
          assert.equal(read.cells[1][0], 'Walk');
          assert.equal(read.cells[7][8], 'Ship');
          // All 81 cells are stored.
          const stored = await client.query(
            'SELECT count(*)::int AS n FROM mandalart_cells WHERE mandalart_id = $1',
            [id],
          );
          assert.equal(stored.rows[0].n, 81);

          // Changing a sub-goal changes the centre of its block; a client-sent centre is ignored.
          grid[4][1] = 'Fitness';
          grid[7][4] = 'forged';
          await call(`/api/mandalarts/${id}/cells`, { method: 'PUT', body: { cells: grid } });
          const changed = (await call(`/api/mandalarts/${id}`)).data.mandalart as Mandalart;
          assert.equal(changed.cells[1][4], 'Fitness');
          assert.equal(changed.cells[7][4], 'Work');

          const renamed = await call(`/api/mandalarts/${id}`, {
            method: 'PATCH',
            body: { title: 'Renamed' },
          });
          assert.equal((renamed.data.mandalart as Mandalart).title, 'Renamed');
          const list = (await call('/api/mandalarts')).data.mandalarts as {
            id: number;
            filledCount: number;
          }[];
          assert.equal(list.find((item) => item.id === id)?.filledCount, 7);
        } finally {
          const removed = await call(`/api/mandalarts/${id}`, { method: 'DELETE' });
          assert.equal(removed.status, 200);
        }
        const left = await client.query('SELECT 1 FROM mandalart_cells WHERE mandalart_id = $1', [
          id,
        ]);
        assert.equal(left.rowCount, 0);
        assert.equal((await call(`/api/mandalarts/${id}`)).status, 404);
      });
    }),
);
