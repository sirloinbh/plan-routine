import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { withApi } from './helpers.js';

// A request refused for its form must never reach the database.
function untouchedPool() {
  return {
    query: async () => {
      throw new Error('The database must not be reached');
    },
    connect: async () => {
      throw new Error('The database must not be reached');
    },
  } as unknown as Pool;
}

const refused = 'Invalid request format';

test('broken JSON gets an English 400 whichever route it is sent to', async () => {
  await withApi(untouchedPool(), async (call) => {
    for (const [method, path] of [
      ['POST', '/api/routines'],
      ['PATCH', '/api/routines/1'],
      ['POST', '/api/goals'],
      ['PUT', '/api/diary/2026-10-22'],
    ]) {
      const { status, data } = await call(path, { method, raw: '{"name":' });
      assert.equal(status, 400, path);
      assert.equal(data.error, refused, path);
    }
    // The JSON parser takes only objects and arrays, so these are refused the same way.
    for (const raw of ['5', 'true', '"text"']) {
      const { status, data } = await call('/api/routines', { method: 'POST', raw });
      assert.equal(status, 400, raw);
      assert.equal(data.error, refused, raw);
    }
  });
});

test('a body over the limit gets an English 413', async () => {
  await withApi(untouchedPool(), async (call) => {
    const { status, data } = await call('/api/routines', {
      method: 'POST',
      raw: JSON.stringify({ name: 'x'.repeat(300 * 1024) }),
    });
    assert.equal(status, 413);
    assert.equal(data.error, 'The request is too large');
  });
});

test('a character set the server cannot read gets an English 415', async () => {
  await withApi(untouchedPool(), async (call) => {
    const { status, data } = await call('/api/routines', {
      method: 'POST',
      raw: '{}',
      contentType: 'application/json; charset=latin1',
    });
    assert.equal(status, 415);
    assert.equal(data.error, 'Unsupported request format');
  });
});

test('an address that cannot be decoded gets an English 400', async () => {
  await withApi(untouchedPool(), async (call) => {
    const { status, data } = await call('/api/routines/%E0%A4%A', { method: 'PATCH', body: {} });
    assert.equal(status, 400);
    assert.equal(data.error, refused);
  });
});

test('a body that is not an object gets an English 400 on every route that reads one', async () => {
  await withApi(untouchedPool(), async (call) => {
    for (const [method, path] of [
      ['POST', '/api/routines'],
      ['PATCH', '/api/routines/1'],
      ['POST', '/api/routines/1/move'],
      ['POST', '/api/goals'],
      ['PATCH', '/api/goals/1'],
      ['PUT', '/api/goals/reviews'],
      ['PUT', '/api/diary/2026-10-22'],
    ]) {
      const { status, data } = await call(path, { method, body: [] });
      assert.equal(status, 400, path);
      assert.equal(data.error, refused, path);
    }
  });
});

test('a routine name with a NUL character gets an English 400', async () => {
  await withApi(untouchedPool(), async (call) => {
    const created = await call('/api/routines', {
      method: 'POST',
      body: { name: 'a\0b', cadence: 'weekly' },
    });
    assert.equal(created.status, 400);
    assert.equal(created.data.error, 'Contains characters that are not allowed');
    const renamed = await call('/api/routines/1', { method: 'PATCH', body: { name: 'a\0b' } });
    assert.equal(renamed.status, 400);
    assert.equal(renamed.data.error, 'Contains characters that are not allowed');
  });
});

test('an unexpected error stays a 500 unless it carries a 4xx status', async () => {
  const logged = console.error;
  console.error = () => {};
  try {
    for (const status of ['not a number', 500, 502]) {
      const pool = {
        query: async () => {
          throw Object.assign(new Error('boom'), { status });
        },
      } as unknown as Pool;
      await withApi(pool, async (call) => {
        const response = await call('/api/health');
        assert.equal(response.status, 500);
        assert.equal(response.data.error, 'A server error occurred');
      });
    }
  } finally {
    console.error = logged;
  }
});

test('a request with many errors gets at most ten messages and a count of the rest', async () => {
  await withApi(untouchedPool(), async (call) => {
    const { status, data } = await call('/api/goals/reviews', {
      method: 'PUT',
      body: { reviews: Array.from({ length: 15 }, () => 1) },
    });
    assert.equal(status, 400);
    const parts = String(data.error).split(', ');
    assert.equal(parts.length, 11);
    assert.equal(parts.at(-1), '5 more');
  });
});

test('ten errors are shown in full, with no count', async () => {
  await withApi(untouchedPool(), async (call) => {
    const { status, data } = await call('/api/goals/reviews', {
      method: 'PUT',
      body: { reviews: Array.from({ length: 10 }, () => 1) },
    });
    assert.equal(status, 400);
    const parts = String(data.error).split(', ');
    assert.equal(parts.length, 10);
    assert.doesNotMatch(String(data.error), / more/);
  });
});

test('every route that reads a body answers broken JSON and bare values with the English 400', async () => {
  await withApi(untouchedPool(), async (call) => {
    for (const [method, path] of [
      ['POST', '/api/routines'],
      ['PATCH', '/api/routines/1'],
      ['POST', '/api/routines/1/move'],
      ['POST', '/api/goals'],
      ['PATCH', '/api/goals/1'],
      ['PUT', '/api/goals/reviews'],
      ['PUT', '/api/diary/2026-10-22'],
    ]) {
      for (const raw of ['{', 'null', '1', '"x"', 'true']) {
        const { status, data } = await call(path, { method, raw });
        assert.equal(status, 400, `${path} ${raw}`);
        assert.equal(data.error, refused, `${path} ${raw}`);
      }
    }
  });
});
