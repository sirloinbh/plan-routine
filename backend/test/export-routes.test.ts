import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createAuthMiddleware } from '@sirloinbh/auth-client';
import type { Pool } from 'pg';

import { createApp } from '../src/app.js';

const today = () => '2026-10-22';

// A fake pool that answers by matching the SQL. The real SQL runs in the DB tests.
function fakePool(tables: Record<string, unknown[]>) {
  const statements: string[] = [];
  const answer = async (sql: string) => {
    statements.push(sql);
    if (sql.includes('information_schema.tables'))
      return {
        rows: [...Object.keys(tables), 'schema_migrations'].sort().map((name) => ({ name })),
      };
    const table = /FROM "([^"]+)"/.exec(sql)?.[1];
    if (table && table in tables) return { rows: tables[table] };
    if (sql.includes('FROM routine_checks'))
      return {
        rows: [
          {
            date: '2026-10-21',
            routine: '=HYPERLINK("x")',
            cadence: 'daily',
            category: 'care',
            checkedAt: new Date('2026-10-21T10:00:00Z'),
            status: 'done',
            amount: 12.5,
            unit: 'pages',
            reason: null,
          },
          {
            date: '2026-10-22',
            routine: 'Read',
            cadence: 'daily',
            category: 'study',
            checkedAt: null,
            status: 'skipped',
            amount: null,
            unit: 'pages',
            reason: 'Sick, again',
          },
        ],
      };
    if (sql.includes('FROM diary_entries'))
      return {
        rows: [
          {
            date: '2026-10-21',
            body: '좋은 날, "정말"',
            goodNote: '-1 is fine',
            regretNote: null,
            tomorrowNote: null,
            mood: 4,
            energy: null,
            updatedAt: new Date('2026-10-21T12:00:00Z'),
          },
        ],
      };
    return { rows: [] };
  };
  const pool = {
    query: answer,
    connect: async () => ({ query: answer, release: () => undefined }),
  } as unknown as Pool;
  return { pool, statements };
}

async function serve(
  pool: Pool,
  run: (base: string) => Promise<void>,
  auth?: ReturnType<typeof createAuthMiddleware>,
) {
  const server = createApp(pool, { today, auth }).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    await run(`http://127.0.0.1:${address.port}/api/export`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test('the JSON export holds every table in a versioned document and is a download', async () => {
  const tables = {
    routines: [{ id: 1, name: 'Read' }],
    diary_entries: [{ entry_date: '2026-10-21', body: 'x' }],
    weekly_reviews: [],
  };
  const { pool, statements } = fakePool(tables);
  await serve(pool, async (base) => {
    const response = await fetch(base);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(
      response.headers.get('content-disposition') ?? '',
      /attachment; filename="plan-routine-export-2026-10-22\.json"/,
    );
    assert.deepEqual(await response.json(), { version: 1, exportedOn: '2026-10-22', tables });
  });
  assert.equal(statements[0], 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(statements.at(-1), 'COMMIT');
  assert.ok(!statements.some((sql) => sql.includes('schema_migrations"')));
});

test('the CSV exports are UTF-8 with a byte order mark and neutralize formula cells', async () => {
  const { pool } = fakePool({});
  await serve(pool, async (base) => {
    const checks = await fetch(`${base}/checks.csv`);
    assert.equal(checks.status, 200);
    assert.match(checks.headers.get('content-type') ?? '', /^text\/csv; charset=utf-8/);
    assert.match(
      checks.headers.get('content-disposition') ?? '',
      /plan-routine-checks-2026-10-22\.csv/,
    );
    const checkText = Buffer.from(await checks.arrayBuffer()).toString('utf8');
    assert.equal(
      checkText,
      '﻿date,routine,cadence,category,checked_at,status,amount,unit,skip_reason\r\n' +
        '2026-10-21,"\'=HYPERLINK(""x"")",daily,care,2026-10-21T10:00:00.000Z,done,12.5,pages,\r\n' +
        '2026-10-22,Read,daily,study,,skipped,,pages,"Sick, again"\r\n',
    );

    const diary = await fetch(`${base}/diary.csv`);
    const diaryText = Buffer.from(await diary.arrayBuffer()).toString('utf8');
    assert.equal(
      diaryText,
      '﻿date,entry,went_well,could_be_better,tomorrow,mood,energy,updated_at\r\n2026-10-21,"좋은 날, ""정말""",\'-1 is fine,,,4,,2026-10-21T12:00:00.000Z\r\n',
    );
  });
});

test('without a session no export is served, with one it is', async () => {
  const auth = createAuthMiddleware({
    authUrl: 'http://shared-auth-api:3110',
    fetch: async (_url, init) => {
      const cookie = (init?.headers as Record<string, string> | undefined)?.cookie ?? '';
      const ok = cookie.includes('sirloinbh.session_token=good');
      return {
        ok: true,
        status: 200,
        json: async () =>
          ok ? { user: { id: 'u1', email: 'me@example.com', name: 'Me', image: null } } : null,
      };
    },
  });
  const { pool, statements } = fakePool({ routines: [{ id: 1 }] });
  await serve(
    pool,
    async (base) => {
      for (const path of ['', '/checks.csv', '/diary.csv']) {
        const refused = await fetch(`${base}${path}`);
        assert.equal(refused.status, 401, path);
        assert.deepEqual(await refused.json(), { error: 'unauthorized' });
      }
      assert.equal(statements.length, 0, 'nothing was read');
      const headers = { cookie: 'sirloinbh.session_token=good' };
      for (const path of ['', '/checks.csv', '/diary.csv'])
        assert.equal((await fetch(`${base}${path}`, { headers })).status, 200, path);
    },
    auth,
  );
});
