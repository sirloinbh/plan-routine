# Show a skipped routine as skipped on the diary page (closes #263)

## Purpose

`GET /api/diary` returned only `checked`, so a routine skipped on purpose (#243) appeared in "Checks for this day" as "Not done", while the records page and the stats page tell skipped from missed. The progress count already leaves skipped routines out (#260).

## Changes

| File                            | Change                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------- |
| `backend/src/diary-routes.ts`   | Each routine also carries `skipReason` (the progress change of #260 is the base) |
| `frontend/src/diary-checks.tsx` | A skipped routine shows "–", "Skipped" and its reason, as on the records page    |
| tests                           | Fake-pool test for the new column, diary page test, DB test (CI only)            |

## Verification

- `npm run check`; the DB test is skipped locally (no `plan_test`) and runs in CI.
- Browser check at 390x844 and 1440x900 (see the PR).
