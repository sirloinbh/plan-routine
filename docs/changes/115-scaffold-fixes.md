# #115 Apply the central scaffold fixes for migration lock release and pg_isready

- Issue: [#115](https://github.com/sirloinbh/plan-routine/issues/115)
- Branch: `fix/115-scaffold-fixes`
- Date: 2026-11-14 (Asia/Seoul)

## Purpose

The scaffold fixes in sirloinbh/project-standards#414 (PR #428) and #392 (PR #429) are not synced to existing apps. This applies them here (tracking issue: sirloinbh/project-standards#430).

## Changes

| File | Change |
|---|---|
| `backend/src/migrations.ts` | If applying a file fails, the advisory unlock failure is ignored and the original error is thrown. After a successful run, an unlock failure is still an error. The apply loop moved to `applyPending()` |
| `backend/test/migrations.test.ts` | Fake connection tests: a lost connection keeps the failing file and cause; unlock after success; unlock failure after success is reported |

A lost connection makes PostgreSQL release the session's advisory lock, so ignoring the unlock failure leaves no lock behind.

## Verification

- `tsx --test test/migrations.test.ts` in `backend`: 7 pass, 0 fail.
- `tsc -p tsconfig.check.json` (backend), ESLint (`--max-warnings 0`) and Prettier on the changed files: pass.
- Not run: the database integration tests (no Postgres here) and the full `npm run check`.

