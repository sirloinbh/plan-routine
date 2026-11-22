# Fix broken English in routine list and stats labels (#168)

## Purpose

Add forms read "Add a Exercise routine" and "New Wake-up routine name", the confirmation for weekly and 4-week routines read "to 4-week", and the stats month rows showed the raw `2026-10`.

## Changes

| File                                               | Change                                                                                                                                       |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/routine-groups.ts`                   | Each category carries a full `addLabel` phrase, such as "Add an exercise routine"                                                            |
| `frontend/src/routine-list.tsx`                    | `RoutineAddForm` takes `addLabel` and `addedTo` instead of splicing a label into sentences; the name field reads "New exercise routine name" |
| `frontend/src/routines.tsx`, `period-routines.tsx` | Pass the new props; period confirmations read "to the 4-week list"                                                                           |
| `frontend/src/use-routine-list.ts`                 | `add` takes `addedTo`                                                                                                                        |
| `frontend/src/stats.tsx`, `format-date.ts`         | Month rows use `formatDate(..., 'month')`, for example "October 2026"                                                                        |
| `frontend/src/*.test.tsx`                          | Updated names; new assertions for "Add an exercise routine" and "October 2026"                                                               |

## Verification

- `npm test -w frontend -- routines stats period`: 61 passed.
- `npm run check`: see the PR.
