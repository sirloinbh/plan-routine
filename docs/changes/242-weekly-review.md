# Add a weekly review page (#242)

## Purpose

Daily checks and diary entries piled up with no weekly moment to turn them into a change. The new `/review` page shows one week's completion rate, the most-missed routines, and two notes ("what went well", "what to change next week"). User decision (2026-11-23): daily and weekly routines count, the 3 most-missed are listed, and the path is `/review` because `/weekly` is the weekly routines page.

## Changes

| File                                                                | Change                                                                                                                                                                                   |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `database/migrations/008_weekly_reviews.sql`                        | New table `weekly_reviews` keyed by the week's Sunday (checked by `EXTRACT(DOW ...) = 0`); two notes of at most 1000 characters                                                          |
| `backend/src/weekly-review.ts`                                      | `buildWeeklyReview`: rate and most-missed list, using `periodStatus` from `routine-stats.ts` so the numbers match the stats page                                                         |
| `backend/src/weekly-review-routes.ts`                               | `GET /api/weekly-review?week=` (week holding the date, this week by default; no future weeks) and `PUT /api/weekly-review/:week` (Sunday only, no future weeks, blank note becomes null) |
| `backend/src/app.ts`, `backend/src/openapi.ts`, `docs/openapi.json` | Route registration and operation table (append-only)                                                                                                                                     |
| `frontend/src/weekly-review.tsx`, `frontend/src/app.tsx`            | The page with previous and next week buttons and the notes form; menu entry "Weekly review" at `/review`                                                                                 |
| tests                                                               | `backend/test/weekly-review.test.ts`, `backend/test/db-weekly-review.integration.test.ts`, `frontend/src/weekly-review.test.tsx`, `frontend/src/app.test.tsx`                            |

## Notes

- `skipped` (#243) is not handled yet: after #243 lands, merge origin/main and make `buildWeeklyReview` follow `periodStatus` for it (the stats page rules decide).
- The 3 most-missed ties are broken by more records, then by the routines' own order.

## Verification

- `npm test -w backend`: passed (DB integration tests skipped: no local `plan_test` DB; CI runs them)
- `npm test -w frontend -- weekly-review app.test`: 21 passed
- `npm run check`: see the PR
