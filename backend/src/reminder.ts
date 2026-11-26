// The evening reminder (#308): the setting, the routines to remind about, the daily send and the in-process scheduler.
import type { Pool } from 'pg';
import { sendNotification, setVapidDetails } from 'web-push';

import { dailyRoutineOn } from './day-records.js';
import { serviceDate, serviceTimeZone } from './standard/http.js';

export type VapidConfig = { publicKey: string; privateKey: string; subject: string };

/** All three values, or undefined: the feature is then off and nothing else changes. */
export function vapidFromEnv(env: Record<string, string | undefined> = process.env) {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return undefined;
  return { publicKey, privateKey, subject } satisfies VapidConfig;
}

export type PushTarget = { endpoint: string; keys: { p256dh: string; auth: string } };
/** Sends one payload. Rejects with `statusCode` 404 or 410 when the push service says the subscription is gone. */
export type SendPush = (target: PushTarget, payload: string) => Promise<void>;

/** The real sender. Throws at once for a malformed key or subject, so the server can log it and stay off. */
export function createSender(vapid: VapidConfig): SendPush {
  setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  // A reminder that arrives hours late is noise: let the push service drop it after 6 hours.
  return async (target, payload) => {
    await sendNotification(target, payload, { TTL: 6 * 60 * 60 });
  };
}

export const defaultReminderTime = '21:00';
export const reminderTimePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const onKey = 'reminder_on';
const timeKey = 'reminder_time';
const lastSentKey = 'reminder_last_sent';

export type ReminderSetting = { reminderOn: boolean; reminderTime: string };

export async function readReminderSetting(pool: Pick<Pool, 'query'>): Promise<ReminderSetting> {
  const { rows } = await pool.query<{ key: string; value: string }>(
    'SELECT key, value FROM app_settings WHERE key = ANY($1::text[])',
    [[onKey, timeKey]],
  );
  const value = (key: string) => rows.find((row) => row.key === key)?.value;
  const time = value(timeKey);
  return {
    reminderOn: value(onKey) === 'true',
    reminderTime: time && reminderTimePattern.test(time) ? time : defaultReminderTime,
  };
}

export async function writeReminderSetting(pool: Pick<Pool, 'query'>, setting: ReminderSetting) {
  await pool.query(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2), ($3, $4)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [onKey, String(setting.reminderOn), timeKey, setting.reminderTime],
  );
}

/** Today's daily routines that are due, not checked and not skipped (a skipped one is not "unchecked"), in list order. */
export async function uncheckedToday(pool: Pick<Pool, 'query'>, today: string) {
  const { rows } = await pool.query<{ name: string }>(
    `SELECT routines.name FROM routines
     WHERE ${dailyRoutineOn('routines', '$1::date')}
       AND NOT EXISTS (
         SELECT 1 FROM routine_checks
         WHERE routine_checks.routine_id = routines.id AND routine_checks.period_start = $1::date
       )
       AND NOT EXISTS (
         SELECT 1 FROM routine_skips
         WHERE routine_skips.routine_id = routines.id AND routine_skips.period_start = $1::date
       )
     ORDER BY routines.category, routines.sort_order, routines.id`,
    [today],
  );
  return rows.map((row) => row.name);
}

const listedNames = 5;

/** The notification the service worker shows (`{ title, body, url }`). */
export function reminderPayload(names: string[]) {
  const shown = names.slice(0, listedNames).join(', ');
  const more = names.length > listedNames ? ` and ${names.length - listedNames} more` : '';
  return JSON.stringify({
    title: `${names.length} routine${names.length === 1 ? '' : 's'} left today`,
    body: `${shown}${more}`,
    url: '/today',
  });
}

/** The time of day in the service time zone as HH:MM. */
export function serviceTime(now: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: serviceTimeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now);
}

export type ReminderResult =
  | { status: 'off' | 'early' | 'already-handled' | 'nothing-to-remind' | 'no-devices' }
  | { status: 'sent'; sent: number; removed: number; failed: number };

