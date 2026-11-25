import { Pool } from 'pg';

import { createApp } from './app.js';
import { createSender, type SendPush, startReminderScheduler, vapidFromEnv } from './reminder.js';
import { closeOnSignals } from './shutdown.js';
import { listenHost, sharedAuth } from './standard/auth.js';
import { createPool } from './standard/db.js';

const port = Number(process.env.PORT ?? 3107);
const pool = createPool(new Pool({ connectionString: process.env.DATABASE_URL }));
// The sign-in is on in compose (AUTH_INTERNAL_URL), so the server listens on every interface behind the proxy; a local run
// without it listens on 127.0.0.1 only (#898).
const auth = sharedAuth();

// #308: Web Push needs all three VAPID values. Bad ones are logged and the API runs with the reminder off.
let vapid = vapidFromEnv();
let send: SendPush | undefined;
if (vapid) {
  try {
    send = createSender(vapid);
  } catch (error) {
    console.error(
      `Evening reminder is off: the VAPID settings are invalid (${error instanceof Error ? error.message : 'unknown error'})`,
    );
    vapid = undefined;
  }
}

const server = createApp(pool, {
  auth,
  toolsPublicKey: process.env.AI_TOOLS_PUBLIC_KEY,
  vapid,
}).listen(port, listenHost(auth !== undefined), () => console.log(`API http://localhost:${port}`));
closeOnSignals(server, pool);

// The evening reminder runs in this process.
if (send) {
  const stop = startReminderScheduler(pool, send);
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, stop);
}
