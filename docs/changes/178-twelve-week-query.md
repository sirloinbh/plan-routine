# Load the twelve-week screen through the shared query layer (refs #178)

## Purpose

`TwelveWeek` had its own load effect, request-order guard, visibility listener and date-change bookkeeping. The shared query layer (`lib/query.ts`) and `useReloadWhenCurrent` already do this, as the stats screen shows.

## Changes

| File                                | Change                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `frontend/src/twelve-week.tsx`      | The goals load is `useApiQuery` (always fresh on open) kept current by `useReloadWhenCurrent`; the load notice and retry come from the query state; saves (add, rename, remove, review) go through `useApiMutation`; the saved review and linked routines patch the cached list with `setQueryData`; the screen's own load effect, version counter, visibility listener and `requestedOn` ref are gone |
| `frontend/src/twelve-week.test.tsx` | Uses the query-aware `render` helper and waits two timer ticks for results, as the stats tests do. No assertion changed                                                                                                                                                                                                                                                                                |

The screen still reloads the list itself after every save (also after a failed one), so the mutations invalidate nothing.

## Verification

- `npm test -w frontend -- twelve-week`: 39 passed
- `npm run check`
