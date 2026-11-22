# Split the backend integration test file per feature (#158)

Issue: https://github.com/sirloinbh/plan-routine/issues/158

## Purpose

`backend/test/db.integration.test.ts` had about 1,600 lines and 20 tests in one place. It is now one file per feature, with the shared setup in a helper.

## Changes

- `backend/test/db-helpers.ts` (not a test file): `url`, `migrate` and `withClient`.
- Tests moved without changing their bodies:

| File                                   | Tests                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| `db-baseline.integration.test.ts`      | 2 (baseline schema and health, migration runner)                                |
| `db-routines.integration.test.ts`      | 6 (routines migration, first-use date x3, daily routine edits, same-order rows) |
| `db-checks.integration.test.ts`        | 4 (checks, archive wait, weekly, four-week)                                     |
| `db-diary.integration.test.ts`         | 2                                                                               |
| `db-goals.integration.test.ts`         | 3 (goals migration, goal periods and reviews, goal links)                       |
| `db-records.integration.test.ts`       | 1                                                                               |
| `db-stats.integration.test.ts`         | 1                                                                               |
| `db-project-links.integration.test.ts` | 1                                                                               |

- #154 (PR #216) added a re-save check inside the goals review test while this branch was open; it is carried into `db-goals.integration.test.ts`.
- `backend/package.json`: `npm test` now passes `--test-concurrency=1`. The files all use the same test database and some change shared rows (`app_settings`, routines), so running them as parallel processes could make them step on each other. Unit tests are fast, so this costs little.

## Verification

- 20 top-level tests before (`grep -c "^test("`) and 20 after (4+2+3+2+1+1+6+1).
- `npm test -w backend`: 172 pass, 0 fail, 22 skipped. The integration tests are skipped locally (no `plan_test` DB); CI runs them, so the real-DB result is checked there.
