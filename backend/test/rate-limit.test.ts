import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

import express from 'express';

import { apiRateLimit } from '../src/standard/rate-limit.js';

// Behind nginx every request reaches the API from the proxy; the client is the last X-Forwarded-For entry.
async function withApp(
  limitPerMinute: number,
  run: (get: (ip: string, path?: string) => Promise<number>) => Promise<void>,
) {
  const app = express();
  apiRateLimit(app, { limitPerMinute });
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/items', (_req, res) => res.json([]));
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    await run(async (ip, path = '/api/items') => {
      const res = await fetch(`http://127.0.0.1:${port}${path}`, {
        headers: { 'X-Forwarded-For': ip },
      });
      return res.status;
    });
  } finally {
    server.close();
  }
}

test('two client IPs behind the proxy get separate buckets', async () => {
  await withApp(2, async (get) => {
    assert.equal(await get('203.0.113.1'), 200);
    assert.equal(await get('203.0.113.1'), 200);
    assert.equal(await get('203.0.113.1'), 429);
    assert.equal(await get('203.0.113.2'), 200);
  });
});

test('a client cannot pick its bucket: only the address nginx appended counts', async () => {
  await withApp(1, async (get) => {
    assert.equal(await get('198.51.100.9, 203.0.113.1'), 200);
    assert.equal(await get('198.51.100.10, 203.0.113.1'), 429);
  });
});

test('the health check is not counted', async () => {
  await withApp(1, async (get) => {
    assert.equal(await get('203.0.113.1', '/api/health'), 200);
    assert.equal(await get('203.0.113.1', '/api/health'), 200);
    assert.equal(await get('203.0.113.1'), 200);
    assert.equal(await get('203.0.113.1'), 429);
  });
});
