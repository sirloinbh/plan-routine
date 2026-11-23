# Search the reasons of skipped routines (#258)

## Purpose

A skip reason ("Knee hurts", "travelling") is a note about a day, like a diary note, but `/api/search` only looked at diary entries. #243 added `routine_skips`, so the search now finds those reasons too. User decision (2026-11-23): one result per source for a day with both a diary hit and a skip hit; the missed/done routine filter stays as in #250.

## Changes

| File                                          | Change                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/src/search-routes.ts`                | The query is a `UNION ALL` of diary entries and skips (daily routines, with a reason), ordered and counted together, so paging and the total cover both. The text, dates and routine are bound once and shared. Every result has a `kind` (`diary` or `skip`); a skip result has `routineId`, `routineName` and its reason as `snippet` |
| `docs/openapi.json`, `backend/src/openapi.ts` | Summary mentions skip reasons                                                                                                                                                                                                                                                                                                           |
| `frontend/src/search.tsx`                     | A skip result reads "Skipped <routine>: <reason>", links to its day and has no "whole entry" panel (the Records link shows the day); the heading counts "results"                                                                                                                                                                       |
| tests                                         | `backend/test/search.test.ts`, `backend/test/db-search.integration.test.ts` (real SQL, CI), `frontend/src/search.test.tsx`                                                                                                                                                                                                              |

## Rules

- With a routine filter, skip results are that routine's. They are left out for `result=done`, since a skipped day is not a done day; with the default `result=missed` (or no routine) they are included.
- Only daily routines and only skips that have a reason are searched (their period start is the day).
- Not changed: the diary `missed` filter still lists a skipped day's diary entry as "not done" (it only checks that there is no check). Whether a skipped day should count as missed there is a separate question, see the PR.

## Verification

- `npm test -w backend`: 210 passed (DB integration tests skipped: no local `plan_test` DB; CI runs them, including the new skip cases)
- `npm test -w frontend -- search app.test`: 27 passed
- `npm run check`: see the PR
