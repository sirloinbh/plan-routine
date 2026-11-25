# 308 Evening reminder over Web Push: backend

Part of #249 (Web Push chosen 2026-11-24, packages approved 2026-11-26). The Settings screen is #309 and the service worker handlers are #310.

## What it does

- `web-push` 4.0.0 and `@types/web-push` 3.6.4 are added to the backend workspace (installed with `--ignore-scripts`, exact versions).
- Migration `013_push_subscriptions.sql`: `push_subscriptions` (endpoint, p256dh, auth). The setting itself lives in `app_settings`: `reminder_on`, `reminder_time` (HH:MM, Asia/Seoul) and `reminder_last_sent` (the day last handled). Defaults: off, 21:00.
- API under `/api/push` (behind the shared sign-in): `GET /public-key`, `GET` and `PUT /settings`, `PUT` and `DELETE /subscription`. The contract is in the first comment of #308 and #309; `docs/openapi.json` is regenerated.
- `backend/src/reminder.ts`: the unchecked routines of today (daily, due that day, not checked, not skipped, the same "due" rule as Records), the payload `{ title, body, url: "/today" }`, `runReminder` and an in-process scheduler (a tick every minute, started by `server.ts`).
- `.env.example`: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, each tagged `@secret @ssm=/sirloinbh/plan-routine/vapid-...`.

## Rules worth knowing

- **Off without keys.** All three VAPID values must be set. Otherwise the scheduler does not start, `GET /api/push/public-key` says `enabled: false`, `PUT /api/push/subscription` answers 409, and everything else works as before. Invalid keys are logged once at start and treated the same way. The setting (on/off, time) can still be saved, so it is kept for when the keys arrive.
- **Once a day.** From the reminder time on, the first tick claims the day in `reminder_last_sent` with one atomic upsert, so two ticks or two servers cannot both send. A server that was down at 21:00 still sends when it starts later that day. Turning the reminder on after the time has passed sends it at once, that day, once.
- **Nothing to say, nothing sent.** No push when every due routine is checked or skipped, or when no device is subscribed (the day is still marked handled).
- **Failures.** A device the push service reports gone (404 or 410) is deleted. Any other failure is logged by status only (the endpoint is a capability URL) and not retried that day. The push has a 6-hour TTL.
- **Limits.** At most 20 subscribed devices; an endpoint must be `https://`.
- The compose passthrough of the three variables is plan-lane-3's file (`compose.yaml`); without it the container has no keys and the feature stays off.

## Verification

- `npm run check` with `TEST_DATABASE_URL` pointing at the local `plan_test` database (see the PR for the result).
- Tests: `reminder.test.ts` and `push-routes.test.ts` (fake pool), `db-push.integration.test.ts` (real SQL: due, checked, skipped, weekday and future routines; once-a-day claim; gone device removal; one row per device, limit, setting).
- A real push to a browser was not sent: that needs real VAPID keys (a user step) and the frontend card.
