# Show the day's checks and mood scores on the diary page (closes #247)

## Purpose

Writing the diary without seeing the day's checks loses context, and there was no score to compare mood with practice. Decisions (user, 2026-11-23): scores are 1 to 5; mood and energy are compared as weekly averages next to completion rates, with no correlation number.

## Changes

| File                                                    | Change                                                                                                                                                                                                                                              |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `database/migrations/009_diary_scores.sql`              | Nullable `mood` and `energy` columns on `diary_entries`, with `CHECK (... BETWEEN 1 AND 5)`; safe to re-run                                                                                                                                         |
| `backend/src/diary-routes.ts`                           | `mood` and `energy` are validated (whole number 1 to 5, or none), saved and returned; `GET /api/diary` adds `routines` (the day's daily routines with `checked`, same rule as the records page via `dailyRoutineOn`); `progress` is derived from it |
| `backend/src/mood-stats-routes.ts`                      | New `GET /api/mood-stats`: last 12 weeks (Sunday to Saturday), average mood and energy, and the weeks' daily routine checked/total                                                                                                                  |
| `backend/src/app.ts`, `openapi.ts`, `docs/openapi.json` | Route registered and documented                                                                                                                                                                                                                     |
| `frontend/src/diary-scores.tsx`, `diary-checks.tsx`     | Radio-button score fields with a Clear button; read-only list of the day's checks (mark and word)                                                                                                                                                   |
| `frontend/src/diary.tsx`, `diary-draft.ts`              | Scores are part of the form, the unsaved-change check and the local draft (an older stored draft without scores reads as none)                                                                                                                      |
| `frontend/src/mood-stats.tsx`                           | Weekly table under the stats page content; mounted in `app.tsx` next to `<Stats />` so `stats.tsx` (plan-lane-1) is untouched                                                                                                                       |
| tests                                                   | Backend route and mood-stats tests, DB migration test (runs in CI), diary, draft and mood-stats frontend tests                                                                                                                                      |

## Verification

- Browser check at 390x844 and 1440x900 on Vite (port 5217, mocked `/api`): no horizontal scroll on the diary and stats pages; scores, checks and weekly table render.
- No local `plan_test` database: the DB integration tests are skipped locally and run in CI.
