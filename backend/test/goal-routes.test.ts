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
    goal('3', '2026-10-18', 'Current goal'),
    goal('2', '2026-07-26', 'Past goal'),
    goal('4', '2026-07-26', 'Past goal 2'),
    goal('1', '2026-05-03', 'Earlier goal'),
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
        ['Current goal'],
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
        body: { title: ' Read 12 books ' },
      });
      assert.equal(status, 201);
      assert.equal((data.goal as Row).title, 'Read 12 books');
    },
    { today },
  );
  assert.deepEqual(issued(queries, 'INSERT INTO twelve_week_goals')[0].params, [
    '2026-10-18',
    'Read 12 books',
  ]);
  assert.equal(queries[0].sql, 'BEGIN');
  assert.equal(queries.at(-1)?.sql, 'COMMIT');
});

test('invalid goals are English 400s before any query', async () => {
  const { pool, queries } = fakePool();
  await withApi(
    pool,
    async (call) => {
      for (const [request, message] of [
        [undefined, 'Enter a goal'],
        [{ title: '   ' }, 'Enter a goal'],
        [{ title: 3 }, 'The goal must be text'],
        [{ title: 'a'.repeat(201) }, 'The goal must be 200 characters or fewer'],
        [{ title: 'a\0b' }, 'Contains characters that are not allowed'],
      ] as const) {
        const { status, data } = await call('/api/goals', { method: 'POST', body: request });
        assert.equal(status, 400);
        assert.equal(data.error, message);
      }
      const badId = await call('/api/goals/abc', { method: 'DELETE' });
      assert.equal(badId.status, 400);
      assert.equal(badId.data.error, 'Invalid goal ID');
    },
    { today },
  );
  assert.equal(queries.length, 0);
});

test('goals of the current period can change; past ones refuse and missing ones are 404s', async () => {
  const { pool } = fakePool([goal('1', '2026-10-18', 'Current'), goal('2', '2026-07-26', 'Past')]);
  await withApi(
    pool,
    async (call) => {
      const rename = (id: string) =>
        call(`/api/goals/${id}`, { method: 'PATCH', body: { title: 'New name' } });
      assert.equal((await rename('1')).status, 200);
      const past = await rename('2');
      assert.equal(past.status, 400);
      assert.equal(past.data.error, 'Goals of past periods cannot be edited');
      const missing = await rename('9');
      assert.equal(missing.status, 404);
      assert.equal(missing.data.error, 'Goal not found');

      assert.equal((await call('/api/goals/1', { method: 'DELETE' })).status, 200);
      const pastDelete = await call('/api/goals/2', { method: 'DELETE' });
      assert.equal(pastDelete.status, 400);
      assert.equal(pastDelete.data.error, 'Goals of past periods cannot be edited');
      assert.equal((await call('/api/goals/9', { method: 'DELETE' })).status, 404);
    },
    { today },
  );
});

const putReviews = (reviews: unknown) => ({ method: 'PUT', body: { reviews } });

test('reviews of past goals save in one transaction, with blank notes as none', async () => {
  const { pool, queries } = fakePool([
    goal('2', '2026-07-26', 'Past'),
    goal('4', '2026-07-26', 'Another'),
  ]);
  await withApi(
    pool,
    async (call) => {
      const { status } = await call(
        '/api/goals/reviews',
        putReviews([
          { id: '2', achieved: true, note: ' Done it ' },
          { id: '4', achieved: null, note: '  ' },
        ]),
      );
      assert.equal(status, 200);
    },
    { today },
  );
  const updates = issued(queries, 'SET achieved');
  assert.deepEqual(updates[0].params, ['2', true, 'Done it']);
  assert.deepEqual(updates[1].params, ['4', null, null]);
  assert.equal(queries.at(-1)?.sql, 'COMMIT');
});

