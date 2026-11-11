import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { withApi } from './helpers.js';

// Fake pool that answers queries in order and records them. The real SQL runs in the DB tests.
function scriptedPool(...results: { rows: unknown[] }[]) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      return results.shift() ?? { rows: [] };
    },
  } as unknown as Pool;
  return { pool, queries };
}

const wake = { id: '1', name: 'Wake at 6', cadence: 'daily', category: 'wake', sortOrder: 0 };

test('creating a routine records first use, then appends it to its category', async () => {
  const { pool, queries } = scriptedPool({ rows: [wake] });
  await withApi(
    pool,
    async (call) => {
      const { status, data } = await call('/api/routines', {
        method: 'POST',
        body: { name: ' Wake at 6 ', cadence: 'daily', category: 'wake' },
      });
      assert.equal(status, 201);
      assert.deepEqual(data.routine, wake);
    },
    { today: () => '2026-10-22' },
  );
  // One statement records first use and inserts the routine, so both commit or neither does.
  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0].params, [
    'Wake at 6',
    'daily',
    'wake',
    'routine_anchor_date',
    '2026-10-22',
  ]);
});

test('invalid routine input is rejected with English messages before any query', async () => {
  const { pool, queries } = scriptedPool();
  await withApi(pool, async (call) => {
    const empty = await call('/api/routines', {
      method: 'POST',
      body: { name: '  ', cadence: 'daily', category: 'wake' },
    });
    assert.equal(empty.status, 400);
    assert.equal(empty.data.error, 'Enter a routine name');
    const noCategory = await call('/api/routines', {
      method: 'POST',
      body: { name: 'Exercise', cadence: 'daily' },
    });
    assert.equal(noCategory.data.error, 'Choose a category for a daily routine');
    const noBody = await call('/api/routines', { method: 'POST' });
    assert.equal(noBody.status, 400);
    assert.match(String(noBody.data.error), /Enter a routine name/);
  });
  assert.equal(queries.length, 0);
});

test('renaming trims the name and a missing routine is an English 404', async () => {
  const { pool, queries } = scriptedPool(
    { rows: [{ ...wake, name: 'Wake at 6:30' }] },
    { rows: [] },
  );
  await withApi(pool, async (call) => {
    const renamed = await call('/api/routines/1', {
      method: 'PATCH',
      body: { name: ' Wake at 6:30 ' },
    });
    assert.equal(renamed.status, 200);
    assert.equal((renamed.data.routine as { name: string }).name, 'Wake at 6:30');
    const missing = await call('/api/routines/99', { method: 'PATCH', body: { name: 'Exercise' } });
    assert.equal(missing.status, 404);
    assert.equal(missing.data.error, 'Routine not found');
  });
  assert.deepEqual(queries[0].params, ['Wake at 6:30', '1']);
});

test('archiving a missing routine is an English 404', async () => {
  const { pool } = scriptedPool({ rows: [] });
  await withApi(pool, async (call) => {
    const { status, data } = await call('/api/routines/5/archive', { method: 'POST' });
    assert.equal(status, 404);
    assert.equal(data.error, 'Routine not found');
  });
});

test('bad ids, directions and cadences are English 400s', async () => {
  const { pool, queries } = scriptedPool();
  await withApi(pool, async (call) => {
    const badId = await call('/api/routines/abc', { method: 'PATCH', body: { name: 'Exercise' } });
    assert.equal(badId.status, 400);
    assert.equal(badId.data.error, 'Invalid routine ID');
    const badDirection = await call('/api/routines/1/move', {
      method: 'POST',
      body: { direction: 'left' },
    });
    assert.equal(badDirection.status, 400);
    assert.equal(badDirection.data.error, 'Direction must be up or down');
    const badCadence = await call('/api/routines?cadence=monthly');
    assert.equal(badCadence.status, 400);
    assert.equal(
      badCadence.data.error,
      'Routine cadence must be daily, weekly, four-week, or twelve-week',
    );
  });
  assert.equal(queries.length, 0);
});

test('the list can be filtered by cadence', async () => {
  const { pool, queries } = scriptedPool({ rows: [wake] });
  await withApi(pool, async (call) => {
    const { status, data } = await call('/api/routines?cadence=daily');
    assert.equal(status, 200);
    assert.deepEqual(data.routines, [wake]);
  });
  assert.deepEqual(queries[0].params, ['daily']);
});
