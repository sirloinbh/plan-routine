import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { withApi } from './helpers.js';

const saved = {
  date: '2026-10-22',
  body: 'Had a good day',
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
        put({ body: ' Had a good day ', goodNote: ' Woke up early ', regretNote: '   ' }),
      );
      assert.equal(status, 200);
      assert.deepEqual(data.entry, saved);
    },
    { today },
  );
  assert.match(queries[0].sql, /ON CONFLICT \(entry_date\) DO UPDATE/);
  assert.deepEqual(queries[0].params, [
    '2026-10-22',
    'Had a good day',
    'Woke up early',
    null,
    null,
  ]);
});

test('an empty or too long entry is an English 400 before any query', async () => {
  const { pool, queries } = fakePool();
  await withApi(
    pool,
    async (call) => {
      for (const [body, message] of [
        [undefined, 'Enter the diary entry'],
        [{ body: '   ' }, 'Enter the diary entry'],
        [{ body: 3 }, 'The diary entry must be text'],
        [{ body: 'a'.repeat(5001) }, 'The diary entry must be 5000 characters or fewer'],
        [
          { body: 'Body', goodNote: 'a'.repeat(1001) },
          'Good points must be 1000 characters or fewer',
        ],
        [{ body: 'Body', regretNote: 1 }, 'Regrets must be text'],
        [{ body: 'a\0b' }, 'Contains characters that are not allowed'],
        [{ body: 'Body', goodNote: 'a\0b' }, 'Contains characters that are not allowed'],
        [
          { body: 'Body', tomorrowNote: 'a'.repeat(1001) },
          "Tomorrow's tasks must be 1000 characters or fewer",
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
        put({ body: 'a'.repeat(5000), goodNote: 'b'.repeat(1000) }),
      );
      assert.equal(status, 200);
    },
    { today },
  );
  assert.equal(queries.length, 1);
});

test('future, too old and impossible dates are English 400s before any query', async () => {
  const { pool, queries } = fakePool();
  await withApi(
    pool,
    async (call) => {
      for (const request of [
        call('/api/diary/2026-10-23', put({ body: 'Body' })),
        call('/api/diary?date=2026-10-23'),
      ]) {
        const { status, data } = await request;
        assert.equal(status, 400);
        assert.equal(data.error, 'A diary entry cannot be written for a future date');
      }
      for (const request of [
        call('/api/diary/0000-01-01', put({ body: 'Body' })),
        call('/api/diary?date=1999-12-31'),
      ]) {
        const { status, data } = await request;
        assert.equal(status, 400);
        assert.equal(data.error, 'Diary entries can only be written for dates after the year 2000');
      }
      const impossible = await call('/api/diary/2026-02-30', put({ body: 'Body' }));
      assert.equal(impossible.status, 400);
      assert.equal(impossible.data.error, 'Date must be a real date in YYYY-MM-DD format');
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

test('notes left out or blank are saved as no note', async () => {
  const { pool, queries } = fakePool();
  await withApi(
    pool,
    async (call) => {
      const { status } = await call(
        '/api/diary/2026-10-22',
        put({ body: ' Body ', regretNote: '   ', tomorrowNote: null }),
      );
      assert.equal(status, 200);
    },
    { today },
  );
  assert.deepEqual(queries[0].params, ['2026-10-22', 'Body', null, null, null]);
});

test('diary text that is not text answers with one message, even if it has a length', async () => {
  const { pool, queries } = fakePool();
  await withApi(
    pool,
    async (call) => {
      const empty = await call('/api/diary/2026-10-22', put({ body: [] }));
      assert.equal(empty.status, 400);
      assert.equal(empty.data.error, 'The diary entry must be text');
      const note = await call(
        '/api/diary/2026-10-22',
        put({ body: 'Body', goodNote: Array.from({ length: 1001 }, () => 'a') }),
      );
      assert.equal(note.status, 400);
      assert.equal(note.data.error, 'Good points must be text');
    },
    { today },
  );
  assert.equal(queries.length, 0);
});
