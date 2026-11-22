import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { serviceDate } from '../src/standard/http.js';
import { withApi } from './helpers.js';

const pool = (query: () => Promise<unknown>) => ({ query }) as unknown as Pool;

test('health reports the service and the injected service date when the DB answers', async () => {
  await withApi(
    pool(async () => ({ rows: [] })),
    async (call) => {
      const { status, data } = await call('/api/health');
      assert.equal(status, 200);
      assert.deepEqual(data, { ok: true, service: 'plan-routine', today: '2026-10-19' });
    },
    { today: () => '2026-10-19' },
  );
});

test('every API response carries an X-Request-Id and keeps a valid incoming one', async () => {
  const log = console.log;
  console.log = () => {};
  try {
    await withApi(
      pool(async () => ({ rows: [] })),
      async (call) => {
        const generated = await call('/api/health');
        assert.match(generated.headers.get('x-request-id') ?? '', /^[\w.-]{8,}$/);
        const missing = await call('/api/does-not-exist');
        assert.ok(missing.headers.get('x-request-id'));
      },
    );
  } finally {
    console.log = log;
  }
});

test('a DB failure becomes an English 500 without leaking the error', async () => {
  const original = console.error;
  console.error = () => {};
  try {
    await withApi(
      pool(async () => {
        throw new Error('password authentication failed for user secret');
      }),
      async (call) => {
        const { status, data } = await call('/api/health');
        assert.equal(status, 500);
        assert.deepEqual(data, { error: 'Server error' });
      },
    );
  } finally {
    console.error = original;
  }
});

test('a 500 logs request_error with the request ID that the response header carries', async () => {
  const original = console.error;
  const lines: string[] = [];
  console.error = (line: string) => lines.push(line);
  try {
    await withApi(
      pool(async () => {
        throw new Error('boom');
      }),
      async (call) => {
        const { headers } = await call('/api/health');
        const logged = lines
          .map((line) => JSON.parse(line) as Record<string, unknown>)
          .find((line) => line.event === 'request_error');
        assert.ok(logged);
        assert.equal(logged.requestId, headers.get('x-request-id'));
        assert.equal(logged.message, 'boom');
      },
    );
  } finally {
    console.error = original;
  }
});

test('a PostgreSQL duplicate is a 409, bad input a 400 and a Zod error a 400 with the message', async () => {
  for (const [code, status] of [
    ['23505', 409],
    ['22P02', 400],
  ] as const) {
    await withApi(
      pool(async () => {
        throw Object.assign(new Error('db text that must not leak'), { code });
      }),
      async (call) => {
        const response = await call('/api/health');
        assert.equal(response.status, status, code);
        assert.doesNotMatch(String(response.data.error), /db text/);
      },
    );
  }
  await withApi(
    pool(async () => ({ rows: [] })),
    async (call) => {
      const { status, data } = await call('/api/periods?date=nope');
      assert.equal(status, 400);
      assert.equal(typeof data.error, 'string');
    },
  );
});

test('unknown API paths return an English 404 JSON body', async () => {
  await withApi(
    pool(async () => ({ rows: [] })),
    async (call) => {
      const { status, data } = await call('/api/does-not-exist');
      assert.equal(status, 404);
      assert.equal(data.error, 'API not found');
    },
  );
});

test('service date follows Asia/Seoul across the UTC day boundary', () => {
  assert.equal(serviceDate(new Date('2026-10-18T14:59:59Z')), '2026-10-18');
  assert.equal(serviceDate(new Date('2026-10-18T15:00:00Z')), '2026-10-19');
});
