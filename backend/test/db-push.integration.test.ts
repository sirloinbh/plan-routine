import assert from 'node:assert/strict';
import { test } from 'node:test';

import { type PushTarget, runReminder, uncheckedToday } from '../src/reminder.js';
import { url, withClient } from './db-helpers.js';
import { withApi } from './helpers.js';

const day = '2026-11-26'; // a Thursday
const evening = new Date('2026-11-26T12:05:00Z'); // 21:05 in Seoul
const vapid = {
  publicKey: 'public-key',
  privateKey: 'private-key',
  subject: 'mailto:me@example.com',
};
const settingKeys = ['reminder_on', 'reminder_time', 'reminder_last_sent'];

test(
  "the reminder lists today's due daily routines that are neither checked nor skipped, and sends once a day",
  { skip: !url, timeout: 30_000 },
  () =>
    withClient(async (client, pool) => {
      const names = [
        'Push open',
        'Push checked',
        'Push skipped',
        'Push weekday off',
        'Push future',
      ];
      const ids: Record<string, number> = {};
      const insert = async (name: string, weekdays: number[] | null, createdAt: string) => {
        const { rows } = await client.query<{ id: number }>(
          `INSERT INTO routines (name, cadence, category, weekdays, created_at)
           VALUES ($1, 'daily', 'care', $2::smallint[], $3) RETURNING id`,
          [name, weekdays, createdAt],
        );
        ids[name] = rows[0].id;
      };
      try {
        await insert('Push open', null, '2026-01-01T00:00:00Z');
        await insert('Push checked', null, '2026-01-01T00:00:00Z');
        await insert('Push skipped', null, '2026-01-01T00:00:00Z');
        // Thursday is weekday 4: this one is only due on Mondays.
        await insert('Push weekday off', [1], '2026-01-01T00:00:00Z');
        await insert('Push future', null, '2026-12-01T00:00:00Z');
        await client.query(
          `INSERT INTO routine_checks (routine_id, period_start) VALUES ($1, $2)`,
          [ids['Push checked'], day],
        );
        await client.query(`INSERT INTO routine_skips (routine_id, period_start) VALUES ($1, $2)`, [
          ids['Push skipped'],
          day,
        ]);

        const unchecked = (await uncheckedToday(pool, day)).filter((name) => names.includes(name));
        assert.deepEqual(unchecked, ['Push open']);

        await client.query('DELETE FROM push_subscriptions');
        await client.query(`DELETE FROM app_settings WHERE key = ANY($1::text[])`, [settingKeys]);
        const sent: { target: PushTarget; payload: string }[] = [];
        const send = async (target: PushTarget, payload: string) => {
          if (target.endpoint.endsWith('/gone'))
            throw Object.assign(new Error('gone'), { statusCode: 404 });
          sent.push({ target, payload });
        };

        assert.deepEqual(await runReminder(pool, send, evening), { status: 'off' });
        await client.query(
          `INSERT INTO app_settings (key, value) VALUES ('reminder_on', 'true'), ('reminder_time', '21:00')`,
        );
        // Before the time (20:59 in Seoul) nothing is claimed.
        assert.deepEqual(await runReminder(pool, send, new Date('2026-11-26T11:59:00Z')), {
          status: 'early',
        });
        // #322: turned on after the time with no device yet. Nothing is sent and the day stays open.
        assert.deepEqual(await runReminder(pool, send, evening), { status: 'no-devices' });
        const mark = await client.query(
          `SELECT 1 FROM app_settings WHERE key = 'reminder_last_sent'`,
        );
        assert.equal(mark.rowCount, 0);
        // The devices subscribe a few minutes later; the next tick sends that evening.
        await client.query(
          `INSERT INTO push_subscriptions (endpoint, p256dh, auth)
           VALUES ('https://push.example/ok', 'p', 'a'), ('https://push.example/gone', 'p', 'a')`,
        );
        const result = await runReminder(pool, send, new Date('2026-11-26T12:10:00Z'));
        assert.deepEqual(result, { status: 'sent', sent: 1, removed: 1, failed: 0 });
        assert.equal(sent[0].target.endpoint, 'https://push.example/ok');
        const payload = JSON.parse(sent[0].payload);
        assert.equal(payload.url, '/today');
        assert.match(payload.body, /Push open/);
        assert.doesNotMatch(payload.body, /Push (checked|skipped|weekday off|future)/);
        // The gone device was removed, and the same day is not handled twice.
        const left = await client.query('SELECT endpoint FROM push_subscriptions');
        assert.deepEqual(left.rows, [{ endpoint: 'https://push.example/ok' }]);
        assert.deepEqual(await runReminder(pool, send, evening), { status: 'already-handled' });
        // The next day it is handled again.
        const next = await runReminder(pool, send, new Date('2026-11-27T12:05:00Z'));
        assert.equal(next.status, 'sent');
      } finally {
        await client.query('DELETE FROM push_subscriptions');
        await client.query(`DELETE FROM app_settings WHERE key = ANY($1::text[])`, [settingKeys]);
        await client.query('DELETE FROM routine_skips WHERE routine_id = ANY($1::bigint[])', [
          Object.values(ids),
        ]);
        await client.query('DELETE FROM routine_checks WHERE routine_id = ANY($1::bigint[])', [
          Object.values(ids),
        ]);
        await client.query('DELETE FROM routines WHERE id = ANY($1::bigint[])', [
          Object.values(ids),
        ]);
      }
    }),
);

