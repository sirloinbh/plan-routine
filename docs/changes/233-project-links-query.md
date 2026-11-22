# Load project links through the shared query layer (#233)

## Purpose

`ProjectLinks` still had its own `requestJson` load effect, request-order guard and version counter, a leftover from #178. The routine lists (`use-routine-list.ts`) already load `/api/project-links` with `useApiQuery`.

## Changes

| File                                  | Change                                                                                                                                                                                                                                                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/project-links.tsx`      | The list loads with `useApiQuery` under `apiKey('/api/project-links')`, the key the routine lists use; add and delete go through `useApiMutation` and invalidate that key, so the routine lists' copy refreshes too; a failed change reloads the list; the load notice and retry come from the query state |
| `frontend/src/project-links.test.tsx` | Query-aware `render` helper and two-tick flush; new test that an add and a delete refresh a second copy held under the shared key                                                                                                                                                                          |

## Verification

- `npm test -w frontend -- project-links`: 13 passed
- `npm run check`
