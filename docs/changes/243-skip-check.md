# #243 Mark a check as skipped with a reason

- Issue: [#243](https://github.com/sirloinbh/plan-routine/issues/243)
- Branch: `feat/243-skip-check`
- Date: 2026-11-23 (Asia/Seoul)

## Purpose

A day off for illness or travel looked the same as forgetting. A routine period can now be skipped on purpose, with an optional reason, and skipped periods are left out of completion rates.

Decisions (user, 2026-11-23): a skip is allowed for today and the 7 days before it (the same window as checks); the reason is at most 200 characters.

## Changes

- `database/migrations/008_routine_skips.sql`: table `routine_skips (routine_id, period_start, reason, skipped_at)`, one row per routine and period, reason 1–200 characters or NULL.
- `backend/src/check-routes.ts`: `PUT/DELETE /api/routines/:id/skips/:date` (PUT again replaces the reason; blank reason is stored as none). The checklist items carry `skipped` and `skipReason`. Checking a skipped period and skipping a checked period answer 409. Check and skip now lock the routine row with `FOR UPDATE` (was `FOR SHARE`) so the two cannot race.
- `backend/src/routine-stats.ts`, `stats-routes.ts`: new `skipped` period status; it counts as neither done nor missed, in every tally and per item.
- `backend/src/day-records.ts`, `record-routes.ts`: a skipped routine belongs to its day; the day record lists `skipped` and `skipReason`; skipped routines are left out of the day's total and the calendar's totals.
- `backend/src/openapi.ts`, `docs/openapi.json`: the new routes, and 409 on checking.
- Frontend: skip control (optional reason, 200 character limit, cancel) and "Remove skip" in the shared checklist (daily, weekly, 4-week, 12-week, 4-week-due); skipped items are left out of the progress; the records page shows "Skipped" and the reason; the stats page has a "Skipped" mark and legend entry.

## Tests

- `backend/test/skip-routes.test.ts` (new), `routine-stats.test.ts`, `check-routes.test.ts` (lock wording).
- `backend/test/db-skips.integration.test.ts` (new, needs a DB).
- `frontend/src/skip-checklist.test.tsx` (new), `records.test.tsx`; `period-routines.test.tsx` now reads the label instead of the row's first text.

## Verification

See the PR for the actual `npm run check` result. DB integration tests are skipped locally (no `plan_test` DB) and run in CI.

## Limits and follow-up

- The diary page's routine progress (`diary-routes.ts`, plan-lane-3's file) still counts a skipped routine as not done; reported to the coordinator.