test('reviewing a goal of the running period or a missing goal cancels everything', async () => {
  const { pool, queries } = fakePool([
    goal('1', '2026-10-18', 'Current'),
    goal('2', '2026-07-26', 'Past'),
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
      assert.equal(running.data.error, 'Goals of a period that has not ended cannot be reviewed');
      const missing = await call(
        '/api/goals/reviews',
        putReviews([
          { id: '2', achieved: true },
          { id: '9', achieved: false },
        ]),
      );
      assert.equal(missing.status, 404);
      assert.equal(missing.data.error, 'Goal not found');
    },
    { today },
  );
  assert.equal(issued(queries, 'SET achieved').length, 0);
  assert.equal(issued(queries, 'ROLLBACK').length, 2);
  assert.equal(issued(queries, 'COMMIT').length, 0);
});

test('invalid reviews are English 400s before any query', async () => {
  const { pool, queries } = fakePool();
  await withApi(
    pool,
    async (call) => {
      for (const [reviews, message] of [
        [[], 'There are no goals to review'],
        ['goal', 'There are no goals to review'],
        [[{ id: 'x', achieved: true }], 'Invalid goal ID'],
        [[{ id: '2', achieved: 'yes' }], 'Invalid achieved value'],
        [[{ id: '2' }], 'Invalid achieved value'],
        [[{ achieved: true }], 'Invalid goal ID'],
        [[{ id: 3, achieved: true }], 'Invalid goal ID'],
        [['x'], 'Invalid review content'],
        [
          [{ id: '2', achieved: true, note: 'a'.repeat(1001) }],
          'The note must be 1000 characters or fewer',
        ],
        [[{ id: '2', achieved: true, note: 'a\0b' }], 'Contains characters that are not allowed'],
        [
          [
            { id: '2', achieved: true },
            { id: '2', achieved: false },
          ],
          'The same goal cannot be reviewed twice',
        ],
      ] as const) {
        const { status, data } = await call('/api/goals/reviews', putReviews(reviews));
        assert.equal(status, 400);
        assert.equal(data.error, message);
      }
      const arrayBody = await call('/api/goals/reviews', { method: 'PUT', body: [] });
      assert.equal(arrayBody.data.error, 'Invalid request format');
      const noBody = await call('/api/goals/reviews', { method: 'PUT' });
      assert.equal(noBody.data.error, 'There are no goals to review');
    },
    { today },
  );
  assert.equal(queries.length, 0);
});

test('goal input of the wrong type answers with one message, even if it has a length', async () => {
  const { pool, queries } = fakePool();
  await withApi(
    pool,
    async (call) => {
      const goals = await call('/api/goals', { method: 'POST', body: { title: [] } });
      assert.equal(goals.status, 400);
      assert.equal(goals.data.error, 'The goal must be text');
      const reviews = await call('/api/goals/reviews', { method: 'PUT', body: { reviews: '' } });
      assert.equal(reviews.status, 400);
      assert.equal(reviews.data.error, 'There are no goals to review');
    },
    { today },
  );
  assert.equal(queries.length, 0);
});

test('a review request over the limit is refused before any query, and one at the limit is not', async () => {
  const reviews = (count: number) =>
    Array.from({ length: count }, (_, index) => ({ id: String(index + 1), achieved: true }));
  const { pool, queries } = fakePool();
  await withApi(
    pool,
    async (call) => {
      const over = await call('/api/goals/reviews', {
        method: 'PUT',
        body: { reviews: reviews(1001) },
      });
      assert.equal(over.status, 400);
      assert.equal(over.data.error, 'You can review at most 1000 goals at a time');
      assert.equal(queries.length, 0);
      // The fake pool finds none of these goals, so passing validation answers 404.
      const atLimit = await call('/api/goals/reviews', {
        method: 'PUT',
        body: { reviews: reviews(1000) },
      });
      assert.equal(atLimit.status, 404);
    },
    { today },
  );
});

// Answers the linking route's queries in order, like the database would.
function linkPool(options: { goal?: boolean; goalElsewhere?: boolean; allowed?: string[] } = {}) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const query = async (sql: string, params: unknown[] = []) => {
    queries.push({ sql, params });
    if (sql.includes('app_settings')) return { rows: [{ value: '2026-10-18' }] };
    if (sql.includes('FROM twelve_week_goals WHERE id = $1 AND period_start'))
      return { rows: options.goal === false ? [] : [{ id: params[0] }] };
    if (sql.startsWith('SELECT 1')) return { rows: options.goalElsewhere ? [{}] : [] };
    if (sql.includes('FROM routines'))
      return { rows: (options.allowed ?? []).map((id) => ({ id })) };
    if (sql.includes('JOIN routines'))
      return { rows: (options.allowed ?? []).map((id) => ({ id, name: id, goalId: params[0] })) };
    return { rows: [] };
  };
  const pool = { query, connect: async () => ({ query, release() {} }) } as unknown as Pool;
  return { pool, queries };
}
const putLinks = (routineIds: unknown) => ({ method: 'PUT', body: { routineIds } });

