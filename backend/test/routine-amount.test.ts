import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { withApi } from './helpers.js';

// Fake pool inside a transaction: the routine row answers the lock read, the UPDATE echoes the routine.
function fakePool(routine: { unit: string | null } | null) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const query = async (sql: string, params: unknown[] = []) => {
    queries.push({ sql, params });
    if (sql.includes('FOR UPDATE')) return { rows: routine ? [routine] : [] };
    if (sql.includes('UPDATE routines'))
      return { rows: [{ id: 1, unit: params[0], targetAmount: params[1] }] };
    return { rows: [] };
  };
  const pool = { query, connect: async () => ({ query, release() {} }) } as unknown as Pool;
  return { pool, queries };
}
const update = (queries: { sql: string; params: unknown[] }[]) =>
  queries.filter((query) => query.sql.includes('UPDATE routines'));
const put = (body?: unknown) => ({ method: 'PUT', body });

test('a target can be set, changed and cleared on a routine that has a unit', async () => {
  const { pool, queries } = fakePool({ unit: 'pages' });
  await withApi(pool, async (call) => {
    const set = await call('/api/routines/1/amount', put({ unit: 'pages', targetAmount: 20 }));
    assert.equal(set.status, 200);
    assert.deepEqual(set.data.routine, { id: 1, unit: 'pages', targetAmount: 20 });
    const cleared = await call('/api/routines/1/amount', put({ unit: ' pages ' }));
    assert.equal(cleared.status, 200);
    assert.equal((cleared.data.routine as { targetAmount: unknown }).targetAmount, null);
  });
  assert.deepEqual(
    update(queries).map((query) => query.params.slice(0, 3)),
    [
      ['pages', 20, 1],
      ['pages', null, 1],
    ],
  );
});

test('a unit can be added to a routine that has none, with or without a target', async () => {
  const { pool, queries } = fakePool({ unit: null });
  await withApi(pool, async (call) => {
    assert.equal(
      (await call('/api/routines/1/amount', put({ unit: 'minutes', targetAmount: 60 }))).status,
      200,
    );
    assert.equal((await call('/api/routines/1/amount', put({ unit: 'minutes' }))).status, 200);
    // No unit and no target is the state it already has.
    assert.equal((await call('/api/routines/1/amount', put({}))).status, 200);
  });
  assert.equal(update(queries).length, 3);
});

test('a unit that is set can change or go, and a target needs a unit (#276)', async () => {
  const { pool, queries } = fakePool({ unit: 'pages' });
  await withApi(pool, async (call) => {
    assert.equal((await call('/api/routines/1/amount', put({ unit: 'minutes' }))).status, 200);
    // Removing the unit clears the target with it; the amounts on checks stay in the table.
    assert.equal((await call('/api/routines/1/amount', put({}))).status, 200);
    const { status, data } = await call('/api/routines/1/amount', put({ targetAmount: 5 }));
    assert.equal(status, 400);
    assert.equal(data.error, 'Enter a unit for the target');
  });
  assert.deepEqual(
    update(queries).map((query) => query.params.slice(0, 2)),
    [
      ['minutes', null],
      [null, null],
    ],
  );
});

test('bad values are English 400s before any query, and a missing routine is a 404', async () => {
  const { pool, queries } = fakePool({ unit: null });
  await withApi(pool, async (call) => {
    const cases: [unknown, string][] = [
      [{ unit: '   ' }, 'Enter a unit, such as pages or minutes'],
      [{ unit: 'x'.repeat(21) }, 'The unit must be 20 characters or fewer'],
      [{ unit: 'pages', targetAmount: 0 }, 'The target must be a number above 0'],
      [{ unit: 'pages', targetAmount: 'ten' }, 'The target must be a number above 0'],
    ];
    for (const [body, message] of cases) {
      const { status, data } = await call('/api/routines/1/amount', put(body));
      assert.equal(status, 400, message);
      assert.equal(data.error, message);
    }
    assert.equal((await call('/api/routines/abc/amount', put({}))).status, 400);
  });
  assert.equal(queries.length, 0);

  const missing = fakePool(null);
  await withApi(missing.pool, async (call) => {
    const { status, data } = await call('/api/routines/9/amount', put({ unit: 'pages' }));
    assert.equal(status, 404);
    assert.equal(data.error, 'Routine not found');
  });
});
