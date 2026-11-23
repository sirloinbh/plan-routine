import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { buildSnippet, escapeLike } from '../src/search.js';
import { withApi } from './helpers.js';

const texts = (
  body: string,
  rest: Partial<Record<'goodNote' | 'regretNote' | 'tomorrowNote', string>> = {},
) => ({
  body,
  goodNote: rest.goodNote ?? null,
  regretNote: rest.regretNote ?? null,
  tomorrowNote: rest.tomorrowNote ?? null,
});

test('LIKE wildcards in the typed text are escaped', () => {
  assert.equal(escapeLike('50%_off\\'), '50\\%\\_off\\\\');
  assert.equal(escapeLike('plain'), 'plain');
});

test('the snippet is cut around the first match, case-insensitively, body first', () => {
  const long = `${'a '.repeat(60)}Coffee${' b'.repeat(60)}`;
  const result = buildSnippet(texts(long, { goodNote: 'coffee too' }), 'COFFEE');
  assert.equal(result.field, 'body');
  assert.ok(result.snippet.startsWith('…') && result.snippet.endsWith('…'));
  assert.ok(result.snippet.includes('Coffee'));
  assert.ok(result.snippet.length < 120);
});

test('a match only in a note shows that note; no query shows the start of the body', () => {
  const noteOnly = buildSnippet(texts('Nothing here', { regretNote: 'Slept\nlate' }), 'slept');
  assert.deepEqual(noteOnly, { field: 'regretNote', snippet: 'Slept late' });
  const start = buildSnippet(texts('x'.repeat(200)), null);
  assert.equal(start.field, 'body');
  assert.equal(start.snippet, `${'x'.repeat(120)}…`);
  assert.deepEqual(buildSnippet(texts('short'), null), { field: 'body', snippet: 'short' });
});

function fakePool(rows: Record<string, unknown>[] = []) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      return { rows };
    },
  } as unknown as Pool;
  return { pool, queries };
}
const row = (date: string, body: string, total = 2) => ({
  date,
  body,
  goodNote: null,
  regretNote: null,
  tomorrowNote: null,
  total,
});
const clock = { today: () => '2026-10-22' };

test('a text search returns snippets, dates and the total, with its filters bound as parameters', async () => {
  const { pool, queries } = fakePool([
    row('2026-10-20', 'Drank coffee late'),
    row('2026-10-10', 'No coffee today'),
  ]);
  await withApi(
    pool,
    async (call) => {
      const { status, data } = await call(
        '/api/search?q=%20coffee%20&from=2026-10-01&to=2026-10-21&limit=5&offset=10',
      );
      assert.equal(status, 200);
      assert.equal(data.total, 2);
      assert.equal(data.limit, 5);
      assert.equal(data.offset, 10);
      assert.deepEqual(data.results, [
        { kind: 'diary', date: '2026-10-20', field: 'body', snippet: 'Drank coffee late' },
        { kind: 'diary', date: '2026-10-10', field: 'body', snippet: 'No coffee today' },
      ]);
      const { sql, params } = queries[0];
      assert.deepEqual(params, ['%coffee%', '2026-10-01', '2026-10-21', 5, 10]);
      assert.match(sql, /ORDER BY date DESC/);
      assert.doesNotMatch(sql, /coffee/);
    },
    clock,
  );
});

test('the typed text is escaped before it reaches ILIKE', async () => {
  const { pool, queries } = fakePool();
  await withApi(
    pool,
    async (call) => {
      const { data } = await call('/api/search?q=100%25_x');
      assert.deepEqual(queries[0].params.slice(0, 1), ['%100\\%\\_x%']);
      assert.deepEqual(data, { limit: 20, offset: 0, total: 0, results: [] });
    },
    clock,
  );
});

