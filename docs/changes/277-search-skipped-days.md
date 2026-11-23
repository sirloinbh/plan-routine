# Show skipped days as skipped in the search routine filter (#277)

## Purpose

The routine filter decided "missed" on its own (no check on a past day the routine was created for), so it listed skipped days as missed (#250, #264) and ignored the weekday schedules of #245. User decision (2026-11-23): use the rule Records and Stats use.

## Changes

| File                           | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/src/search-routes.ts` | One `missed_days` set per request, built from `dailyRoutineOn('routines', 'days.date')` (created by then, scheduled on that weekday, not archived on or before it) minus the days with a check or a skip, from the later of the start date and the creation day to the earlier of the end date and yesterday. The diary results of a routine are the entries on those days, and the text-less "missed" rows are those days without a diary entry. With a routine and no text, every skip is listed as a "Skipped" result, with its reason if it has one; a text search still reaches only skips whose reason matches |
| `frontend/src/search.tsx`      | A skip without a reason reads "Skipped <routine>" with no trailing colon                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| tests                          | `backend/test/search.test.ts`, `backend/test/db-search.integration.test.ts` (real SQL, CI: skipped day, skip without a reason, weekday routine, diary on a missed day), `frontend/src/search.test.tsx`                                                                                                                                                                                                                                                                                                                                                                                                               |

## Rules

- A skipped day is listed once, as "Skipped". It is not a missed day, and its diary entry is not listed as a missed day (the entry is still found by text).
- A day the routine is not scheduled on (weekdays of #245) is not missed. N-per-week routines are weekly routines, so the daily filter does not cover them.
- `dailyRoutineOn` is only read, not changed.

## Verification

- `npm test -w backend`: 228 passed (DB integration tests skipped: no local `plan_test` DB; CI runs them, including the new cases)
- `npm test -w frontend -- search app.test`: 29 passed
- `npm run check`: see the PR
