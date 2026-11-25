# #309 Add the reminder section to Settings (Web Push)

- Issue: [#309](https://github.com/sirloinbh/plan-routine/issues/309) (part of #249)
- Branch: `feat/309-reminder-settings`
- Date: 2026-11-26 (Asia/Seoul)

## Purpose

The evening reminder (#249) needs a screen: turn it on or off, choose the time, and let each device subscribe to push notifications. The backend is #308; the shared service worker's `push` handler is #310.

## Changes

- `frontend/src/reminder-section.tsx`: the "Evening reminder" card on the Settings page.
  - Reads and saves the whole setting (`GET`/`PUT /api/push/settings`): a switch and a time in Korea time, saved with a button. A time that is empty or not `HH:MM` is not sent.
  - "This device": "Turn on notifications" asks for permission, subscribes with the server's public key (`GET /api/push/public-key`) and sends the subscription (`PUT /api/push/subscription`); "Turn off notifications" removes it on the server first, then in the browser (`DELETE`). It shows how many devices receive reminders.
  - States: the server has no VAPID keys (`pushEnabled` false): a plain message and no controls; permission blocked: how to allow it again; no push in this browser: a message (on an iPhone the app must be on the home screen); the app's service worker is not running (development): a message.
- `frontend/src/app.tsx`: the card sits between the project links and the data download; the page description mentions it.
- `frontend/src/reminder-section.test.tsx`: eleven tests with a fake server that follows the #308 contract.

## Not in this card

- The `push` and `notificationclick` handlers (`frontend/public/sw.js` is a managed file): #310, in the central repo. Until it ships, a subscription is stored but no notification is shown.

## Verification

See the PR.
