# #42 DB test for concurrent archive and check requests

- Issue: [#42](https://github.com/sirloinbh/plan-routine/issues/42)
- Branch: `test/42-archive-check-race`
- Date: 2026-11-01 (Asia/Seoul)

## Purpose

`backend/src/check-routes.ts` locks the routine row with `FOR SHARE`, so a check does not attach to a routine being archived. Until now this was confirmed only by code review. Confirm it with a real DB test.

## Changes

Added a test to `backend/test/db.integration.test.ts`. The app code was not changed.

1. Run the archive in a transaction and do not commit it.
2. Send the check request.
3. Confirm with `pg_blocking_pids` that the request is waiting for that lock. This is so it does not rely on timing.
4. After committing the archive, confirm the check request is a 404 and that no check was saved.

## Verification

- Local (`TEST_DATABASE_URL` removed): `npm run format:check`, `npm run lint`, `npm run typecheck`, and `npm run build` passed. `npm run test -w backend` was 70 pass / 0 fail / 15 skip out of 85 (DB tests, including the new test). `npm run test:skills` was 4 pass. The frontend did not change, so it was not run. Docker is off on this PC, and the `TEST_DATABASE_URL` in the shell points to another project's DB, so the DB tests were not run locally.
- CI: on the real DB in CI, all 85 backend tests passed with skip 0. The new test finished in about 0.12 seconds (run 41273067041).
- Failure confirmed with the lock removed: when I removed `FOR SHARE` on a temporary branch, the new test failed with "The check request did not wait for the uncommitted archive" (run 41273074659). In the same run, 3 other tests that compare SQL strings also failed. This branch was not merged and was deleted from the remote.

## Limits and follow-up

None.

## Automated code review

- First: there was no defect to fix in the test code. 1 low finding was applied: the verification record lacked the commands run and the counts.
- Second: no defect blocking the merge. Confirmed the record matches the CI result. 1 low finding, to write the actual commands, was applied. The review ends at 2 rounds.
