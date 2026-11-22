# #153 Read the routine anchor date without writing on every GET

Issue: https://github.com/sirloinbh/plan-routine/issues/153

## Purpose

`routineAnchorDate` ran an `INSERT ... ON CONFLICT DO UPDATE` on every call, so each `GET /api/periods`, `/api/checklist`, `/api/goals` and `/api/stats` locked and rewrote the single `app_settings` row. In `changeCheck` that lock was held until commit, and a 404 also wrote.

## Changes

- `backend/src/routines.ts`: `routineAnchorDate` first runs `SELECT value FROM app_settings WHERE key = $1` and returns the stored date. Only when no row exists does it run the existing no-op upsert (kept, so concurrent first calls still agree). The value read is checked against `YYYY-MM-DD` and the call throws if it is not.
- `backend/src/check-routes.ts` (single spot allowed by LANES.md): the call moved after the routine existence check, so a 404 no longer touches `app_settings`.
- Tests: `routines.test.ts` (a second call issues only SELECTs; the upsert runs only when no row exists; a non-date value is rejected), `check-routes.test.ts` (a 404 issues no `app_settings` query; the earlier assertions that expected today to be offered on every call now expect a read only), and `db.integration.test.ts` (`xmin` of the row is unchanged by a later call; runs in CI).

## Verification

`npm run check` passed locally (backend 170 pass). The DB integration tests, including the `xmin` check and the existing concurrent-first-call test, run in CI only (no local `plan_test`).

## Limits

The concurrent-first-call guarantee relies on the unchanged upsert and its existing integration test, which only CI runs.
