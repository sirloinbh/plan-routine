# 322 Send the evening reminder when it is turned on after the reminder time

Fixes a gap in #308 (part of #249). Found on 2026-11-26: the user turned the reminder on after 21:00 and no notification came.

## Cause

`runReminder` claimed the day in `reminder_last_sent` first and only then looked for unchecked routines and subscribed devices. On the Settings screen, saving the switch ("Save reminder") and subscribing the device ("Turn on notifications") are two steps. After the reminder time, a scheduler tick between the two steps found no device, but the day was already claimed, so the device subscribed a minute later got nothing until the next day.

## What changed

- `backend/src/reminder.ts`: a tick first reads the day mark and stops when today is already handled. Then it looks for unchecked routines and subscribed devices, and claims the day (the same atomic upsert as before) only when it is about to send. With nothing unchecked or no device, the day stays open and a later tick that evening can still send.
- Once a day still holds: the claim is still a conditional upsert that only one caller gets back, so two ticks or two servers cannot both send.
- A side effect worth knowing: when every routine is checked at 21:00 and one is unchecked again later that evening, the reminder now goes out then. A day without devices costs two small queries a minute after the reminder time, as the setting read already did.

## Verification

- `backend/test/reminder.test.ts`: an already-handled day stops before any routine query; yesterday's mark does not block today; "nothing to remind" and "no devices" leave no claim; a tick that loses the claim does not send.
- `backend/test/db-push.integration.test.ts` (real SQL on the local `plan_test`): reminder on after the time with no device → `no-devices` and no mark; devices subscribe, the next tick sends once; the same day is then `already-handled`.
- Results of `npm run check` are in the PR.
