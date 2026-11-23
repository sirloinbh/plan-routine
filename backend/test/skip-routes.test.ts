import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { withApi } from './helpers.js';

// Fake pool that answers by matching the SQL and records every query. The real SQL runs in the DB test.
function fakePool({
  routine = true,
  checked = false,
  skipped = false,
  timesPerWeek = null as number | null,
  hasUnit = false,
} = {}) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const query = async (sql: string, params: unknown[] = []) => {
    queries.push({ sql, params });
    if (sql.includes('app_settings')) return { rows: [{ value: '2026-10-18' }] };
    if (sql.includes('FOR UPDATE'))
      return { rows: routine ? [{ cadence: 'weekly', timesPerWeek, hasUnit }] : [] };
    if (sql.includes('FROM routine_checks')) return { rows: checked ? [{}] : [] };
    if (sql.includes('FROM routine_skips')) return { rows: skipped ? [{}] : [] };
    return { rows: [] };
  };
  const pool = {
    query,
    connect: async () => ({ query, release() {} }),
  } as unknown as Pool;
  return { pool, queries };
}

const today = () => '2026-10-22';
const path = '/api/routines/1/skips/2026-10-21';
const writes = (queries: { sql: string; params: unknown[] }[], word: string) =>
  queries.filter((query) => query.sql.includes(word));

test('skipping stores the trimmed reason for the period holding the date', async () => {
  const { pool, queries } = fakePool();
  await withApi(
    pool,
    async (call) => {
      const { status, data } = await call(path, {
        method: 'PUT',
        body: { reason: '  Sick day  ' },
      });
      assert.equal(status, 200);
      assert.deepEqual(data, {
        routineId: 1,
        date: '2026-10-21',
        period: { start: '2026-10-18', end: '2026-10-24' },
        skipped: true,
        reason: 'Sick day',
      });
    },
    { today },
  );
  assert.deepEqual(writes(queries, 'INSERT INTO routine_skips')[0].params, [
    1,
    '2026-10-18',
    'Sick day',
  ]);
});

test('a skip needs no reason, and a blank one means none', async () => {
  for (const body of [undefined, {}, { reason: '' }, { reason: '   ' }, { reason: null }]) {
    const { pool, queries } = fakePool();
    await withApi(
      pool,
      async (call) => {
        const { status, data } = await call(path, { method: 'PUT', body });
        assert.equal(status, 200);
        assert.equal(data.reason, null);
      },
      { today },
    );
    assert.equal(writes(queries, 'INSERT INTO routine_skips')[0].params[2], null);
  }
});

test('a reason over 200 characters is refused, 200 is kept', async () => {
  const { pool, queries } = fakePool();
  await withApi(
    pool,
    async (call) => {
      const tooLong = await call(path, { method: 'PUT', body: { reason: 'a'.repeat(201) } });
      assert.equal(tooLong.status, 400);
      assert.equal(tooLong.data.error, 'Reason must be at most 200 characters');
      const fits = await call(path, { method: 'PUT', body: { reason: 'a'.repeat(200) } });
      assert.equal(fits.status, 200);
      const array = await call(path, { method: 'PUT', raw: '[]' });
      assert.equal(array.status, 400);
    },
    { today },
  );
  assert.equal(writes(queries, 'INSERT INTO routine_skips').length, 1);
});

test('a checked period cannot be skipped, and a skipped period cannot be checked', async () => {
  const checked = fakePool({ checked: true });
  await withApi(
    checked.pool,
    async (call) => {
      const { status, data } = await call(path, { method: 'PUT', body: {} });
      assert.equal(status, 409);
      assert.equal(data.error, 'This period is checked. Uncheck it before skipping it');
    },
    { today },
  );
  assert.equal(writes(checked.queries, 'INSERT INTO routine_skips').length, 0);

  const skipped = fakePool({ skipped: true });
  await withApi(
    skipped.pool,
    async (call) => {
      const { status, data } = await call('/api/routines/1/checks/2026-10-21', { method: 'PUT' });
      assert.equal(status, 409);
      assert.equal(data.error, 'This period is skipped. Remove the skip before checking it');
      // Unchecking a skipped period changes nothing and stays allowed.
      assert.equal(
        (await call('/api/routines/1/checks/2026-10-21', { method: 'DELETE' })).status,
        200,
      );
    },
    { today },
  );
  assert.equal(writes(skipped.queries, 'INSERT INTO routine_checks').length, 0);
});

