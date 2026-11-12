# #60 Sort by number when the order values are equal

- Issue: [#60](https://github.com/sirloinbh/plan-routine/issues/60)
- Branch: `fix/60-routine-order`
- Date: 2026-11-01 (Asia/Seoul)

## Purpose

The query selected `id::text AS id` and then sorted with `ORDER BY ..., id`, so PostgreSQL compared the numbers as text. `10` came before `9`.

## Changes

Sort by the real number by naming the table. Besides the 2 places written in the issue, 4 more places with the same cause were also fixed.

| Location                        | Query                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| `backend/src/routine-routes.ts` | The routine list, the basis of reordering when moving, and the response after moving |
| `backend/src/check-routes.ts`   | The checklist                                                                        |
| `backend/src/goal-routes.ts`    | The goal list, and the response of saving a retrospective                            |

Queries that sort without selecting `id::text` (`SELECT id ... ORDER BY id`) already sort by number, so they were left as they were.

## Tests

`backend/test/db.integration.test.ts`: inserts 11 items with the same order value with numbers 999995 to 1000005, and checks the order of the routine list, the checklist, and the goal list and the result of moving.

## Verification

- Local: `env -u TEST_DATABASE_URL npm run check` passed. Backend 88 pass / 0 fail / 17 skip (DB tests) out of 105, frontend 250 pass / 0 fail / 2 skip (dark-mode-only shared tests) out of 252, and `test:skills` 4 pass.
- Real DB in CI, code before the fix: only the new test failed (run 41301115200, 104 pass and 1 fail out of 105). I checked with a temporary branch and deleted it from the remote.
- Real DB in CI, code after the fix: all 105 pass, skip 0 (run 41301171843).

## Limits and follow-up

None.

## Automated code review

- First: there was no defect to fix. I checked the real DB results and all the sorting locations. The second review is not done, following the procedure.
- Note: the sorting of the response after moving and the response of saving a retrospective are not verified directly by the new test. It is a one-line fix of the same pattern, and the response after moving is after renumbering, so no ties occur.
