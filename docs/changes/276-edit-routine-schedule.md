# #276 Edit a routine's schedule (part 2)

- Issue: [#276](https://github.com/sirloinbh/plan-routine/issues/276)
- Branch: `feat/276-edit-routine-schedule`
- Date: 2026-11-24 (Asia/Seoul)

## Purpose

#245 set a routine's weekdays or times per week only when the routine was added. Part 1 (#279) made the unit and target editable; this part makes the schedule editable.

Decisions (user, 2026-11-24, on #276):

- Q1 A: a schedule change applies to the whole history; past periods are re-evaluated, and the form says so.
- Q3 B: a weekly routine may switch between once a week and N times a week, converting its checks in one transaction with an audit entry and a notice in the form.

## Changes

- `backend/src/routine-routes.ts`: `PUT /api/routines/:id/schedule` with `{ weekdays, timesPerWeek }` (the whole schedule; null or left out means every day or once a week). Weekdays only for daily routines, times per week (2–7) only for weekly ones; same English messages as adding. A routine row lock (`FOR UPDATE`) covers the whole change, and an `audit_log` row (`routine_schedule`, before/after) is written in the same transaction.
- Check conversion (weekly routines):
  - Once a week → N times: a once-a-week check sits on the week's first day (Sunday), so it simply stays as a check on that day. Nothing moves; the "which day" detail is lost. Skips (one per week, on the week start) stay.
  - N times → once a week: each week's checks collapse into one check on the week's Sunday, with the earliest check time and the **sum of the week's amounts** (none stays none; a routine without a unit has no amounts). Skips stay: a skipped week has no checks, so nothing merges into it. A skip and checks never share a week, so no skip data is lost either way.
  - Moving between two values of N converts nothing.
- `backend/src/routines.ts`: the weekday and times-per-week rules are shared with adding a routine.
- `backend/src/openapi.ts`, `docs/openapi.json`: the new route.
- Frontend: a "Schedule" button on daily and weekly routines opens a form (weekday buttons, or the times-per-week select); a note says the change applies to the whole history, and, for weekly routines, that switching converts checks and loses the day.

## Tests

`backend/test/routine-schedule-edit.test.ts` (new), `backend/test/db-amounts.integration.test.ts` (needs a DB: real SQL for both conversion directions, amounts summed, skipped week kept, audit rows), `frontend/src/routines.test.tsx`.

## Verification

See the PR. The DB integration tests are skipped locally and run in CI.

## Limits and follow-up

- The conversion is not reversible: N → once → N does not bring back the days.
- The records page for a past week shows the converted checks under the new schedule.