test('removing a skip deletes the row for the period and repeating it is fine', async () => {
  const { pool, queries } = fakePool();
  await withApi(
    pool,
    async (call) => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const { status, data } = await call(path, { method: 'DELETE' });
        assert.equal(status, 200);
        assert.equal(data.skipped, false);
        assert.equal(data.reason, null);
      }
    },
    { today },
  );
  assert.deepEqual(writes(queries, 'DELETE FROM routine_skips')[0].params, [1, '2026-10-18']);
});

test('skips follow the editable range and need an active routine', async () => {
  const { pool, queries } = fakePool();
  await withApi(
    pool,
    async (call) => {
      for (const method of ['PUT', 'DELETE']) {
        const future = await call('/api/routines/1/skips/2026-10-23', { method });
        assert.equal(future.status, 400);
        assert.equal(future.data.error, 'Future dates cannot be checked');
        const old = await call('/api/routines/1/skips/2026-10-14', { method });
        assert.equal(old.status, 400);
        assert.equal(old.data.error, 'You can only check today and the 7 days before it');
      }
    },
    { today },
  );
  assert.equal(queries.length, 0);

  const missing = fakePool({ routine: false });
  await withApi(
    missing.pool,
    async (call) => {
      for (const method of ['PUT', 'DELETE']) {
        const { status, data } = await call(path, { method });
        assert.equal(status, 404);
        assert.equal(data.error, 'Routine not found');
      }
    },
    { today },
  );
});

test('an N-per-week routine stores one check per day, and a skip covers the week (#245)', async () => {
  const { pool, queries } = fakePool({ timesPerWeek: 3 });
  await withApi(
    pool,
    async (call) => {
      assert.equal(
        (await call('/api/routines/1/checks/2026-10-21', { method: 'PUT' })).status,
        200,
      );
      assert.equal(
        (await call('/api/routines/1/checks/2026-10-21', { method: 'DELETE' })).status,
        200,
      );
      assert.equal((await call(path, { method: 'PUT', body: {} })).status, 200);
    },
    { today },
  );
  // The check and its removal are keyed by the day, not by the week start.
  assert.deepEqual(writes(queries, 'INSERT INTO routine_checks')[0].params, [
    1,
    '2026-10-21',
    null,
    false,
  ]);
  assert.deepEqual(writes(queries, 'DELETE FROM routine_checks')[0].params, [1, '2026-10-21']);
  // Skipping looks for a check anywhere in the week, and stores the skip at the week start.
  assert.deepEqual(writes(queries, 'BETWEEN')[0].params, [1, '2026-10-18', '2026-10-24']);
  assert.deepEqual(writes(queries, 'INSERT INTO routine_skips')[0].params, [1, '2026-10-18', null]);
});

test('a check can carry an amount for a routine with a unit; repeating without one keeps it (#246)', async () => {
  const { pool, queries } = fakePool({ hasUnit: true });
  await withApi(
    pool,
    async (call) => {
      const put = (body?: unknown) =>
        call('/api/routines/1/checks/2026-10-21', { method: 'PUT', body });
      const withAmount = await put({ amount: 20 });
      assert.equal(withAmount.status, 200);
      assert.equal(withAmount.data.amount, 20);
      assert.equal((await put({ amount: null })).status, 200);
      const plain = await put();
      assert.equal(plain.status, 200);
      assert.equal('amount' in plain.data, false);
      for (const amount of [-1, 'ten', 1e12]) {
        const bad = await put({ amount });
        assert.equal(bad.status, 400);
        assert.equal(bad.data.error, 'Amount must be a number from 0 to 999999999');
      }
    },
    { today },
  );
  const inserts = writes(queries, 'INSERT INTO routine_checks').map((query) => query.params);
  assert.deepEqual(inserts, [
    [1, '2026-10-18', 20, true],
    [1, '2026-10-18', null, true],
    [1, '2026-10-18', null, false],
  ]);
});

test('an amount for a routine without a unit is refused and nothing is stored (#246)', async () => {
  const { pool, queries } = fakePool();
  await withApi(
    pool,
    async (call) => {
      const { status, data } = await call('/api/routines/1/checks/2026-10-21', {
        method: 'PUT',
        body: { amount: 5 },
      });
      assert.equal(status, 400);
      assert.equal(data.error, 'This routine has no unit, so it cannot record an amount');
    },
    { today },
  );
  assert.equal(writes(queries, 'INSERT INTO routine_checks').length, 0);
});
