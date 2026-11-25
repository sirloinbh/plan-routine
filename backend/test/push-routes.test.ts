import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { withApi } from './helpers.js';

const vapid = {
  publicKey: 'public-key',
  privateKey: 'private-key',
  subject: 'mailto:me@example.com',
};
const subscription = {
  endpoint: 'https://push.example/abc',
  keys: { p256dh: 'BPublic_key-1', auth: 'auth_key-2' },
  expirationTime: null,
};

function fakePool(count = 0, insertedRows = 1) {
  const statements: { sql: string; params: unknown[] }[] = [];
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      statements.push({ sql, params });
      if (sql.includes('count(*)::int')) return { rows: [{ n: count }] };
      if (sql.includes('FROM app_settings')) return { rows: [] };
      return {
        rows: [],
        rowCount: sql.includes('INSERT INTO push_subscriptions') ? insertedRows : 0,
      };
    },
  } as unknown as Pool;
  return { pool, statements };
}

const put = (body: unknown) => ({ method: 'PUT', body });

test('the public key says disabled without keys and gives the key with them', async () => {
  await withApi(fakePool().pool, async (call) => {
    const { status, data } = await call('/api/push/public-key');
    assert.equal(status, 200);
    assert.deepEqual(data, { enabled: false, publicKey: null });
  });
  await withApi(
    fakePool().pool,
    async (call) => {
      assert.deepEqual((await call('/api/push/public-key')).data, {
        enabled: true,
        publicKey: 'public-key',
      });
    },
    { vapid },
  );
});

test('settings default to off at 21:00 and report whether push is set up', async () => {
  await withApi(fakePool(2).pool, async (call) => {
    assert.deepEqual((await call('/api/push/settings')).data, {
      pushEnabled: false,
      reminderOn: false,
      reminderTime: '21:00',
      subscriptionCount: 2,
    });
  });
});

test('PUT settings validates the time and the switch', async () => {
  const { pool, statements } = fakePool();
  await withApi(pool, async (call) => {
    assert.equal(
      (await call('/api/push/settings', put({ reminderOn: true, reminderTime: '21:30' }))).status,
      200,
    );
    assert.deepEqual(statements.find((s) => s.sql.includes('INSERT INTO app_settings'))?.params, [
      'reminder_on',
      'true',
      'reminder_time',
      '21:30',
    ]);
    for (const time of ['24:00', '9:30', '21:60', '', 2130, null]) {
      const { status, data } = await call(
        '/api/push/settings',
        put({ reminderOn: true, reminderTime: time }),
      );
      assert.equal(status, 400, String(time));
      assert.match(String(data.error), /reminder time/i);
    }
    const bad = await call('/api/push/settings', put({ reminderOn: 'yes', reminderTime: '21:00' }));
    assert.equal(bad.status, 400);
    assert.equal(bad.data.error, 'Reminders must be on or off');
    assert.equal((await call('/api/push/settings', put([]))).status, 400);
  });
});

test('subscribing needs the keys on the server and a valid subscription', async () => {
  await withApi(fakePool().pool, async (call) => {
    const refused = await call('/api/push/subscription', put(subscription));
    assert.equal(refused.status, 409);
    assert.equal(refused.data.error, 'Push reminders are not set up on the server');
  });
  const { pool, statements } = fakePool(1);
  await withApi(
    pool,
    async (call) => {
      const ok = await call('/api/push/subscription', put(subscription));
      assert.equal(ok.status, 200);
      assert.deepEqual(ok.data, { subscribed: true, subscriptionCount: 1 });
      assert.deepEqual(
        statements.find((s) => s.sql.includes('INSERT INTO push_subscriptions'))?.params,
        [subscription.endpoint, 'BPublic_key-1', 'auth_key-2', 20],
      );
      const bodies: unknown[] = [
        { ...subscription, endpoint: 'http://push.example/abc' },
        { ...subscription, endpoint: 'not a url' },
        { ...subscription, endpoint: `https://push.example/${'a'.repeat(2100)}` },
        { endpoint: subscription.endpoint },
        { ...subscription, keys: { p256dh: 'x y', auth: 'a' } },
        { ...subscription, keys: { p256dh: 'x' } },
        [],
      ];
      for (const body of bodies)
        assert.equal((await call('/api/push/subscription', put(body))).status, 400);
    },
    { vapid },
  );
});

test('a new device past the limit is refused', async () => {
  await withApi(
    fakePool(20, 0).pool,
    async (call) => {
      const { status, data } = await call('/api/push/subscription', put(subscription));
      assert.equal(status, 400);
      assert.equal(data.error, 'At most 20 devices can be subscribed');
    },
    { vapid },
  );
});

test('unsubscribing removes the endpoint and repeating it is fine', async () => {
  const { pool, statements } = fakePool(0);
  await withApi(pool, async (call) => {
    const { status, data } = await call('/api/push/subscription', {
      method: 'DELETE',
      body: { endpoint: subscription.endpoint },
    });
    assert.equal(status, 200);
    assert.deepEqual(data, { subscribed: false, subscriptionCount: 0 });
    assert.deepEqual(
      statements.find((s) => s.sql.startsWith('DELETE FROM push_subscriptions'))?.params,
      [subscription.endpoint],
    );
    assert.equal(
      (await call('/api/push/subscription', { method: 'DELETE', body: {} })).status,
      400,
    );
  });
});