test('linking replaces the links of a current goal in one transaction', async () => {
  const { pool, queries } = linkPool({ allowed: ['1', '2'] });
  await withApi(
    pool,
    async (call) => {
      const { status, data } = await call('/api/goals/9/routines', putLinks(['1', '2']));
      assert.equal(status, 200);
      assert.deepEqual(data.routines, [
        { id: '1', name: '1' },
        { id: '2', name: '2' },
      ]);
    },
    { today },
  );
  const steps = queries.map(({ sql }) => sql.split(' ')[0]);
  assert.equal(steps[0], 'BEGIN');
  assert.equal(steps.at(-1), 'COMMIT');
  const removed = queries.findIndex(({ sql }) =>
    sql.startsWith('DELETE FROM twelve_week_goal_routines'),
  );
  const added = queries.findIndex(({ sql }) =>
    sql.startsWith('INSERT INTO twelve_week_goal_routines'),
  );
  assert.ok(removed >= 0);
  assert.ok(removed < added);
  assert.equal(issued(queries, 'FOR SHARE').length, 1);
  assert.deepEqual(issued(queries, 'INSERT INTO twelve_week_goal_routines')[0].params, [
    '9',
    ['1', '2'],
  ]);
});

test('linking refuses a routine that cannot serve a goal and changes nothing', async () => {
  const { pool, queries } = linkPool({ allowed: ['1'] });
  await withApi(
    pool,
    async (call) => {
      const { status, data } = await call('/api/goals/9/routines', putLinks(['1', '2']));
      assert.equal(status, 400);
      assert.match(String(data.error), /cannot be linked/);
    },
    { today },
  );
  assert.equal(issued(queries, 'DELETE').length, 0);
  assert.equal(issued(queries, 'ROLLBACK').length, 1);
});

test('linking answers for a missing goal and for one of a past period', async () => {
  await withApi(
    linkPool({ goal: false }).pool,
    async (call) => {
      const { status, data } = await call('/api/goals/9/routines', putLinks([]));
      assert.equal(status, 404);
      assert.equal(data.error, 'Goal not found');
    },
    { today },
  );
  await withApi(
    linkPool({ goal: false, goalElsewhere: true }).pool,
    async (call) => {
      const { status, data } = await call('/api/goals/9/routines', putLinks([]));
      assert.equal(status, 400);
      assert.equal(data.error, 'Goals of past periods cannot be edited');
    },
    { today },
  );
});

test('linking refuses bad input in English before touching the database', async () => {
  const { pool, queries } = linkPool();
  await withApi(
    pool,
    async (call) => {
      for (const [body, message] of [
        [{}, 'Invalid list of routines to link'],
        [{ routineIds: 'x' }, 'Invalid list of routines to link'],
        [{ routineIds: ['abc'] }, 'Invalid routine ID'],
        [{ routineIds: [1] }, 'Invalid routine ID'],
        [{ routineIds: ['1', '1'] }, 'The same routine cannot be linked twice'],
      ] as const) {
        const { status, data } = await call('/api/goals/9/routines', { method: 'PUT', body });
        assert.equal(status, 400);
        assert.equal(data.error, message);
      }
      const many = Array.from({ length: 201 }, (_, index) => String(index));
      const tooMany = await call('/api/goals/9/routines', putLinks(many));
      assert.equal(tooMany.status, 400);
      assert.match(String(tooMany.data.error), /at most 200 routines/);
      const badId = await call('/api/goals/abc/routines', putLinks([]));
      assert.equal(badId.status, 400);
    },
    { today },
  );
  assert.equal(queries.length, 0);
});
