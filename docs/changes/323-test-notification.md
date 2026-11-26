# 323 Test notification button in the reminder settings

Part of #249 (Web Push). After the user turned the reminder on on 2026-11-26 and nothing arrived, there was no way to tell which step failed without waiting for the next evening.

## What changed

- `POST /api/push/test` (behind the shared sign-in): sends one fixed test notification to every subscribed device now and answers `{ sent, removed, failed }`. It answers 409 while the server has no VAPID keys ("Push reminders are not set up on the server") or no device is subscribed ("No device has notifications turned on"). It does not touch the daily reminder state (`reminder_last_sent`).
- `backend/src/reminder.ts`: the device loop of `runReminder` moved into `sendToDevices` (used by both), with `subscribedDevices` and `testPayload`. Behavior of the evening reminder is unchanged: gone devices (404/410) are deleted, other failures are logged by status only.
- `createApp` takes `sendPush`; `server.ts` passes the sender it already builds for the scheduler.
- Settings, reminder card: "Send a test notification" next to "Turn off notifications", shown only while this device is subscribed. It reports "Test notification sent. It should appear in a few seconds", or, when nothing was delivered, tells the user to turn notifications off and on again on this device. Both device states share one layout, so the toggle button stays one element and keeps keyboard focus (#288 rule).
- The test notification opens `/settings` when tapped.
- `docs/openapi.json` regenerated.

## Verification

- Backend: `push-routes.test.ts` (409 without keys, 409 without devices), `db-push.integration.test.ts` on the local `plan_test` (sends to every device, removes the gone one, leaves `reminder_last_sent` unset).
- Frontend: `reminder-section.test.tsx` (sends and shows the status; nothing delivered → alert; no test button on an unsubscribed device; focus test still passes).
- Browser check on Vite 5207 with a mocked `/api` and a stubbed push subscription: 390x844 and 1440x900, button wraps on the phone width, no horizontal overflow, no console errors, focus stays on the pressed button.
- A real push to a phone needs the deployed app; the user can now press the button.
