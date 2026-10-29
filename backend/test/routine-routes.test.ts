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

const wake = { id: '1', name: '6시 기상', cadence: 'daily', category: 'wake', sortOrder: 0 };

test('creating a routine records first use, then appends it to its category', async () => {
  const { pool, queries } = scriptedPool({ rows: [wake] });
  await withApi(
    pool,
    async (call) => {
      const { status, data } = await call('/api/routines', {
        method: 'POST',
        body: { name: ' 6시 기상 ', cadence: 'daily', category: 'wake' },
      });
      assert.equal(status, 201);
      assert.deepEqual(data.routine, wake);
    },
    { today: () => '2026-10-22' },
  );
  // One statement records first use and inserts the routine, so both commit or neither does.
  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0].params, [
    '6시 기상',
    'daily',
    'wake',
    'routine_anchor_date',
    '2026-10-22',
  ]);
});

test('invalid routine input is rejected with Korean messages before any query', async () => {
  const { pool, queries } = scriptedPool();
  await withApi(pool, async (call) => {
    const empty = await call('/api/routines', {
      method: 'POST',
      body: { name: '  ', cadence: 'daily', category: 'wake' },
    });
    assert.equal(empty.status, 400);
    assert.equal(empty.data.error, '루틴 이름을 입력해 주세요');
    const noCategory = await call('/api/routines', {
      method: 'POST',
      body: { name: '운동', cadence: 'daily' },
    });
    assert.equal(noCategory.data.error, '하루 루틴은 카테고리를 선택해 주세요');
    const noBody = await call('/api/routines', { method: 'POST' });
    assert.equal(noBody.status, 400);
    assert.match(String(noBody.data.error), /루틴 이름을 입력해 주세요/);
  });
  assert.equal(queries.length, 0);
});

test('renaming trims the name and a missing routine is a Korean 404', async () => {
  const { pool, queries } = scriptedPool(
    { rows: [{ ...wake, name: '6시 30분 기상' }] },
    { rows: [] },
  );
  await withApi(pool, async (call) => {
    const renamed = await call('/api/routines/1', {
      method: 'PATCH',
      body: { name: ' 6시 30분 기상 ' },
    });
    assert.equal(renamed.status, 200);
    assert.equal((renamed.data.routine as { name: string }).name, '6시 30분 기상');
    const missing = await call('/api/routines/99', { method: 'PATCH', body: { name: '운동' } });
    assert.equal(missing.status, 404);
    assert.equal(missing.data.error, '루틴을 찾을 수 없습니다');
  });
  assert.deepEqual(queries[0].params, ['6시 30분 기상', '1']);
});

test('archiving a missing routine is a Korean 404', async () => {
  const { pool } = scriptedPool({ rows: [] });
  await withApi(pool, async (call) => {
    const { status, data } = await call('/api/routines/5/archive', { method: 'POST' });
    assert.equal(status, 404);
    assert.equal(data.error, '루틴을 찾을 수 없습니다');
  });
});

test('bad ids, directions and cadences are Korean 400s', async () => {
  const { pool, queries } = scriptedPool();
  await withApi(pool, async (call) => {
    const badId = await call('/api/routines/abc', { method: 'PATCH', body: { name: '운동' } });
    assert.equal(badId.status, 400);
    assert.equal(badId.data.error, '루틴 번호가 올바르지 않습니다');
    const badDirection = await call('/api/routines/1/move', {
      method: 'POST',
      body: { direction: 'left' },
    });
    assert.equal(badDirection.status, 400);
    assert.equal(badDirection.data.error, '이동 방향은 위 또는 아래여야 합니다');
    const badCadence = await call('/api/routines?cadence=monthly');
    assert.equal(badCadence.status, 400);
    assert.equal(badCadence.data.error, '루틴 주기는 매일, 매주, 4주, 12주 중 하나여야 합니다');
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
