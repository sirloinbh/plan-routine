# 295 Checks CSV: amounts and skipped periods

## Problem

`GET /api/export/checks.csv` listed only date, routine, cadence, category and checked_at. Amounts on checks (#246) and skipped periods with their reason (#243) were in the JSON export only, and the docs did not say so.

## Change

- `backend/src/export-routes.ts`: the CSV is the union of checks (`status` done) and skips (`status` skipped), with new trailing columns `status`, `amount`, `unit`, `skip_reason`. The first five columns keep their order, so an existing spreadsheet still reads. The amount is empty while the routine has no unit (hidden, not deleted, as decided on #276). A skip has an empty `checked_at`.
- `docs/data-export.md` describes the columns.
- Tests: the route test checks the new output with a skip row and a formula-looking text; a DB test (runs in CI) checks the real SQL. `backend/test/helpers.ts` now also returns the response text, so a CSV can be read.
- No change to the Settings screen or the API shape of any JSON route.

## Verification

- `npm run check` (see the PR). No local `plan_test` database: the DB test ran only in CI.
