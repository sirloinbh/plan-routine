# #245 Support weekday and N-times-per-week routines

- Issue: [#245](https://github.com/sirloinbh/plan-routine/issues/245)
- Branch: `feat/245-weekday-n-per-week`
- Date: 2026-11-23 (Asia/Seoul)

## Purpose

A routine can repeat on chosen weekdays ("run Mon/Wed/Fri") or a number of times per week ("read 3 times a week"), so rest days are not misses and no routine has to be faked as weekly.

Decisions (user, 2026-11-23): an N-per-week routine allows at most one check per day; weekday routines keep their daily category.

## Changes

- `database/migrations/011_routine_schedules.sql`: `routines.weekdays smallint[]` (daily only, 0 = Sunday ... 6 = Saturday) and `routines.times_per_week smallint` (weekly only, 2 to 7), each with a check constraint. Existing rows keep NULL, so they behave as before.
- `backend/src/routines.ts`, `routine-routes.ts`: `POST /api/routines` takes `weekdays` and `timesPerWeek` with English validation (right cadence, 0–6, at least one day, 2–7); weekdays are stored sorted, and all seven days mean none. Routine responses carry both fields. A schedule is set when the routine is added; to change it, archive and add again.
- `backend/src/periods.ts`: `weekdayOf`.
- `backend/src/check-routes.ts`: the daily checklist lists a weekday routine only on its days (or when that day already has a check or skip, so it can be undone). An N-per-week routine stores one check per day (`period_start` is the day) and reports `weekChecks` for its week; skipping covers the whole week and is refused while the week holds checks.
- `backend/src/routine-stats.ts` (`checkLookup`, `periodStatus`), `weekly-review.ts`, `weekly-review-routes.ts`, `stats-routes.ts`: an off day is `none` (not counted) unless checked; an N-per-week week is done at N checks, open while running, missed once over. Streaks, trends and the weekly review use the same rule.
- `backend/src/day-records.ts`: records, the diary and the mood table list a weekday routine only on its days.
- Frontend: the add form has weekday buttons (daily categories) and a times-per-week choice (weekly page); lists show the schedule; the checklist shows "2/3 this week" and an N-per-week routine counts as done at N.

## Tests

`backend/test/routine-routes.test.ts`, `skip-routes.test.ts`, `routine-stats.test.ts`, `day-records.test.ts`, `periods.test.ts`; `backend/test/db-schedules.integration.test.ts` (needs a DB); `frontend/src/routines.test.tsx`, `routine-schedule.test.ts`, `week-count-checklist.test.tsx`.

## Verification

See the PR. The DB integration tests are skipped locally (no `plan_test` DB) and run in CI.

## Limits and follow-up

- A schedule cannot be edited after the routine is added.
- A check on a day a weekday routine does not apply to still counts, and the routine shows on that day so it can be undone.
