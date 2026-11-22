# Move the records screen onto the shared query layer (refs #178)

## Purpose

Second screen of #178 (ADR-0027): the records screen loads its month and its chosen day through `useApiQuery` instead of two hand-written effects, counters, `ignore` flags and a visibility listener.

## Changes

| File                              | Change                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/records.tsx`        | The month and each day are separate queries (keys `/api/records`, month and `/api/records`, `day`, date), so one never refetches the other. The calendar stays on screen while the next month loads or fails. Retry buttons refetch their own query; the date-change and page-shown reloads refetch both through `useReloadWhenCurrent` |
| `frontend/src/use-date-change.ts` | `useReloadWhenCurrent` takes any `{ isFetching, error, refetch }`, so a screen with two queries can reload both                                                                                                                                                                                                                         |
| `frontend/src/records.test.tsx`   | Uses the shared test `render`; `flush` waits for the query layer's ticks                                                                                                                                                                                                                                                                |

The behavior fixed in #163 (no detail panel for a day outside the shown month, one month request and no day request when the month changes) is kept and still tested.

## Verification

- `npm test -w frontend -- records stats`: passed (records run three times in a row).
- `npm run check`: see the PR.
