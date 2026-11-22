# Move the stats screen onto the shared query layer (refs #178)

## Purpose

First screen of #178 (ADR-0027): the stats screen loads through `useApiQuery` instead of its own load loop. This change also puts the shared `QueryClientProvider` in place for the screens that follow, and fixes `isPassingFailure` (#160).

## Changes

| File                                   | Change                                                                                                                                                                                                                           |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/app.tsx`                 | One `createQueryClient()` for the life of the app, provided around the router (single-spot edit)                                                                                                                                 |
| `frontend/src/stats.tsx`               | Loads with `useApiQuery`; the hand-written effect, `version`, `ignore` flag, `requestedOn` ref and visibility listener are gone                                                                                                  |
| `frontend/src/use-date-change.ts`      | New `useReloadWhenCurrent(query, serverToday)` keeps a query current (date change, passing failure, device clock ahead of the server, page shown again). `isPassingFailure` now retries 408 and 429 and stops on non-HTTP errors |
| `frontend/src/test/render.tsx`         | `render` with a fresh client (no retry, no cache between tests) for screen tests                                                                                                                                                 |
| `frontend/src/stats.test.tsx`          | Uses that `render`; `flush` waits one more tick for the query layer                                                                                                                                                              |
| `frontend/src/use-date-change.test.ts` | Tests for `isPassingFailure`                                                                                                                                                                                                     |

The stats query uses `staleTime: 0`, so a page shown again still loads again at once, as before.

## Verification

- `npm test -w frontend -- stats app.test use-date-change`: passed.
- `npm run check`: see the PR.