test('a routine filter alone lists days; missed also binds today, done does not', async () => {
  const { pool, queries } = fakePool([row('2026-10-05', 'Skipped the run')]);
  await withApi(
    pool,
    async (call) => {
      const missed = await call('/api/search?routineId=7');
      assert.equal(missed.status, 200);
      assert.deepEqual(queries[0].params, [7, '2026-10-22', 20, 0]);
      assert.match(
        queries[0].sql,
        /NOT EXISTS|NOT EXISTS \(SELECT 1 FROM routine_checks|AND NOT EXISTS/,
      );
      await call('/api/search?routineId=7&result=done&q=run');
      assert.deepEqual(queries[1].params, ['%run%', 7, 20, 0]);
      assert.doesNotMatch(queries[1].sql, /NOT EXISTS \(SELECT 1 FROM routine_checks/);
    },
    clock,
  );
});

test('skip reasons come back as their own results with the routine name', async () => {
  const skip = {
    kind: 'skip',
    date: '2026-10-21',
    body: null,
    goodNote: null,
    regretNote: null,
    tomorrowNote: null,
    routineId: 7,
    routineName: 'Morning run',
    reason: 'Knee hurts',
    total: 2,
  };
  const { pool, queries } = fakePool([
    skip,
    { ...row('2026-10-21', 'Rested the knee'), kind: 'diary' },
  ]);
  await withApi(
    pool,
    async (call) => {
      const { status, data } = await call('/api/search?q=knee&from=2026-10-01');
      assert.equal(status, 200);
      assert.deepEqual(data.results, [
        {
          kind: 'skip',
          date: '2026-10-21',
          field: 'skipReason',
          snippet: 'Knee hurts',
          routineId: 7,
          routineName: 'Morning run',
        },
        { kind: 'diary', date: '2026-10-21', field: 'body', snippet: 'Rested the knee' },
      ]);
      const { sql, params } = queries[0];
      // One text, one start date: shared by both sources.
      assert.deepEqual(params, ['%knee%', '2026-10-01', 20, 0]);
      assert.match(sql, /UNION ALL/);
      assert.match(sql, /s\.reason ILIKE \$1/);
      assert.match(sql, /s\.period_start >= \$2::date/);
      assert.match(sql, /r\.cadence = 'daily'/);
    },
    clock,
  );
});

test('skip reasons need a reason for a text search, but a routine lists every skip as Skipped', async () => {
  const { pool, queries } = fakePool();
  await withApi(
    pool,
    async (call) => {
      await call('/api/search?q=knee');
      assert.match(queries[0].sql, /s\.reason IS NOT NULL/);
      await call('/api/search?routineId=7');
      assert.doesNotMatch(queries[1].sql, /s\.reason IS NOT NULL/);
      assert.match(queries[1].sql, /s\.routine_id = \$1/);
    },
    clock,
  );
});

test('with a routine, skip reasons are of that routine and left out for the days it was done', async () => {
  const { pool, queries } = fakePool();
  await withApi(
    pool,
    async (call) => {
      await call('/api/search?routineId=7');
      assert.match(queries[0].sql, /s\.routine_id = \$1/);
      assert.doesNotMatch(queries[0].sql, /s\.reason ILIKE/);
      await call('/api/search?routineId=7&result=done&q=run');
      assert.doesNotMatch(queries[1].sql, /routine_skips/);
      assert.match(queries[1].sql, /d\.body ILIKE/);
    },
    clock,
  );
});

test('a routine alone also lists its missed days without a diary entry', async () => {
  const missed = {
    kind: 'missed',
    date: '2026-10-05',
    body: null,
    goodNote: null,
    regretNote: null,
    tomorrowNote: null,
    routineId: 7,
    routineName: 'Morning run',
    reason: null,
    total: 1,
  };
  const { pool, queries } = fakePool([missed]);
  await withApi(
    pool,
    async (call) => {
      const { data } = await call('/api/search?routineId=7&from=2026-10-01');
      assert.deepEqual(data.results, [
        {
          kind: 'missed',
          date: '2026-10-05',
          field: 'none',
          snippet: '',
          routineId: 7,
          routineName: 'Morning run',
        },
      ]);
      // The routine, today and the start date are bound once and shared by every source.
      assert.deepEqual(queries[0].params, ['2026-10-01', 7, '2026-10-22', 20, 0]);
      assert.match(queries[0].sql, /generate_series/);
      assert.match(queries[0].sql, /NOT EXISTS \(SELECT 1 FROM diary_entries/);
      // The missed days follow Records and Stats (dailyRoutineOn: weekday schedule, created, archived) and leave out
      // the days with a check or a skip.
      assert.match(queries[0].sql, /routines\.weekdays IS NULL OR EXTRACT\(DOW FROM days\.date\)/);
      assert.match(
        queries[0].sql,
        /NOT EXISTS \(SELECT 1 FROM routine_checks c WHERE c\.routine_id = routines\.id/,
      );
      assert.match(
        queries[0].sql,
        /NOT EXISTS \(SELECT 1 FROM routine_skips k WHERE k\.routine_id = routines\.id/,
      );
      // Diary results of a routine are the entries on those missed days.
      assert.match(queries[0].sql, /d\.entry_date IN \(SELECT day FROM missed_days\)/);
      // With text the days still decide the diary results, but no text-less missed-day rows are added.
      await call('/api/search?routineId=7&q=run');
      assert.match(queries[1].sql, /missed_days/);
      assert.doesNotMatch(queries[1].sql, /SELECT 'missed'/);
      // Only the days it was done, or no routine at all: no missed days.
      await call('/api/search?routineId=7&result=done');
      await call('/api/search?q=run');
      for (const query of queries.slice(2))
        assert.doesNotMatch(query.sql, /missed_days|generate_series/);
    },
    clock,
  );
});

test('the search refuses missing, malformed and out-of-range input without querying', async () => {
  const { pool, queries } = fakePool();
  await withApi(
    pool,
    async (call) => {
      const error = async (path: string) => {
        const { status, data } = await call(path);
        assert.equal(status, 400, path);
        return data.error;
      };
      assert.equal(await error('/api/search'), 'Enter a word to search for or choose a routine');
      assert.equal(
        await error('/api/search?q=%20%20'),
        'Enter a word to search for or choose a routine',
      );
      assert.equal(
        await error(`/api/search?q=${'a'.repeat(101)}`),
        'Search text must be 100 characters or fewer',
      );
      assert.equal(
        await error('/api/search?q=a&from=nope'),
        'Date must be a real date in YYYY-MM-DD format',
      );
      assert.equal(
        await error('/api/search?q=a&from=2026-10-10&to=2026-10-01'),
        'The start date must not be after the end date',
      );
      assert.equal(await error('/api/search?routineId=0'), 'Invalid routine ID');
      assert.equal(await error('/api/search?routineId=abc'), 'Invalid routine ID');
      assert.equal(
        await error('/api/search?routineId=1&result=other'),
        'The result must be missed or done',
      );
      assert.equal(await error('/api/search?q=a&limit=0'), 'The limit must be from 1 to 50');
      assert.equal(await error('/api/search?q=a&limit=51'), 'The limit must be from 1 to 50');
      assert.equal(await error('/api/search?q=a&limit=x'), 'The limit must be a whole number');
      assert.equal(await error('/api/search?q=a&offset=-1'), 'The offset must be a whole number');
      assert.equal(await error('/api/search?q=a%00b'), 'Contains characters that are not allowed');
      assert.equal(queries.length, 0);
    },
    clock,
  );
});
