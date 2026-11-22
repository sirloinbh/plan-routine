# Move the checklist screens onto the shared query layer (refs #178)

## Purpose

Third group of #178 (ADR-0027): `useChecklist` (daily checklist, weekly and 4-week routine pages, 4-week due list) loads through `useApiQuery` instead of its own effect, counters, `ignore` flag and visibility listener.

## Changes

| File                                                       | Change                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/use-checklist.ts`                            | Loads with `useApiQuery` (key: path, cadence, date). A save shows its box as saved over whatever a load says (`pending`), so a load that read the server before the save committed cannot undo the box. A load that overlapped a save is loaded again once the saves end. The screen keeps the previous day while the next one loads or fails |
| `frontend/src/use-date-change.ts`                          | `useReloadWhenCurrent(query, path)` now watches the query cache: it notes the device's date when a load of the screen starts, and decides on the next check from the load's end (passing failure, server on another date). This also works when a fast load starts and ends before React renders                                              |
| `frontend/src/stats.tsx`, `records.tsx`, `twelve-week.tsx` | Call the hook with the new arguments (twelve-week is lane-4's file: one-line change after #229)                                                                                                                                                                                                                                               |
| tests                                                      | `daily-checklist`, `period-routines` and `four-week-due` tests use the shared `render` and wait for the query layer's ticks                                                                                                                                                                                                                   |

## Verification

- `npm test -w frontend`: 454 passed, 3 skipped (run twice).
- `npm run check`: see the PR.
