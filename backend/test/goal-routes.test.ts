import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { withApi } from './helpers.js';

type Row = {
  id: string;
  periodStart: string;
  title: string;
  achieved: boolean | null;
  reviewNote: string | null;
  reviewedAt: string | null;
};

const goal = (id: string, periodStart: string, title: string): Row => ({
  id,
  periodStart,
  title,
  achieved: null,
  reviewNote: null,
  reviewedAt: null,
});

// Fake pool that answers by matching the SQL and records every query. The real SQL runs in the DB
// tests. The fake anchor is Sunday 2026-10-18, so the period runs to 2027-01-09.
function fakePool(rows: Row[] = []) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const query = async (sql: string, params: unknown[] = []) => {
    queries.push({ sql, params });
    if (sql.includes('app_settings')) return { rows: [{ value: '2026-10-18' }] };
    if (sql.includes('INSERT INTO twelve_week_goals'))
      return { rows: [goal('9', '2026-10-18', String(params[1]))] };
    if (sql.includes('FOR UPDATE'))
      return { rows: rows.filter((row) => (params[0] as string[]).includes(row.id)) };
    if (sql.startsWith('UPDATE twelve_week_goals SET title') || sql.startsWith('DELETE')) {
      const id = sql.startsWith('DELETE') ? params[0] : params[1];
      const start = sql.startsWith('DELETE') ? params[1] : params[2];
      return { rows: rows.filter((row) => row.id === id && row.periodStart === start) };
    }
    if (sql.startsWith('SELECT 1')) return { rows: rows.filter((row) => row.id === params[0]) };
    if (sql.includes('period_start <=')) return { rows };
    return { rows: [] };
  };
  const pool = {
    query,
    connect: async () => ({ query, release() {} }),
  } as unknown as Pool;
  return { pool, queries };
}

const today = () => '2026-10-22';
const issued = (queries: { sql: string; params: unknown[] }[], word: string) =>
  queries.filter((query) => query.sql.includes(word));

test('the page data holds the period, weeks left, goals and past periods newest first', async () => {
  const { pool, queries } = fakePool([
    goal('3', '2026-10-18', '이번 목표'),
    goal('2', '2026-07-26', '지난 목표'),
    goal('4', '2026-07-26', '지난 목표 2'),
    goal('1', '2026-05-03', '그 전 목표'),
  ]);
  await withApi(
    pool,
    async (call) => {
      const { status, data } = await call('/api/goals');
      assert.equal(status, 200);
      assert.equal(data.today, '2026-10-22');
      assert.equal(data.remainingWeeks, 12);
      const current = data.current as { period: unknown; goals: Row[] };
      assert.deepEqual(current.period, { start: '2026-10-18', end: '2027-01-09' });
      assert.deepEqual(
        current.goals.map((row) => row.title),
        ['이번 목표'],
      );
      const past = data.past as { period: { start: string; end: string }; goals: Row[] }[];
      assert.deepEqual(
        past.map((entry) => [entry.period, entry.goals.map((row) => row.id)]),
        [
          [{ start: '2026-07-26', end: '2026-10-17' }, ['2', '4']],
          [{ start: '2026-05-03', end: '2026-07-25' }, ['1']],
        ],
      );
    },
    { today },
  );
  assert.deepEqual(issued(queries, 'period_start <=')[0].params, ['2026-10-18']);
});

test('weeks left count the week in progress', async () => {
  for (const [current, weeks] of [
    ['2026-10-18', 12],
    ['2026-10-24', 12],
    ['2026-10-25', 11],
    ['2027-01-03', 1],
    ['2027-01-09', 1],
    ['2027-01-10', 12],
  ] as const) {
    const { pool } = fakePool();
    await withApi(
      pool,
      async (call) => {
        const { data } = await call('/api/goals');
        assert.equal(data.remainingWeeks, weeks, current);
      },
      { today: () => current },
    );
  }
});

test('a new goal goes to the current period in one transaction, with its text trimmed', async () => {
  const { pool, queries } = fakePool();
  await withApi(
    pool,
    async (call) => {
      const { status, data } = await call('/api/goals', {
        method: 'POST',
        body: { title: ' 책 12권 읽기 ' },
      });
      assert.equal(status, 201);
      assert.equal((data.goal as Row).title, '책 12권 읽기');
    },
    { today },
  );
  assert.deepEqual(issued(queries, 'INSERT INTO twelve_week_goals')[0].params, [
    '2026-10-18',
    '책 12권 읽기',
  ]);
  assert.equal(queries[0].sql, 'BEGIN');
  assert.equal(queries.at(-1)?.sql, 'COMMIT');
});

