import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { withApi } from './helpers.js';

type Routine = { cadence: string; weekdays: number[] | null; timesPerWeek: number | null } | null;

// Fake pool inside a transaction: the routine row answers the lock read; every query is recorded.
function fakePool(routine: Routine) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const query = async (sql: string, params: unknown[] = []) => {
    queries.push({ sql, params });
    if (sql.includes('FOR UPDATE')) return { rows: routine ? [routine] : [] };
    if (sql.includes('UPDATE routines')) return { rows: [{ id: 1 }] };
    return { rows: [] };
  };
  const pool = { query, connect: async () => ({ query, release() {} }) } as unknown as Pool;
  return { pool, queries };
}
const put = (body?: unknown) => ({ method: 'PUT', body });
const find = (queries: { sql: string; params: unknown[] }[], word: string) =>
  queries.filter((query) => query.sql.includes(word));

test('weekdays are set sorted, every day means none, and the audit entry is written', async () => {
  const { pool, queries } = fakePool({ cadence: 'daily', weekdays: null, timesPerWeek: null });
  await withApi(pool, async (call) => {
    assert.equal(
      (await call('/api/routines/1/schedule', put({ weekdays: [5, 1, 3, 1] }))).status,
      200,
    );
    assert.equal(
      (await call('/api/routines/1/schedule', put({ weekdays: [0, 1, 2, 3, 4, 5, 6] }))).status,
      200,
    );
    assert.equal((await call('/api/routines/1/schedule', put({}))).status, 200);
  });
  assert.deepEqual(
    find(queries, 'UPDATE routines').map((query) => query.params.slice(0, 2)),
    [
      [[1, 3, 5], null],
      [null, null],
      [null, null],
    ],
  );
  assert.equal(find(queries, 'INSERT INTO audit_log').length, 3);
  // A daily routine never touches its checks.
  assert.equal(find(queries, 'routine_checks').length, 0);
});

test('a schedule that does not fit the routine is refused before anything changes', async () => {
  const daily = fakePool({ cadence: 'daily', weekdays: null, timesPerWeek: null });
  await withApi(daily.pool, async (call) => {
    const times = await call('/api/routines/1/schedule', put({ timesPerWeek: 3 }));
    assert.equal(times.status, 400);
    assert.equal(times.data.error, 'Only weekly routines can have times per week');
    const none = await call('/api/routines/1/schedule', put({ weekdays: [] }));
    assert.equal(none.data.error, 'Choose at least one weekday');
    assert.equal((await call('/api/routines/1/schedule', put({ weekdays: [7] }))).status, 400);
  });
  assert.equal(find(daily.queries, 'UPDATE routines').length, 0);

  const weekly = fakePool({ cadence: 'weekly', weekdays: null, timesPerWeek: null });
  await withApi(weekly.pool, async (call) => {
    const days = await call('/api/routines/1/schedule', put({ weekdays: [1] }));
    assert.equal(days.data.error, 'Only daily routines can have weekdays');
    for (const timesPerWeek of [1, 8, 2.5, 'x'])
      assert.equal((await call('/api/routines/1/schedule', put({ timesPerWeek }))).status, 400);
    assert.equal((await call('/api/routines/abc/schedule', put({}))).status, 400);
  });
  assert.equal(find(weekly.queries, 'UPDATE routines').length, 0);

  const missing = fakePool(null);
  await withApi(missing.pool, async (call) => {
    assert.equal((await call('/api/routines/9/schedule', put({}))).status, 404);
  });
});

test('once a week to N times moves nothing; N times to once a week collapses the checks', async () => {
  const up = fakePool({ cadence: 'weekly', weekdays: null, timesPerWeek: null });
  await withApi(up.pool, async (call) => {
    assert.equal((await call('/api/routines/1/schedule', put({ timesPerWeek: 3 }))).status, 200);
  });
  assert.equal(find(up.queries, 'routine_checks').length, 0);
  assert.deepEqual(find(up.queries, 'UPDATE routines')[0].params, [null, 3, 1]);

  const down = fakePool({ cadence: 'weekly', weekdays: null, timesPerWeek: 3 });
  await withApi(down.pool, async (call) => {
    assert.equal((await call('/api/routines/1/schedule', put({}))).status, 200);
  });
  assert.equal(find(down.queries, 'DELETE FROM routine_checks').length, 1);
  // The same N, or another N, converts nothing.
  const same = fakePool({ cadence: 'weekly', weekdays: null, timesPerWeek: 3 });
  await withApi(same.pool, async (call) => {
    assert.equal((await call('/api/routines/1/schedule', put({ timesPerWeek: 5 }))).status, 200);
  });
  assert.equal(find(same.queries, 'routine_checks').length, 0);
});
