import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { withApi } from './helpers.js';

// Fake pool that answers by matching the SQL and records every query. The real SQL runs in the DB
// tests. An empty `routine` stands for a routine that is missing or archived.
function fakePool(routine: { cadence: string } | null = { cadence: 'daily' }) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const query = async (sql: string, params: unknown[] = []) => {
    queries.push({ sql, params });
    if (sql.includes('app_settings')) return { rows: [{ value: '2026-10-18' }] };
    if (sql.includes('FOR SHARE')) return { rows: routine ? [routine] : [] };
    if (sql.includes('EXISTS')) return { rows: [wake] };
    return { rows: [] };
  };
  const pool = {
    query,
    connect: async () => ({ query, release() {} }),
  } as unknown as Pool;
  return { pool, queries };
}

const wake = {
  id: '1',
  name: '6시 기상',
  cadence: 'daily',
  category: 'wake',
  sortOrder: 0,
  checked: true,
};
const today = () => '2026-10-22';
const issued = (queries: { sql: string; params: unknown[] }[], word: string) =>
  queries.filter((query) => query.sql.includes(word));

test('the checklist defaults to today and links only to dates in the editable range', async () => {
  const { pool, queries } = fakePool();
  await withApi(
    pool,
    async (call) => {
      const todayList = await call('/api/checklist');
      assert.equal(todayList.status, 200);
      assert.deepEqual(todayList.data, {
        date: '2026-10-22',
        today: '2026-10-22',
        previousDate: '2026-10-21',
        nextDate: null,
        period: { start: '2026-10-22', end: '2026-10-22' },
        items: [wake],
      });
      const oldest = await call('/api/checklist?date=2026-10-15');
      assert.equal(oldest.data.previousDate, null);
      assert.equal(oldest.data.nextDate, '2026-10-16');
    },
    { today },
  );
  assert.deepEqual(issued(queries, 'EXISTS')[0].params, ['daily', '2026-10-22']);
});

test('the checklist finds checks of longer cadences by their period start', async () => {
  const { pool, queries } = fakePool();
  await withApi(
    pool,
    async (call) => {
      const { data } = await call('/api/checklist?cadence=weekly&date=2026-10-22');
      assert.deepEqual(data.period, { start: '2026-10-18', end: '2026-10-24' });
    },
    { today },
  );
  assert.deepEqual(issued(queries, 'EXISTS')[0].params, ['weekly', '2026-10-18']);
});

test('dates outside the editable range are Korean 400s before any query', async () => {
  const { pool, queries } = fakePool();
  await withApi(
    pool,
    async (call) => {
      for (const request of [
        { path: '/api/routines/1/checks/2026-10-23', method: 'PUT' },
        { path: '/api/routines/1/checks/2026-10-23', method: 'DELETE' },
        { path: '/api/checklist?date=2026-10-23', method: 'GET' },
      ]) {
        const future = await call(request.path, { method: request.method });
        assert.equal(future.status, 400);
        assert.equal(future.data.error, '미래 날짜는 체크할 수 없습니다');
      }
      for (const request of [
        { path: '/api/routines/1/checks/2026-10-14', method: 'PUT' },
        { path: '/api/routines/1/checks/2026-10-14', method: 'DELETE' },
        { path: '/api/checklist?date=2026-10-14', method: 'GET' },
      ]) {
        const old = await call(request.path, { method: request.method });
        assert.equal(old.status, 400);
        assert.equal(old.data.error, '최근 7일까지만 체크할 수 있습니다');
      }
    },
    { today },
  );
  assert.equal(queries.length, 0);
});

test('today and the date seven days ago can both be checked', async () => {
  for (const date of ['2026-10-22', '2026-10-15']) {
    const { pool, queries } = fakePool();
    await withApi(
      pool,
      async (call) => {
        const { status, data } = await call(`/api/routines/1/checks/${date}`, { method: 'PUT' });
        assert.equal(status, 200);
        assert.deepEqual(data, {
          routineId: '1',
          date,
          period: { start: date, end: date },
          checked: true,
        });
      },
      { today },
    );
    assert.deepEqual(issued(queries, 'INSERT INTO routine_checks')[0].params, ['1', date]);
    assert.equal(issued(queries, 'COMMIT').length, 1);
  }
});

test('a check records first use and is stored under the start of its period', async () => {
  const { pool, queries } = fakePool({ cadence: 'four_week' });
  await withApi(
    pool,
    async (call) => {
      const { data } = await call('/api/routines/1/checks/2026-10-22', { method: 'PUT' });
      assert.deepEqual(data.period, { start: '2026-10-18', end: '2026-11-14' });
    },
    { today },
  );
  assert.deepEqual(issued(queries, 'app_settings')[0].params, [
    'routine_anchor_date',
    '2026-10-22',
  ]);
  assert.deepEqual(issued(queries, 'INSERT INTO routine_checks')[0].params, ['1', '2026-10-18']);
});

test('unchecking deletes the check of that period', async () => {
  const { pool, queries } = fakePool();
  await withApi(
    pool,
    async (call) => {
      const { status, data } = await call('/api/routines/1/checks/2026-10-22', {
        method: 'DELETE',
      });
      assert.equal(status, 200);
      assert.equal(data.checked, false);
    },
    { today },
  );
  assert.deepEqual(issued(queries, 'DELETE FROM routine_checks')[0].params, ['1', '2026-10-22']);
});

test('a missing or archived routine is a Korean 404 and writes no check', async () => {
  const { pool, queries } = fakePool(null);
  await withApi(
    pool,
    async (call) => {
      const { status, data } = await call('/api/routines/9/checks/2026-10-22', { method: 'PUT' });
      assert.equal(status, 404);
      assert.equal(data.error, '루틴을 찾을 수 없습니다');
    },
    { today },
  );
  assert.equal(issued(queries, 'routine_checks').length, 0);
  assert.equal(issued(queries, 'ROLLBACK').length, 1);
  assert.equal(issued(queries, 'COMMIT').length, 0);
});

test('bad ids, dates and cadences are Korean 400s', async () => {
  const { pool, queries } = fakePool();
  await withApi(
    pool,
    async (call) => {
      const badId = await call('/api/routines/abc/checks/2026-10-22', { method: 'PUT' });
      assert.equal(badId.data.error, '루틴 번호가 올바르지 않습니다');
      const badDate = await call('/api/routines/1/checks/2026-02-30', { method: 'PUT' });
      assert.equal(badDate.data.error, '날짜는 YYYY-MM-DD 형식의 실제 날짜여야 합니다');
      const badCadence = await call('/api/checklist?cadence=monthly');
      assert.equal(badCadence.status, 400);
      assert.equal(badCadence.data.error, '루틴 주기는 매일, 매주, 4주, 12주 중 하나여야 합니다');
    },
    { today },
  );
  assert.equal(queries.length, 0);
});
