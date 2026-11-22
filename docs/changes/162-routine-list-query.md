# Move the routine list onto the shared query layer and load projects once (refs #178, closes #162)

## Purpose

`useRoutineList` (daily routines page, weekly, 4-week and 12-week routine lists) loaded through its own effects and the legacy `frontend/src/api.ts`. This moves it onto `useApiQuery` and fixes the three problems of #162.

## Changes

| File                                                   | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `frontend/src/use-routine-list.ts`                     | Routines and project links are queries. After every change the routine, project-link and checklist queries are invalidated, so the checklist of the page loads again without a version counter. The project links share one query key, so lists on a page load them once, and a failed load shows "Could not load the projects a routine can link to." instead of looking like "no projects". Saving a rename closes the form only if it still edits that routine (#162) |
| `frontend/src/api.ts`                                  | Deleted. Its only importer now uses `lib/api` (`RequestError`)                                                                                                                                                                                                                                                                                                                                                                                                           |
| `frontend/src/use-checklist.ts`, `period-routines.tsx` | `reloadKey` and `list.version` are gone                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `frontend/src/use-date-change.ts`                      | `useReloadWhenShown`, the one page-shown listener, shared by the screens                                                                                                                                                                                                                                                                                                                                                                                                 |
| tests                                                  | `routines.test.tsx` (shared `render`, longer waits, failed project list), `twelve-week.test.tsx` (one project-links request on mount)                                                                                                                                                                                                                                                                                                                                    |

The rename-form fix is a guard for a race the screen currently prevents by disabling the other edit buttons while a save runs, so it has no UI test.

## Verification

- `npm test -w frontend`: passed.
- `npm run check`: see the PR.
