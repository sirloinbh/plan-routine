# #246 Record amounts on checks and show totals

- Issue: [#246](https://github.com/sirloinbh/plan-routine/issues/246)
- Branch: `feat/246-check-amounts`
- Date: 2026-11-23 (Asia/Seoul)

## Purpose

A check was only done or not done. A routine can now record an amount with a unit ("20 pages", "60 minutes"), and the stats page totals it per week and per four-week period.

Decision (user, 2026-11-23): any check counts as done; the target amount is only shown.

## Changes

- `database/migrations/012_check_amounts.sql`: `routines.unit`, `routines.target_amount`, `routine_checks.amount` (double precision), with check constraints (unit 1–20 characters, a target needs a unit and is above 0, an amount is 0 or more). Existing rows stay NULL.
- `backend/src/routines.ts`, `routine-routes.ts`: adding a routine takes an optional `unit` and `targetAmount` (English validation). Set when the routine is added, like the schedule of #245.
- `backend/src/check-routes.ts`: `PUT /api/routines/:id/checks/:date` takes an optional `amount`: left out keeps the stored amount, `null` clears it, a routine without a unit answers 400. The checklist items carry `unit`, `targetAmount` and the day's `amount`. Removing the check removes its amount.
- `backend/src/record-routes.ts`: a day's routines carry `unit` and `amount`.
- `backend/src/routine-stats.ts`, `stats-routes.ts`: items with a unit carry `amountTotals` for the last 8 weeks and 6 four-week periods (the target is shown only, never used for done).
- Frontend: the add form takes a unit and a target; the checklist shows the target and an amount box for a checked routine with a unit; the records page shows the amount; the stats page lists the totals.

## Tests

`backend/test/routine-routes.test.ts`, `skip-routes.test.ts`, `routine-stats.test.ts`; `backend/test/db-amounts.integration.test.ts` (needs a DB); `frontend/src/amount-checklist.test.tsx`, `records.test.tsx`, `stats.test.tsx`, `routines.test.tsx`, `routine-schedule.test.ts`.

## Verification

See the PR. The DB integration tests are skipped locally (no `plan_test` DB) and run in CI.

## Limits and follow-up

- A unit and target are set when the routine is added and cannot be edited later (archive and add again).
- The amount of an N-per-week routine is stored per day, and the weekly total adds the days up.
