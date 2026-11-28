import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { withApi } from './helpers.js';

type Row = {
  id: number;
  horizon: string;
  periodStart: string;
  title: string;
  description: string | null;
  sortOrder: number;
  status: string;
};

const plan = (id: number, horizon: string, periodStart: string, title = 'Plan'): Row => ({
  id,
  horizon,
  periodStart,
  title,
  description: null,
  sortOrder: 0,
  status: 'planned',
});

type Recorded = { sql: string; params: unknown[] };

// Fake pool that answers by matching the SQL and records every query. The real SQL runs in the DB tests.
// The fake anchor is Sunday 2026-10-18.
function fakePool(rows: Row[] = []) {
  const queries: Recorded[] = [];
  const query = async (sql: string, params: unknown[] = []) => {
    queries.push({ sql, params });
    if (sql.includes('app_settings')) return { rows: [{ value: '2026-10-18' }] };
    if (sql.includes('INSERT INTO plans'))
      return {
        rows: [
          {
            ...plan(9, String(params[0]), String(params[1]), String(params[2])),
            description: params[3],
            status: params[4],
          },
        ],
      };
    if (sql.includes('FROM plans WHERE id') || sql.startsWith('DELETE'))
      return { rows: rows.filter((row) => row.id === params[0]) };
    if (sql.startsWith('UPDATE plans'))
      return {
        rows: [
          {
            ...plan(Number(params[5]), String(params[4]), String(params[3]), String(params[0])),
            description: params[1],
            status: params[2],
          },
        ],
      };
    if (sql.includes('FROM plans WHERE horizon'))
      return {
        rows: rows.filter((row) => row.horizon === params[0] && row.periodStart === params[1]),
      };
    return { rows: [] };
  };
  const pool = { query, connect: async () => ({ query, release() {} }) } as unknown as Pool;
  return { pool, queries };
}

const today = () => '2026-10-22';
const issued = (queries: Recorded[], word: string) => queries.filter((q) => q.sql.includes(word));

test('each horizon lists its current period', async () => {
  const { pool } = fakePool([
    plan(1, 'week', '2026-10-18', 'This week'),
    plan(2, 'week', '2026-10-11', 'Last week'),
    plan(3, 'twelve_week', '2026-10-18'),
    plan(4, 'year', '2026-10-18'),
    plan(5, 'decade', '2026-01-01'),
  ]);
  const expected = {
    week: ['2026-10-18', '2026-10-24', [1]],
    twelve_week: ['2026-10-18', '2027-01-09', [3]],
    year: ['2026-10-18', '2027-10-16', [4]],
    decade: ['2026-01-01', '2035-12-31', [5]],
  } as const;
  await withApi(
    pool,
    async (call) => {
      for (const [horizon, [start, end, ids]] of Object.entries(expected)) {
        const { status, data } = await call(`/api/plans?horizon=${horizon}`);
        assert.equal(status, 200, horizon);
        assert.deepEqual(data.period, { start, end }, horizon);
        assert.deepEqual(
          (data.plans as Row[]).map((row) => row.id),
          ids,
          horizon,
        );
      }
    },
    { today },
  );
});

test('a date in the query names the period that holds it', async () => {
  const { pool, queries } = fakePool();
  await withApi(
    pool,
    async (call) => {
      const { status, data } = await call('/api/plans?horizon=week&periodStart=2026-10-14');
      assert.equal(status, 200);
      assert.deepEqual(data.period, { start: '2026-10-11', end: '2026-10-17' });
    },
    { today },
  );
  assert.deepEqual(issued(queries, 'FROM plans')[0].params, ['week', '2026-10-11']);
});

test('a new plan goes to the period of its horizon with trimmed text and a status', async () => {
  const { pool, queries } = fakePool();
  await withApi(
    pool,
    async (call) => {
      const { status, data } = await call('/api/plans', {
        method: 'POST',
        body: {
          horizon: 'decade',
          periodStart: '2031-06-15',
          title: ' Retire ',
          description: '  ',
        },
      });
      assert.equal(status, 201);
      const created = data.plan as Row & { periodEnd: string };
      assert.equal(created.periodStart, '2031-01-01');
      assert.equal(created.periodEnd, '2040-12-31');
      assert.equal(created.title, 'Retire');
      assert.equal(created.description, null);
      assert.equal(created.status, 'planned');
    },
    { today },
  );
  assert.deepEqual(issued(queries, 'INSERT INTO plans')[0].params, [
    'decade',
    '2031-01-01',
    'Retire',
    null,
    'planned',
  ]);
  // One audit row, written in the same transaction as the change.
  assert.equal(issued(queries, 'INSERT INTO audit_log').length, 1);
});

