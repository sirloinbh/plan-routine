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

const refused = '요청 형식이 올바르지 않습니다';

test('broken JSON gets a Korean 400 whichever route it is sent to', async () => {
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
    for (const raw of ['5', 'true', '"글자"']) {
      const { status, data } = await call('/api/routines', { method: 'POST', raw });
      assert.equal(status, 400, raw);
      assert.equal(data.error, refused, raw);
    }
  });
});

test('a body over the limit gets a Korean 413', async () => {
  await withApi(untouchedPool(), async (call) => {
    const { status, data } = await call('/api/routines', {
      method: 'POST',
      raw: JSON.stringify({ name: 'x'.repeat(300 * 1024) }),
    });
    assert.equal(status, 413);
    assert.equal(data.error, '요청 내용이 너무 큽니다');
  });
});

test('a character set the server cannot read gets a Korean 415', async () => {
  await withApi(untouchedPool(), async (call) => {
    const { status, data } = await call('/api/routines', {
      method: 'POST',
      raw: '{}',
      contentType: 'application/json; charset=latin1',
    });
    assert.equal(status, 415);
    assert.equal(data.error, '지원하지 않는 요청 형식입니다');
  });
});

test('an address that cannot be decoded gets a Korean 400', async () => {
  await withApi(untouchedPool(), async (call) => {
    const { status, data } = await call('/api/routines/%E0%A4%A', { method: 'PATCH', body: {} });
    assert.equal(status, 400);
    assert.equal(data.error, refused);
  });
});

test('a body that is not an object gets a Korean 400 on every route that reads one', async () => {
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

test('a routine name with a NUL character gets a Korean 400', async () => {
  await withApi(untouchedPool(), async (call) => {
    const created = await call('/api/routines', {
      method: 'POST',
      body: { name: 'a\0b', cadence: 'weekly' },
    });
    assert.equal(created.status, 400);
    assert.equal(created.data.error, '쓸 수 없는 문자가 들어 있습니다');
    const renamed = await call('/api/routines/1', { method: 'PATCH', body: { name: 'a\0b' } });
    assert.equal(renamed.status, 400);
    assert.equal(renamed.data.error, '쓸 수 없는 문자가 들어 있습니다');
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
        assert.equal(response.data.error, '서버 오류가 발생했습니다');
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
    assert.equal(parts.at(-1), '외 5개');
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
    assert.doesNotMatch(String(data.error), /외 /);
  });
});
