# #154 Save twelve-week reviews with one UPDATE statement

Issue: https://github.com/sirloinbh/plan-routine/issues/154

## Purpose

`PUT /api/goals/reviews` ran one `UPDATE` per review (up to 1000 round trips) inside a transaction holding `FOR UPDATE` locks, and re-saving an unchanged review moved `reviewed_at` to `now()`.

## Changes

- `backend/src/goal-routes.ts` (the review-save loop only, as LANES.md allows): the loop is one `UPDATE twelve_week_goals ... FROM unnest($1::bigint[], $2::boolean[], $3::text[])`. The `WHERE` also requires that `achieved` or `review_note` differs, so an unchanged review is not touched at all (`reviewed_at` and `updated_at` stay). Clearing both answers still resets `reviewed_at` to NULL.
- `backend/test/goal-routes.test.ts`: the review test now expects one statement with the three arrays and the `IS DISTINCT FROM` guard.
- `backend/test/db.integration.test.ts` (append inside the existing review test): saving the same answers again keeps `reviewed_at` and `updated_at`; a changed note moves `reviewed_at`. Runs in CI.

## Verification

`npm run check` passed locally (backend 172 pass). The DB integration test for the unchanged re-save runs in CI only (no local `plan_test`), so the SQL itself is verified there.

## Limits

An unchanged review no longer bumps the goal's `updated_at` either; nothing reads it for reviews.