test('without a period start a new plan goes to the current period', async () => {
  const { pool, queries } = fakePool();
  await withApi(
    pool,
    async (call) => {
      const { status } = await call('/api/plans', {
        method: 'POST',
        body: { horizon: 'twelve_week', title: 'Ship it', status: 'in_progress' },
      });
      assert.equal(status, 201);
    },
    { today },
  );
  assert.deepEqual(issued(queries, 'INSERT INTO plans')[0].params.slice(0, 2), [
    'twelve_week',
    '2026-10-18',
  ]);
});

test('bad input is a 400 that names the field and writes nothing', async () => {
  const { pool, queries } = fakePool();
  await withApi(
    pool,
    async (call) => {
      const bad = async (body: unknown) => {
        const { status, data } = await call('/api/plans', { method: 'POST', body });
        assert.equal(status, 400);
        return JSON.stringify(data);
      };
      assert.match(await bad({ horizon: 'month', title: 'x' }), /Horizon must be one of/);
      assert.match(await bad({ title: 'x' }), /Choose a horizon/);
      assert.match(await bad({ horizon: 'week', title: '   ' }), /Enter a title/);
      assert.match(await bad({ horizon: 'week' }), /Enter a title/);
      assert.match(
        await bad({ horizon: 'week', title: 'a'.repeat(201) }),
        /200 characters or fewer/,
      );
      assert.match(
        await bad({ horizon: 'week', title: 'x', description: 'a'.repeat(2001) }),
        /2000 characters or fewer/,
      );
      assert.match(await bad({ horizon: 'week', title: 'x', status: 'late' }), /Status must be/);
      assert.match(
        await bad({ horizon: 'week', title: 'x', periodStart: '2026-02-30' }),
        /real date/,
      );
      assert.match(
        await bad({ horizon: 'decade', title: 'x', periodStart: '3000-01-01' }),
        /Period start must be/,
      );
      assert.equal((await call('/api/plans?horizon=month')).status, 400);
      assert.equal((await call('/api/plans')).status, 400);
    },
    { today },
  );
  assert.equal(issued(queries, 'INSERT INTO plans').length, 0);
});

test('a change needs a field, keeps the rest and moves the period by date', async () => {
  const { pool, queries } = fakePool([plan(4, 'year', '2026-10-18', 'Old title')]);
  await withApi(
    pool,
    async (call) => {
      assert.equal((await call('/api/plans/4', { method: 'PATCH', body: {} })).status, 400);
      const { status, data } = await call('/api/plans/4', {
        method: 'PATCH',
        body: { status: 'done', periodStart: '2027-12-01' },
      });
      assert.equal(status, 200);
      assert.equal((data.plan as Row).status, 'done');
    },
    { today },
  );
  const update = issued(queries, 'UPDATE plans')[0].params;
  // title and description stay; 2027-12-01 falls into the year period starting 2027-10-17.
  assert.deepEqual(update, ['Old title', null, 'done', '2027-10-17', 'year', 4]);
  assert.equal(issued(queries, 'INSERT INTO audit_log').length, 1);
});

test('a missing plan is a 404 and a bad id a 400', async () => {
  const { pool } = fakePool();
  await withApi(
    pool,
    async (call) => {
      const patch = await call('/api/plans/77', { method: 'PATCH', body: { title: 'x' } });
      assert.equal(patch.status, 404);
      assert.equal((await call('/api/plans/77', { method: 'DELETE' })).status, 404);
      assert.equal((await call('/api/plans/abc', { method: 'DELETE' })).status, 400);
    },
    { today },
  );
});

test('deleting a plan removes it and writes an audit row', async () => {
  const { pool, queries } = fakePool([plan(6, 'week', '2026-10-18')]);
  await withApi(
    pool,
    async (call) => {
      const { status, data } = await call('/api/plans/6', { method: 'DELETE' });
      assert.equal(status, 200);
      assert.equal(data.id, 6);
    },
    { today },
  );
  assert.equal(issued(queries, 'INSERT INTO audit_log').length, 1);
});
