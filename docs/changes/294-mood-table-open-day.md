# 294 Mood table: today counts only routines already done

## Problem

`GET /api/mood-stats` counted every daily routine due today as expected, so the current week's rate was lower than on the Stats page, which treats a day still running as open (counted only once done).

## Change

- `backend/src/mood-stats-routes.ts`: a day counts toward `total` when it is before today, or when the routine has a check that day. Skipped days were already left out (#262).
- Tests: a route test for the SQL and a DB test (runs in CI) for a week that includes today.

## Verification

- `npm run check` (see the PR). There is no local `plan_test` database, so the DB integration test ran only in CI.
