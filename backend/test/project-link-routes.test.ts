import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { allowedUrl } from '../src/project-link-routes.js';
import { withApi } from './helpers.js';

test.describe('allowed addresses', () => {
  for (const url of [
    'https://example.com/books',
    'https://example.com:8443/',
    'http://localhost:8107/',
    'http://127.0.0.1:3000',
    'http://10.0.0.5/',
    'http://172.16.0.1/',
    'http://172.31.255.1/',
    'http://192.168.0.10:8080/',
    'http://100.64.0.1/',
    'http://nas.local/',
    'http://books.tailnet.ts.net/',
    'http://[::1]:3000/',
    'http://[fd00::1]/',
    'http://[fc12:3456::1]/',
    'http://0x7f.1/',
    'http://0177.0.0.1/',
    'http://2130706433/',
  ])
    test(url, () => assert.notEqual(allowedUrl(url), null));
});

test.describe('refused addresses', () => {
  for (const url of [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,hello',
    'file:///etc/passwd',
    'ftp://example.com/',
    'http://example.com/',
    'http://8.8.8.8/',
    'http://172.32.0.1/',
    'http://192.169.0.1/',
    'http://100.128.0.1/',
    'http://localhost.example.com/',
    'http://example.local.com/',
    'https://user:secret@example.com/',
    'http://10.0.0.1e1/',
    'http://10.0.0.0b1/',
    'http://127.0.0.-1/',
    'http://[fc::1]/',
    'http://[fd::1]/',
    'http://[::ffff:8.8.8.8]/',
    'http://localhost./',
    'http://8.8.8.8./',
    'java\tscript:alert(1)',
    '\u0001javascript:alert(1)',
    'http://evil.example\\@localhost/',
    'http://evil.example%2f.local/',
    'example.com',
    '/books',
    '',
  ])
    test(url || '(empty)', () => assert.equal(allowedUrl(url), null));
});

function fakePool(rows: unknown[] = []) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      return { rows };
    },
  } as unknown as Pool;
  return { pool, queries };
}

test('a project is stored with its name trimmed and its address normalised', async () => {
  const stored = { id: '1', name: '가계부', url: 'https://example.com/' };
  const { pool, queries } = fakePool([stored]);
  await withApi(pool, async (call) => {
    const { status, data } = await call('/api/project-links', {
      method: 'POST',
      body: { name: ' 가계부 ', url: ' https://EXAMPLE.com ' },
    });
    assert.equal(status, 201);
    assert.deepEqual(data.project, stored);
  });
  assert.deepEqual(queries[0].params, ['가계부', 'https://example.com/']);
});

test('bad projects are refused in Korean before the database', async () => {
  const { pool, queries } = fakePool();
  await withApi(pool, async (call) => {
    for (const [body, message] of [
      [{ url: 'https://a.example' }, '프로젝트 이름을 입력해 주세요'],
      [{ name: ' ', url: 'https://a.example' }, '프로젝트 이름을 입력해 주세요'],
      [{ name: 1, url: 'https://a.example' }, '프로젝트 이름은 글자여야 합니다'],
      [
        { name: 'a'.repeat(101), url: 'https://a.example' },
        '프로젝트 이름은 100자 이하로 입력해 주세요',
      ],
      [{ name: 'a\0b', url: 'https://a.example' }, '쓸 수 없는 문자가 들어 있습니다'],
      [{ name: '가계부' }, '주소를 입력해 주세요'],
      [{ name: '가계부', url: ' ' }, '주소를 입력해 주세요'],
      [{ name: '가계부', url: 5 }, '주소는 글자여야 합니다'],
      [
        { name: '가계부', url: 'javascript:alert(1)' },
        '주소는 https:// 또는 사설 접속 주소만 쓸 수 있습니다',
      ],
      [
        { name: '가계부', url: 'http://example.com/' },
        '주소는 https:// 또는 사설 접속 주소만 쓸 수 있습니다',
      ],
    ] as const) {
      const { status, data } = await call('/api/project-links', { method: 'POST', body });
      assert.equal(status, 400);
      assert.equal(data.error, message);
    }
    const tooLong = await call('/api/project-links', {
      method: 'POST',
      body: { name: '가계부', url: `https://a.example/${'x'.repeat(2048)}` },
    });
    assert.equal(tooLong.status, 400);
    assert.match(String(tooLong.data.error), /2048자/);
    // A refused address gets one message, however long it is.
    const refusedLong = await call('/api/project-links', {
      method: 'POST',
      body: { name: '가계부', url: `http://example.com/${'x'.repeat(2100)}` },
    });
    assert.equal(refusedLong.data.error, '주소는 https:// 또는 사설 접속 주소만 쓸 수 있습니다');
    // Short as typed, far longer once percent-encoded for storage.
    const encoded = await call('/api/project-links', {
      method: 'POST',
      body: { name: '가계부', url: `https://a.example/${'가'.repeat(1000)}` },
    });
    assert.equal(encoded.status, 400);
    assert.match(String(encoded.data.error), /2048자/);
  });
  assert.equal(queries.length, 0);
});

test('removing answers for a missing project', async () => {
  const { pool } = fakePool();
  await withApi(pool, async (call) => {
    const missing = await call('/api/project-links/9', { method: 'DELETE' });
    assert.equal(missing.status, 404);
    assert.equal(missing.data.error, '프로젝트를 찾을 수 없습니다');
    assert.equal((await call('/api/project-links/abc', { method: 'DELETE' })).status, 400);
  });
});

test('a routine link is set or cleared, and refused for something missing', async () => {
  const routine = { id: '1', name: '가계부 쓰기' };
  const found = fakePool([routine]);
  await withApi(found.pool, async (call) => {
    const set = await call('/api/routines/1/project-link', {
      method: 'PUT',
      body: { projectLinkId: '7' },
    });
    assert.equal(set.status, 200);
    assert.deepEqual(set.data.routine, routine);
    const cleared = await call('/api/routines/1/project-link', {
      method: 'PUT',
      body: { projectLinkId: null },
    });
    assert.equal(cleared.status, 200);
  });
  assert.deepEqual(
    found.queries.map((query) => query.params),
    [
      ['7', '1'],
      [null, '1'],
    ],
  );

  const missing = fakePool();
  await withApi(missing.pool, async (call) => {
    const { status, data } = await call('/api/routines/1/project-link', {
      method: 'PUT',
      body: { projectLinkId: '7' },
    });
    assert.equal(status, 404);
    assert.equal(data.error, '루틴이나 프로젝트를 찾을 수 없습니다');
    for (const body of [{}, { projectLinkId: 'abc' }, { projectLinkId: 7 }, []]) {
      const refused = await call('/api/routines/1/project-link', { method: 'PUT', body });
      assert.equal(refused.status, 400);
    }
  });
  assert.equal(missing.queries.length, 1);
});
