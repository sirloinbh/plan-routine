import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { withApi } from './helpers.js';

const wake = {
  id: '1',
  name: '6시 기상',
  cadence: 'daily',
  category: 'wake',
  sortOrder: 0,
  archived: false,
  checked: true,
};
const old = { ...wake, id: '2', name: '보관한 루틴', archived: true, checked: false };
const entry = {
  date: '2026-10-20',
  body: '잘 보냈다',
  goodNote: null,
  regretNote: null,
  tomorrowNote: null,
};

// Fake pool that answers by matching the SQL and records every query. The real SQL runs in the DB
// tests.
function fakePool({ routines = [] as unknown[], diary = null as unknown } = {}) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (sql.includes('generate_series'))
        return { rows: [{ date: params[0], total: 2, checked: 1, hasDiary: true }] };
      if (sql.includes('FROM diary_entries')) return { rows: diary ? [diary] : [] };
      return { rows: routines };
    },
  } as unknown as Pool;
  return { pool, queries };
}

const today = () => '2026-10-22';

test('the calendar defaults to this month and stops at today', async () => {
  const { pool, queries } = fakePool();
  await withApi(
    pool,
    async (call) => {
      const { status, data } = await call('/api/records');
      assert.equal(status, 200);
      assert.deepEqual(data, {
        today: '2026-10-22',
        month: '2026-10',
        previousMonth: '2026-09',
        nextMonth: null,
        days: [{ date: '2026-10-01', total: 2, checked: 1, hasDiary: true }],
      });
    },
    { today },
  );
  assert.deepEqual(queries[0].params, ['2026-10-01', '2026-10-22']);
});

test('a past month covers every day, across year ends and February', async () => {
  for (const [month, last, previous, next] of [
    ['2026-09', '2026-09-30', '2026-08', '2026-10'],
    ['2024-02', '2024-02-29', '2024-01', '2024-03'],
    ['2025-12', '2025-12-31', '2025-11', '2026-01'],
    ['2025-01', '2025-01-31', '2024-12', '2025-02'],
  ] as const) {
    const { pool, queries } = fakePool();
    await withApi(
      pool,
      async (call) => {
        const { data } = await call(`/api/records?month=${month}`);
        assert.equal(data.previousMonth, previous, month);
        assert.equal(data.nextMonth, next, month);
      },
      { today },
    );
    assert.deepEqual(queries[0].params, [`${month}-01`, last]);
  }
});

test('the earliest month has no previous month', async () => {
  const { pool } = fakePool();
  await withApi(
    pool,
    async (call) => {
      const { data } = await call('/api/records?month=2000-01');
      assert.equal(data.previousMonth, null);
    },
    { today },
  );
});

test('bad, future and too old months are Korean 400s before any query', async () => {
  const { pool, queries } = fakePool();
  await withApi(
    pool,
    async (call) => {
      for (const [month, message] of [
        ['2026-13', '달은 YYYY-MM 형식이어야 합니다'],
        ['2026-1', '달은 YYYY-MM 형식이어야 합니다'],
        ['2026-11', '미래 달의 기록은 볼 수 없습니다'],
        ['1999-12', '2000년 이후의 기록만 볼 수 있습니다'],
      ] as const) {
        const { status, data } = await call(`/api/records?month=${month}`);
        assert.equal(status, 400);
        assert.equal(data.error, message);
      }
    },
    { today },
  );
  assert.equal(queries.length, 0);
});

test('a day shows its routines, including archived ones, with progress and the diary', async () => {
  const { pool, queries } = fakePool({ routines: [wake, old], diary: entry });
  await withApi(
    pool,
    async (call) => {
      const { status, data } = await call('/api/records/2026-10-20');
      assert.equal(status, 200);
      assert.deepEqual(data, {
        date: '2026-10-20',
        today: '2026-10-22',
        progress: { checked: 1, total: 2 },
        routines: [wake, old],
        diary: entry,
      });
    },
    { today },
  );
  assert.deepEqual(queries[0].params, ['2026-10-20']);
});

test('a day with no record answers empty, and old days have no time limit', async () => {
  const { pool } = fakePool();
  await withApi(
    pool,
    async (call) => {
      const { status, data } = await call('/api/records/2020-03-01');
      assert.equal(status, 200);
      assert.deepEqual(data.progress, { checked: 0, total: 0 });
      assert.deepEqual(data.routines, []);
      assert.equal(data.diary, null);
    },
    { today },
  );
});

test('future, too old and impossible days are Korean 400s before any query', async () => {
  const { pool, queries } = fakePool();
  await withApi(
    pool,
    async (call) => {
      for (const [date, message] of [
        ['2026-10-23', '미래 날짜의 기록은 볼 수 없습니다'],
        ['1999-12-31', '2000년 이후의 기록만 볼 수 있습니다'],
        ['2026-02-30', '날짜는 YYYY-MM-DD 형식의 실제 날짜여야 합니다'],
      ] as const) {
        const { status, data } = await call(`/api/records/${date}`);
        assert.equal(status, 400);
        assert.equal(data.error, message);
      }
    },
    { today },
  );
  assert.equal(queries.length, 0);
});

test('records are read-only', async () => {
  const { pool, queries } = fakePool();
  await withApi(
    pool,
    async (call) => {
      for (const method of ['PUT', 'POST', 'DELETE', 'PATCH']) {
        const { status } = await call('/api/records/2026-10-20', { method });
        assert.equal(status, 404, method);
      }
    },
    { today },
  );
  assert.equal(queries.length, 0);
});