/**
 * One scheduler tick. Once the reminder time of a day has passed (also after a restart later that day), it sends that
 * day's reminder exactly once: the day is claimed right before sending, so two ticks or two servers cannot both send.
 * While every due routine is checked or skipped, or no device is subscribed, nothing is sent and the day stays open, so
 * a later tick that evening can still send (#322). A send that fails for a reason other than "gone" is logged and not
 * retried that day, so a broken push service cannot repeat a notification every minute.
 */
export async function runReminder(
  pool: Pool,
  send: SendPush,
  now = new Date(),
  log: (message: string) => void = console.error,
): Promise<ReminderResult> {
  const setting = await readReminderSetting(pool);
  if (!setting.reminderOn) return { status: 'off' };
  if (serviceTime(now) < setting.reminderTime) return { status: 'early' };
  const today = serviceDate(now);
  const { rows: handled } = await pool.query<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = $1',
    [lastSentKey],
  );
  if (handled[0]?.value === today) return { status: 'already-handled' };
  // #322: the day is claimed only when there is something to send to someone. A device subscribed or a routine left
  // open later that evening (the reminder was turned on after its time) still gets the reminder.
  const names = await uncheckedToday(pool, today);
  if (names.length === 0) return { status: 'nothing-to-remind' };
  const devices = await subscribedDevices(pool);
  if (devices.length === 0) return { status: 'no-devices' };
  // The row only changes when the day differs, so exactly one caller gets it back.
  const claimed = await pool.query(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
     WHERE app_settings.value <> EXCLUDED.value
     RETURNING value`,
    [lastSentKey, today],
  );
  if (!claimed.rows[0]) return { status: 'already-handled' };
  return {
    status: 'sent',
    ...(await sendToDevices(pool, send, devices, reminderPayload(names), log)),
  };
}

export type Device = { endpoint: string; p256dh: string; auth: string };

export async function subscribedDevices(pool: Pick<Pool, 'query'>) {
  const { rows } = await pool.query<Device>(
    'SELECT endpoint, p256dh, auth FROM push_subscriptions ORDER BY created_at',
  );
  return rows;
}

/**
 * Sends one payload to each device. A device the push service reports gone (404 or 410) is deleted; any other failure
 * is counted and logged by status only, because the push service's answer can echo the endpoint, a secret capability URL.
 */
export async function sendToDevices(
  pool: Pick<Pool, 'query'>,
  send: SendPush,
  devices: Device[],
  payload: string,
  log: (message: string) => void = console.error,
) {
  let sent = 0;
  let failed = 0;
  const gone: string[] = [];
  for (const device of devices) {
    try {
      await send(
        { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
        payload,
      );
      sent += 1;
    } catch (error) {
      const code = (error as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) gone.push(device.endpoint);
      else {
        failed += 1;
        log(`reminder: a push failed (status ${code ?? 'none'})`);
      }
    }
  }
  if (gone.length > 0)
    await pool.query('DELETE FROM push_subscriptions WHERE endpoint = ANY($1::text[])', [gone]);
  return { sent, removed: gone.length, failed };
}

/** The notification of the Settings test button (#323): it opens Settings again. */
export function testPayload() {
  return JSON.stringify({
    title: 'Test notification',
    body: 'Notifications work on this device. The evening reminder will look like this.',
    url: '/settings',
  });
}

/** Runs `runReminder` every minute (and once now); a tick still running or failing never stops the next one. */
export function startReminderScheduler(
  pool: Pool,
  send: SendPush,
  options: { intervalMs?: number; log?: (message: string) => void } = {},
) {
  const log = options.log ?? console.error;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runReminder(pool, send, new Date(), log);
    } catch (error) {
      log(`reminder: tick failed (${error instanceof Error ? error.message : 'unknown error'})`);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), options.intervalMs ?? 60_000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
