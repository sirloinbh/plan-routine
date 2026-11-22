# #155 Restrict dailyRoutineOn SQL fragments to known inputs

Issue: https://github.com/sirloinbh/plan-routine/issues/155

## Purpose

`dailyRoutineOn` splices its arguments into SQL. Every caller passes a literal today, but the `string` signature did not enforce it.

## Changes

- `backend/src/day-records.ts`: `routine` is typed `'routines'` and `day` is `'$1::date' | 'days.date'` (exported as `RoutineAlias`, `DayExpression`). The function also checks both against the same allow lists and throws for anything else, so a value widened to `string` still cannot reach the SQL. The three existing callers compile unchanged.
- `backend/test/day-records.test.ts` (new): known inputs build the fragment; an unlisted alias or expression throws; a `@ts-expect-error` line proves `npm run typecheck` fails if a caller passes an arbitrary string (the test file is typechecked).

## Verification

`npm run check` passed locally (backend 166 pass). DB integration tests run in CI only (no local `plan_test`).

## Limits

A new alias or day expression must be added to the allow lists in the same change.
