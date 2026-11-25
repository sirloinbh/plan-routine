import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import {
  readReminderSetting,
  reminderTimePattern,
  type VapidConfig,
  writeReminderSetting,
} from './reminder.js';
import { badRequest, requestBody } from './request-input.js';
import { HttpError } from './standard/http.js';

export const notSetUp = 'Push reminders are not set up on the server';
const maxSubscriptions = 20;
const tooMany = `At most ${maxSubscriptions} devices can be subscribed`;

export const settingsInput = z.object(
  {
    reminderOn: z.boolean({ error: 'Reminders must be on or off' }),
    reminderTime: z
      .string({ error: 'The reminder time must be text like 21:00' })
      .regex(reminderTimePattern, 'The reminder time must be from 00:00 to 23:59, like 21:00'),
  },
  badRequest,
);

const endpoint = z
  .string({ error: 'The subscription endpoint must be text' })
  .max(2048, 'The subscription endpoint must be 2048 characters or fewer')
  .refine((value) => {
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'The subscription endpoint must be an https:// URL');
const key = (label: string) =>
  z
    .string({ error: `${label} must be text` })
    .regex(/^[A-Za-z0-9_-]{1,512}$/, `${label} must be a base64url key`);

// The browser's PushSubscription.toJSON(); other fields (expirationTime) are ignored.
export const subscriptionInput = z.object(
  {
    endpoint,
    keys: z.object(
      { p256dh: key('The p256dh key'), auth: key('The auth key') },
      { error: 'The subscription needs keys' },
    ),
  },
  badRequest,
);
export const unsubscribeInput = z.object({ endpoint }, badRequest);

export function pushRoutes(pool: Pool, vapid: VapidConfig | undefined) {
  const router = Router();

  const settings = async () => {
    const [setting, count] = await Promise.all([
      readReminderSetting(pool),
      pool.query<{ n: number }>('SELECT count(*)::int AS n FROM push_subscriptions'),
    ]);
    return {
      pushEnabled: vapid !== undefined,
      ...setting,
      subscriptionCount: count.rows[0].n,
    };
  };
  const count = async () =>
    (await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM push_subscriptions')).rows[0]
      .n;

  router.get('/public-key', (_req, res) => {
    res.json({ enabled: vapid !== undefined, publicKey: vapid?.publicKey ?? null });
  });

  router.get('/settings', async (_req, res) => {
    res.json(await settings());
  });

  // The whole setting at once, so repeating a request changes nothing. Allowed while push is not set up: it is only a
  // preference, kept for when the keys arrive.
  router.put('/settings', async (req, res) => {
    const input = settingsInput.parse(requestBody(req.body));
    await writeReminderSetting(pool, input);
    res.json(await settings());
  });

  router.put('/subscription', async (req, res) => {
    const input = subscriptionInput.parse(requestBody(req.body));
    if (!vapid) throw new HttpError(409, notSetUp);
    // One statement: a new endpoint is added only below the limit, a known one always refreshes its keys.
    const { rowCount } = await pool.query(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth)
       SELECT $1, $2, $3
       WHERE EXISTS (SELECT 1 FROM push_subscriptions WHERE endpoint = $1)
          OR (SELECT count(*) FROM push_subscriptions) < $4
       ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, updated_at = now()`,
      [input.endpoint, input.keys.p256dh, input.keys.auth, maxSubscriptions],
    );
    if (rowCount === 0) throw new HttpError(400, tooMany);
    res.json({ subscribed: true, subscriptionCount: await count() });
  });

  router.delete('/subscription', async (req, res) => {
    const { endpoint: target } = unsubscribeInput.parse(requestBody(req.body));
    await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [target]);
    res.json({ subscribed: false, subscriptionCount: await count() });
  });

  return router;
}
