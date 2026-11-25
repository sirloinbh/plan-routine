-- Web Push subscriptions of the devices that get the evening reminder (issue #308). Safe to re-run.
-- endpoint is the push service URL the browser gave; p256dh and auth are its encryption keys (base64url).
-- The reminder setting (on/off, time) and the day it was last sent live in app_settings
-- (reminder_on, reminder_time, reminder_last_sent), so no table is needed for them.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint text PRIMARY KEY CHECK (char_length(endpoint) BETWEEN 1 AND 2048),
  p256dh text NOT NULL CHECK (char_length(p256dh) BETWEEN 1 AND 512),
  auth text NOT NULL CHECK (char_length(auth) BETWEEN 1 AND 512),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