test('invalid goals are Korean 400s before any query', async () => {
  const { pool, queries } = fakePool();
  await withApi(
    pool,
    async (call) => {
      for (const [request, message] of [
        [undefined, '목표를 입력해 주세요'],
        [{ title: '   ' }, '목표를 입력해 주세요'],
        [{ title: 3 }, '목표는 글자여야 합니다'],
        [{ title: '가'.repeat(201) }, '목표는 200자 이하로 입력해 주세요'],
        [{ title: 'a\0b' }, '쓸 수 없는 문자가 들어 있습니다'],
      ] as const) {
        const { status, data } = await call('/api/goals', { method: 'POST', body: request });
        assert.equal(status, 400);
        assert.equal(data.error, message);
      }
      const badId = await call('/api/goals/abc', { method: 'DELETE' });
      assert.equal(badId.status, 400);
      assert.equal(badId.data.error, '목표 번호가 올바르지 않습니다');
    },
    { today },
  );
  assert.equal(queries.length, 0);
});

test('goals of the current period can change; past ones refuse and missing ones are 404s', async () => {
  const { pool } = fakePool([goal('1', '2026-10-18', '이번'), goal('2', '2026-07-26', '지난')]);
  await withApi(
    pool,
    async (call) => {
      const rename = (id: string) =>
        call(`/api/goals/${id}`, { method: 'PATCH', body: { title: '새 이름' } });
      assert.equal((await rename('1')).status, 200);
      const past = await rename('2');
      assert.equal(past.status, 400);
      assert.equal(past.data.error, '지난 기간의 목표는 고칠 수 없습니다');
      const missing = await rename('9');
      assert.equal(missing.status, 404);
      assert.equal(missing.data.error, '목표를 찾을 수 없습니다');

      assert.equal((await call('/api/goals/1', { method: 'DELETE' })).status, 200);
      const pastDelete = await call('/api/goals/2', { method: 'DELETE' });
      assert.equal(pastDelete.status, 400);
      assert.equal(pastDelete.data.error, '지난 기간의 목표는 고칠 수 없습니다');
      assert.equal((await call('/api/goals/9', { method: 'DELETE' })).status, 404);
    },
    { today },
  );
});

const putReviews = (reviews: unknown) => ({ method: 'PUT', body: { reviews } });

test('reviews of past goals save in one transaction, with blank notes as none', async () => {
  const { pool, queries } = fakePool([
    goal('2', '2026-07-26', '지난'),
    goal('4', '2026-07-26', '또'),
  ]);
  await withApi(
    pool,
    async (call) => {
      const { status } = await call(
        '/api/goals/reviews',
        putReviews([
          { id: '2', achieved: true, note: ' 해냈다 ' },
          { id: '4', achieved: null, note: '  ' },
        ]),
      );
      assert.equal(status, 200);
    },
    { today },
  );
  const updates = issued(queries, 'SET achieved');
  assert.deepEqual(updates[0].params, ['2', true, '해냈다']);
  assert.deepEqual(updates[1].params, ['4', null, null]);
  assert.equal(queries.at(-1)?.sql, 'COMMIT');
});

test('reviewing a goal of the running period or a missing goal cancels everything', async () => {
  const { pool, queries } = fakePool([
    goal('1', '2026-10-18', '이번'),
    goal('2', '2026-07-26', '지난'),
  ]);
  await withApi(
    pool,
    async (call) => {
      const running = await call(
        '/api/goals/reviews',
        putReviews([
          { id: '2', achieved: true },
          { id: '1', achieved: true },
        ]),
      );
      assert.equal(running.status, 400);
      assert.equal(running.data.error, '아직 끝나지 않은 기간의 목표는 회고할 수 없습니다');
      const missing = await call(
        '/api/goals/reviews',
        putReviews([
          { id: '2', achieved: true },
          { id: '9', achieved: false },
        ]),
      );
      assert.equal(missing.status, 404);
      assert.equal(missing.data.error, '목표를 찾을 수 없습니다');
    },
    { today },
  );
  assert.equal(issued(queries, 'SET achieved').length, 0);
  assert.equal(issued(queries, 'ROLLBACK').length, 2);
  assert.equal(issued(queries, 'COMMIT').length, 0);
});

test('invalid reviews are Korean 400s before any query', async () => {
  const { pool, queries } = fakePool();
  await withApi(
    pool,
    async (call) => {
      for (const [reviews, message] of [
        [[], '회고할 목표가 없습니다'],
        ['목표', '회고할 목표가 없습니다'],
        [[{ id: 'x', achieved: true }], '목표 번호가 올바르지 않습니다'],
        [[{ id: '2', achieved: '네' }], '달성 여부가 올바르지 않습니다'],
        [[{ id: '2' }], '달성 여부가 올바르지 않습니다'],
        [
          [{ id: '2', achieved: true, note: '가'.repeat(1001) }],
          '메모는 1000자 이하로 입력해 주세요',
        ],
        [[{ id: '2', achieved: true, note: 'a\0b' }], '쓸 수 없는 문자가 들어 있습니다'],
        [
          [
            { id: '2', achieved: true },
            { id: '2', achieved: false },
          ],
          '같은 목표를 두 번 회고할 수 없습니다',
        ],
      ] as const) {
        const { status, data } = await call('/api/goals/reviews', putReviews(reviews));
        assert.equal(status, 400);
        assert.equal(data.error, message);
      }
      const noBody = await call('/api/goals/reviews', { method: 'PUT' });
      assert.equal(noBody.data.error, '회고할 목표가 없습니다');
    },
    { today },
  );
  assert.equal(queries.length, 0);
});
