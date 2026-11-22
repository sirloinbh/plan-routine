# Fix wrong date-range messages in check and diary routes (#157)

Issue: https://github.com/sirloinbh/plan-routine/issues/157

## Purpose

The messages did not match the dates the API accepts: today plus the seven days before it (8 days) can be checked, and `2000-01-01` itself is allowed.

## Changes

| Route   | Before                                                          | After                                                |
| ------- | --------------------------------------------------------------- | ---------------------------------------------------- |
| Checks  | You can only check the last 7 days                              | You can only check today and the 7 days before it    |
| Diary   | Diary entries can only be written for dates after the year 2000 | Diary entries can only be written from 2000-01-01 on |
| Records | Records can only be viewed from the year 2000 on                | Records can only be viewed from 2000-01-01 on        |

Diary and records share the tail `fromEarliestDate` ("from 2000-01-01 on") from `backend/src/request-input.ts`.

## Verification

- Route tests assert the new texts: a check 8 days back (checklist GET, check PUT and DELETE), diary and records for `1999-12-31` and `1999-12`.
- `npm test -w backend`: all pass; DB integration tests are skipped locally (no `plan_test` DB).

## Limits and follow-up

- The frontend tests (`daily-checklist.test.tsx`, `diary.test.tsx`) and the help text in `app.tsx` ("up to the last 7 days") still carry the old wording. The tests only mock a server answer, and those files belong to lane-3 and lane-4, so they are left for the owners.
