# #3 Routine cadence and period calculation rules, and the DB schema

- Issue: https://github.com/sirloinbh/plan-routine/issues/3
- Date: 2026-10-22 (Asia/Seoul)

## Purpose

Build the shared structure to store daily, weekly, 4-week, and 12-week routines and their check records, and the period calculation rule for each cadence. The later cards (#4 to #11) work on top of it.

## Confirmed rules (confirmed by the user, recorded in the #3 comment)

- The week is **Sunday to Saturday**.
- The 4-week and 12-week cycles are counted from the **app's first-use day**. The first-use day is saved once into `app_settings.routine_anchor_date`, as the service date, when `GET /api/periods` is first called.
- So that 4-week and 12-week periods are made of whole weeks, the anchor was set to the **Sunday of the week that contains the first-use day** (an implementation judgment, recorded as an issue comment). Dates before the anchor are computed as earlier periods.
- Deleting a routine is archiving with `archived_at`, and a routine that has check records cannot be deleted from the DB (`ON DELETE RESTRICT`).

## Changes

- `database/migrations/002_routines.sql`: `routines` (name of 1 to 100 characters, 4 cadences, 7 categories required only for daily routines, sort order, archive time) and `routine_checks` (the routine and the period start date are the primary key, which prevents duplicates). All use `IF NOT EXISTS`, so they are safe to run again.
- `backend/src/periods.ts`: the cadence list, date validation (`calendarDate`, with user-facing messages), `weekStart`, `periodFor`, and `periodsFor`. Date calculation is in UTC days, so it does not depend on the host time zone.
- `backend/src/routines.ts`: the category codes and names, the Zod schema for routine input (with user-facing errors), and saving and reading the first-use day, `routineAnchorDate` (one `ON CONFLICT DO UPDATE` query returns the same value even for concurrent first calls).
- `backend/src/app.ts`: `GET /api/periods?date=YYYY-MM-DD` returns the date (default today), the first-use day, and the current period of each cadence. An invalid date gives a 400 with a user-facing message.

## Tests

- `backend/test/periods.test.ts` (unit): week boundaries (Sunday and Saturday), month end, year end, and leap day, the 4-week 28-day repetition, the 12-week 84-day cycle and the year boundary, dates before the anchor, and rejecting dates that do not exist. While writing, I found a defect where `2026-13-01` threw an exception, and fixed `isCalendarDate`.
- `backend/test/routines.test.ts` (API and validation): using the saved first-use day and the default of today, query with a given date, 400 for an invalid date and a duplicated `date` parameter, and the normal routine input and 6 error messages.
- `backend/test/db.integration.test.ts` (DB): re-running 002, the category, name, and cadence CHECKs, rejecting a duplicate check in the same period (23505), rejecting deletion of a routine that has checks (23503), saving the first-use day once (rolled back), and 4 concurrent first calls converging to the same date (original value restored).

## Verification

- Local `npm run check` → **exit 0**. Of 24 app tests, **20 pass / 0 fail / 4 skip** (after the first review follow-up), and the skill check 4 pass.
- The 4 skips are DB integration tests. There is no local PostgreSQL or Docker, so `TEST_DATABASE_URL` could not be set. GitHub Actions `verify` runs them against a real DB after applying the migrations (the result is recorded in the PR).
- No screen change.

## Limits and follow-up

- The routine CRUD API and screen are built in #4, and the check API and the checklist screen in #5.
- The first-use day is currently saved only when `GET /api/periods` is called. Also call `routineAnchorDate` in #4 routine creation and #5 check saving, so it is not saved later than the real first-use day.

## Automated code review

- First: 3 follow-ups applied. (Medium) The `DO NOTHING` + `SELECT` CTE could return an empty result and cause a 500 on concurrent first calls under READ COMMITTED, so it was replaced with `ON CONFLICT DO UPDATE ... RETURNING` and a concurrent-call DB test was added. (Low) Recorded when the first-use day is saved in the limits and follow-up. (Low) Added a test for 400 on a duplicated `date` parameter.
- Second: no blocking defect. Confirmed the 3 follow-ups from the first review were applied. The optional finding (the no-op `DO UPDATE` rewrites the row version and takes a lock on every call) was not applied because it has no effect at the scale of a single-user service. The review ends at 2 rounds.

## Fixing the CI hang

- Symptom: `npm run check` in the CI `verify` did not finish for more than 15 minutes (every head since the first commit). It did not reproduce locally because the DB tests were skipped.
- Cause (presumed): the new DB test registered `pool.end()` with `t.after` before `client.release()`. `pool.end()` waits for the borrowed clients to be returned, so depending on the run order it waits forever.
- Fix: the `withClient` helper now guarantees `pool.end()` after `release()` with `finally`, and the restoring of the original value in the concurrent-call test was also moved to `finally`. A 30-second `timeout` was put on all 4 DB tests, including the existing default schema test, so that if it hangs again it shows up as a failure. The 6 stuck CI runs were cancelled.
- This was a CI failure fix after the 2 review rounds, so no third review was done. The result is confirmed by the CI on the final head.