test(
  'the push endpoints keep one row per device, a limit of 20, and the setting',
  { skip: !url, timeout: 30_000 },
  () =>
    withClient(async (client, pool) => {
      const subscription = (n: number, p256dh = 'key-one') => ({
        endpoint: `https://push.example/device-${n}`,
        keys: { p256dh, auth: 'auth-one' },
      });
      try {
        await client.query('DELETE FROM push_subscriptions');
        await client.query(`DELETE FROM app_settings WHERE key = ANY($1::text[])`, [settingKeys]);
        await withApi(
          pool,
          async (call) => {
            const put = (path: string, body: unknown) => call(path, { method: 'PUT', body });
            assert.deepEqual((await call('/api/push/settings')).data, {
              pushEnabled: true,
              reminderOn: false,
              reminderTime: '21:00',
              subscriptionCount: 0,
            });
            assert.deepEqual(
              (await put('/api/push/settings', { reminderOn: true, reminderTime: '22:15' })).data,
              { pushEnabled: true, reminderOn: true, reminderTime: '22:15', subscriptionCount: 0 },
            );
            // Repeating it changes nothing.
            assert.equal(
              (await put('/api/push/settings', { reminderOn: true, reminderTime: '22:15' })).status,
              200,
            );

            for (let n = 1; n <= 20; n += 1)
              assert.equal((await put('/api/push/subscription', subscription(n))).status, 200);
            const full = await put('/api/push/subscription', subscription(21));
            assert.equal(full.status, 400);
            // A known device still refreshes its keys when the limit is reached.
            const again = await put('/api/push/subscription', subscription(3, 'key-two'));
            assert.deepEqual(again.data, { subscribed: true, subscriptionCount: 20 });
            const stored = await client.query(
              `SELECT p256dh FROM push_subscriptions WHERE endpoint = 'https://push.example/device-3'`,
            );
            assert.equal(stored.rows[0].p256dh, 'key-two');

            const removed = await call('/api/push/subscription', {
              method: 'DELETE',
              body: { endpoint: subscription(3).endpoint },
            });
            assert.deepEqual(removed.data, { subscribed: false, subscriptionCount: 19 });
            const repeat = await call('/api/push/subscription', {
              method: 'DELETE',
              body: { endpoint: subscription(3).endpoint },
            });
            assert.deepEqual(repeat.data, { subscribed: false, subscriptionCount: 19 });
          },
          { vapid },
        );

        // #323: the test button sends to every device at once, drops gone ones, and leaves the daily state alone.
        await client.query('DELETE FROM push_subscriptions');
        await client.query(
          `INSERT INTO push_subscriptions (endpoint, p256dh, auth)
           VALUES ('https://push.example/ok', 'p', 'a'), ('https://push.example/gone', 'p', 'a')`,
        );
        const sent: { target: PushTarget; payload: string }[] = [];
        const sendPush = async (target: PushTarget, payload: string) => {
          if (target.endpoint.endsWith('/gone'))
            throw Object.assign(new Error('gone'), { statusCode: 410 });
          sent.push({ target, payload });
        };
        await withApi(
          pool,
          async (call) => {
            const { status, data } = await call('/api/push/test', { method: 'POST' });
            assert.equal(status, 200);
            assert.deepEqual(data, { sent: 1, removed: 1, failed: 0 });
          },
          { vapid, sendPush },
        );
        assert.equal(sent.length, 1);
        assert.equal(JSON.parse(sent[0].payload).title, 'Test notification');
        const left = await client.query('SELECT endpoint FROM push_subscriptions');
        assert.deepEqual(left.rows, [{ endpoint: 'https://push.example/ok' }]);
        const mark = await client.query(
          `SELECT 1 FROM app_settings WHERE key = 'reminder_last_sent'`,
        );
        assert.equal(mark.rowCount, 0);
      } finally {
        await client.query('DELETE FROM push_subscriptions');
        await client.query(`DELETE FROM app_settings WHERE key = ANY($1::text[])`, [settingKeys]);
      }
    }),
);
