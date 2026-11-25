import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import {
  type PushTarget,
  reminderPayload,
  runReminder,
  serviceTime,
  vapidFromEnv,
} from '../src/reminder.js';

test('the VAPID keys count only when all three are set', () => {
  assert.equal(vapidFromEnv({}), undefined);
  assert.equal(vapidFromEnv({ VAPID_PUBLIC_KEY: 'a', VAPID_PRIVATE_KEY: 'b' }), undefined);
  assert.equal(
    vapidFromEnv({ VAPID_PUBLIC_KEY: 'a', VAPID_PRIVATE_KEY: ' ', VAPID_SUBJECT: 'mailto:x@y.z' }),
    undefined,
  );
  assert.deepEqual(
    vapidFromEnv({
      VAPID_PUBLIC_KEY: ' a ',
      VAPID_PRIVATE_KEY: 'b',
      VAPID_SUBJECT: 'mailto:x@y.z',
    }),
    { publicKey: 'a', privateKey: 'b', subject: 'mailto:x@y.z' },
  );
});

test('the notification names up to five routines and counts the rest', () => {
  assert.deepEqual(JSON.parse(reminderPayload(['Read'])), {
    title: '1 routine left today',
    body: 'Read',
    url: '/today',
  });
  const many = JSON.parse(reminderPayload(['a', 'b', 'c', 'd', 'e', 'f', 'g']));
  assert.equal(many.title, '7 routines left today');
  assert.equal(many.body, 'a, b, c, d, e and 2 more');
});

test('the time of day is read in Asia/Seoul, not the server zone', () => {
  assert.equal(serviceTime(new Date('2026-11-26T12:00:00Z')), '21:00');
  assert.equal(serviceTime(new Date('2026-11-26T15:30:00Z')), '00:30');
});

// A pool that answers by the SQL it sees.
function fakePool(options: {
  on?: boolean;
  time?: string;
  claim?: boolean;
  names?: string[];
  devices?: string[];
}) {
  const statements: { sql: string; params: unknown[] }[] = [];
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      statements.push({ sql, params });
      if (sql.includes('FROM app_settings'))
        return {
          rows: [
            { key: 'reminder_on', value: String(options.on ?? true) },
            { key: 'reminder_time', value: options.time ?? '21:00' },
          ],
        };
      if (sql.includes('INSERT INTO app_settings'))
        return { rows: options.claim === false ? [] : [{ value: params[1] }] };
      if (sql.includes('FROM routines'))
        return { rows: (options.names ?? ['Read']).map((name) => ({ name })) };
      if (sql.includes('FROM push_subscriptions'))
        return {
          rows: (options.devices ?? ['https://push.example/a']).map((endpoint) => ({
            endpoint,
            p256dh: 'p',
            auth: 'a',
          })),
        };
      return { rows: [] };
    },
  } as unknown as Pool;
  return { pool, statements };
}

const evening = new Date('2026-11-26T12:05:00Z'); // 21:05 in Seoul

test('nothing happens while the reminder is off or before its time', async () => {
  const sent: PushTarget[] = [];
  const send = async (target: PushTarget) => void sent.push(target);
  assert.deepEqual(await runReminder(fakePool({ on: false }).pool, send, evening), {
    status: 'off',
  });
  const early = fakePool({ time: '21:30' });
  assert.deepEqual(await runReminder(early.pool, send, evening), { status: 'early' });
  assert.ok(!early.statements.some((s) => s.sql.includes('INSERT INTO app_settings')));
  assert.equal(sent.length, 0);
});

test('a day already handled is not sent again', async () => {
  const { pool, statements } = fakePool({ claim: false });
  const result = await runReminder(pool, async () => assert.fail('no send'), evening);
  assert.deepEqual(result, { status: 'already-handled' });
  // The claim binds the Seoul date, so a server in another zone cannot claim the wrong day.
  assert.deepEqual(statements.find((s) => s.sql.includes('INSERT INTO app_settings'))?.params, [
    'reminder_last_sent',
    '2026-11-26',
  ]);
});

test('no push when every due routine is checked or skipped, or no device is subscribed', async () => {
  const send = async () => assert.fail('no send');
  assert.deepEqual(await runReminder(fakePool({ names: [] }).pool, send, evening), {
    status: 'nothing-to-remind',
  });
  assert.deepEqual(await runReminder(fakePool({ devices: [] }).pool, send, evening), {
    status: 'no-devices',
  });
});

test('a push goes to every device; gone ones are removed and other failures are counted without the endpoint in the log', async () => {
  const { pool, statements } = fakePool({
    devices: [
      'https://push.example/ok',
      'https://push.example/gone',
      'https://push.example/broken',
    ],
  });
  const logs: string[] = [];
  const payloads: string[] = [];
  const send = async (target: PushTarget, payload: string) => {
    if (target.endpoint.endsWith('/gone'))
      throw Object.assign(new Error('gone'), { statusCode: 410 });
    if (target.endpoint.endsWith('/broken'))
      throw Object.assign(new Error(`failed for ${target.endpoint}`), { statusCode: 500 });
    payloads.push(payload);
  };
  const result = await runReminder(pool, send, evening, (line) => logs.push(line));
  assert.deepEqual(result, { status: 'sent', sent: 1, removed: 1, failed: 1 });
  assert.equal(JSON.parse(payloads[0]).body, 'Read');
  const removal = statements.find((s) => s.sql.startsWith('DELETE FROM push_subscriptions'));
  assert.deepEqual(removal?.params, [['https://push.example/gone']]);
  assert.deepEqual(logs, ['reminder: a push failed (status 500)']);
});
