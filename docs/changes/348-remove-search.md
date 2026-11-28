# Remove the Search page and its API (#348)

## Purpose

The owner no longer wants the Search feature (epic #340, simplify the screens). The page, its menu item and `GET /api/search` are removed.

## Changes

| File                                                                        | Change                                                                                                                                                        |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/search.tsx`, `frontend/src/search.test.tsx`                   | Deleted                                                                                                                                                       |
| `frontend/src/app.tsx`, `frontend/src/app.test.tsx`                         | Removed the `search` page, the "Search" menu item, its route, the `/api/search` mock and the "opens the search page" test; the menu list no longer has Search |
| `backend/src/search.ts`, `backend/src/search-routes.ts`                     | Deleted                                                                                                                                                       |
| `backend/src/app.ts`, `backend/src/openapi.ts`                              | Removed the `/api/search` mount and the `GET /api/search` entry                                                                                               |
| `backend/test/search.test.ts`, `backend/test/db-search.integration.test.ts` | Deleted                                                                                                                                                       |
| `docs/openapi.json`                                                         | Regenerated (no search path)                                                                                                                                  |
| `frontend/src/records.tsx`, `frontend/src/records.test.tsx`                 | Comments only: Records still reads `?date=`                                                                                                                   |

## Notes

- `/search` now falls through to the `*` route and redirects to Today. `GET /api/search` answers 404.
- No database table is dropped; search only read the diary, check and skip tables. README and `AGENTS.project.md` had no search wording.
- Past change records stay as history.
