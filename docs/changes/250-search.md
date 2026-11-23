# Search diary entries (#250)

## Purpose

Finding a past diary note, or the days a routine was missed, meant opening dates one by one. The new `/search` page searches the diary and filters by date range and routine. User decision (2026-11-23): plain `ILIKE` first; `pg_trgm` only if it is slow (that would be a DB extension, so ask the coordinator first).

## Changes

| File                                                                | Change                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `backend/src/search-routes.ts`, `backend/src/search.ts`             | `GET /api/search?q&from&to&routineId&result&limit&offset`: entries newest first with a total; `ILIKE` over the body and the three notes with `%`, `_` and `\` escaped; limit 1 to 50 (default 20); a word or a routine is required; no new table |
| `backend/src/app.ts`, `backend/src/openapi.ts`, `docs/openapi.json` | Registration and operation table (append-only)                                                                                                                                                                                                   |
| `frontend/src/search.tsx`, `frontend/src/app.tsx`                   | The page: form, results with the matching snippet, paging, and a "Show the whole entry" panel that loads `/api/records/:date`; menu entry "Search"                                                                                               |
| tests                                                               | `backend/test/search.test.ts`, `backend/test/db-search.integration.test.ts`, `frontend/src/search.test.tsx`, `frontend/src/app.test.tsx`                                                                                                         |

## Decisions and limits

- **Routine filter** (my reading of "filter by routine", recommended default): `routineId` with `result=missed` (default) keeps entries of past days on which that daily routine was due and not checked (same due rule as the records page: created by then, not archived on or before it); `result=done` keeps the days it was checked. Results are diary entries, so a missed day without a diary entry is not listed.
- **Links to the day:** `/records` does not read a date from the address yet (a plan-lane-1 file), so each result expands in place to the whole entry instead of linking. Follow-up: let Records open `?date=YYYY-MM-DD`, then link to it.
- **Skip reasons** are not searched: #243 had not merged when this started. Add them after #243 lands.
- No index: one user, a few thousand entries at most.

## Verification

- `npm test -w backend`: passed (DB integration tests skipped: no local `plan_test` DB; CI runs them, including the new SQL test)
- `npm test -w frontend -- search app.test`: 24 passed
- `npm run check`: see the PR
