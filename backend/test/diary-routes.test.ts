import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { withApi } from './helpers.js';

const saved = {
  date: '2026-10-22',
  body: '오늘은 잘 보냈다',
  goodNote: null,
  regretNote: null,
  tomorrowNote: null,
};

// Fake pool that answers by matching the SQL and records every query. The real SQL runs in the DB
// tests. `entry` stands for the row stored for the requested date.
function fakePool(entry: unknown = null) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (sql.includes('count(')) return { rows: [{ checked: 2, total: 5 }] };
      if (sql.includes('INSERT')) return { rows: [saved] };
      return { rows: entry ? [entry] : [] };
    },
  } as unknown as Pool;
  return { pool, queries };
}

const today = () => '2026-10-22';
const put = (body?: unknown) => ({ method: 'PUT', body });

test('the diary defaults to today with its entry, progress and neighbouring dates', async () => {
  const { pool } = fakePool(saved);
  await withApi(
    pool,
    async (call) => {
      const { status, data } = await call('/api/diary');
      assert.equal(status, 200);
      assert.deepEqual(data, {
        date: '2026-10-22',
        today: '2026-10-22',
        previousDate: '2026-10-21',
        nextDate: null,
        progress: { checked: 2, total: 5 },
        entry: saved,
      });
    },
    { today },
  );
});

test('a day with no entry answers null, and old days can be opened without a limit', async () => {
  const { pool, queries } = fakePool();
  await withApi(
    pool,
    async (call) => {
      const { status, data } = await call('/api/diary?date=2020-03-01');
      assert.equal(status, 200);
      assert.equal(data.entry, null);
      assert.equal(data.previousDate, '2020-02-29');
      assert.equal(data.nextDate, '2020-03-02');
    },
    { today },
  );
  assert.deepEqual(queries[0].params, ['2020-03-01']);
});

test('saving trims the text, treats blank notes as none and upserts by date', async () => {
  const { pool, queries } = fakePool();
  await withApi(
    pool,
    async (call) => {
      const { status, data } = await call(
        '/api/diary/2026-10-22',
        put({ body: ' 오늘은 잘 보냈다 ', goodNote: ' 일찍 일어남 ', regretNote: '   ' }),
      );
      assert.equal(status, 200);
      assert.deepEqual(data.entry, saved);
    },
    { today },
  );
  assert.match(queries[0].sql, /ON CONFLICT \(entry_date\) DO UPDATE/);
  assert.deepEqual(queries[0].params, [
    '2026-10-22',
    '오늘은 잘 보냈다',
    '일찍 일어남',
    null,
    null,
  ]);
});

test('an empty or too long entry is a Korean 400 before any query', async () => {
  const { pool, queries } = fakePool();
  await withApi(
    pool,
    async (call) => {
      for (const [body, message] of [
        [undefined, '일기 본문을 입력해 주세요'],
        [{ body: '   ' }, '일기 본문을 입력해 주세요'],
        [{ body: 3 }, '일기 본문은 글자여야 합니다'],
        [{ body: '가'.repeat(5001) }, '일기 본문은 5000자 이하로 입력해 주세요'],
        [{ body: '본문', goodNote: '가'.repeat(1001) }, '잘한 점은 1000자 이하로 입력해 주세요'],
        [{ body: '본문', regretNote: 1 }, '아쉬운 점은 글자여야 합니다'],
        [
          { body: '본문', tomorrowNote: '가'.repeat(1001) },
          '내일 할 일은 1000자 이하로 입력해 주세요',
        ],
      ] as const) {
        const { status, data } = await call('/api/diary/2026-10-22', put(body));
        assert.equal(status, 400);
        assert.equal(data.error, message);
      }
    },
    { today },
  );
  assert.equal(queries.length, 0);
});

test('the longest allowed entry and today are accepted', async () => {
  const { pool, queries } = fakePool();
  await withApi(
    pool,
    async (call) => {
      const { status } = await call(
        '/api/diary/2026-10-22',
        put({ body: '가'.repeat(5000), goodNote: '나'.repeat(1000) }),
      );
      assert.equal(status, 200);
    },
    { today },
  );
  assert.equal(queries.length, 1);
});

test('future, too old and impossible dates are Korean 400s before any query', async () => {
  const { pool, queries } = fakePool();
  await withApi(
    pool,
    async (call) => {
      for (const request of [
        call('/api/diary/2026-10-23', put({ body: '본문' })),
        call('/api/diary?date=2026-10-23'),
      ]) {
        const { status, data } = await request;
        assert.equal(status, 400);
        assert.equal(data.error, '미래 날짜의 일기는 쓸 수 없습니다');
      }
      for (const request of [
        call('/api/diary/0000-01-01', put({ body: '본문' })),
        call('/api/diary?date=1999-12-31'),
      ]) {
        const { status, data } = await request;
        assert.equal(status, 400);
        assert.equal(data.error, '2000년 이후 날짜의 일기만 쓸 수 있습니다');
      }
      const impossible = await call('/api/diary/2026-02-30', put({ body: '본문' }));
      assert.equal(impossible.status, 400);
      assert.equal(impossible.data.error, '날짜는 YYYY-MM-DD 형식의 실제 날짜여야 합니다');
    },
    { today },
  );
  assert.equal(queries.length, 0);
});

test('the earliest date has no previous date', async () => {
  const { pool } = fakePool();
  await withApi(
    pool,
    async (call) => {
      const { data } = await call('/api/diary?date=2000-01-01');
      assert.equal(data.previousDate, null);
      assert.equal(data.nextDate, '2000-01-02');
    },
    { today },
  );
});
