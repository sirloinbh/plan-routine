# Add a Plans page that shows plans by horizon (#342)

## Purpose

The owner could not see plans beyond the 12-week goals page. This card adds a read-only Plans page on top of the `/api/plans` routes from #341. Add, edit and delete come in #343.

## Changes

| File                                                       | Change                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/plans-data.ts`                               | Types, horizons, status labels and the range formatter, shared with the forms of #343                                                                                                                                                                                                                                                                         |
| `frontend/src/plans.tsx`                                   | `Plans` page: four tabs (`SegmentedControl`) for this week, this 12 weeks, this year (52 weeks) and the next 10 years. Each tab loads `GET /api/plans?horizon=...` through `useApiQuery`, shows the period range in its header, each plan with title, description, status badge and period, an empty state, a loading region and an error with a retry button |
| `frontend/src/app.tsx`                                     | `/plans` in `pages`, a "Plans" item in `nav` after "12-week routines" (the day log stays first), and the route                                                                                                                                                                                                                                                |
| `frontend/src/plans.test.tsx`, `frontend/src/app.test.tsx` | Component tests (tabs, per-horizon lists, empty, loading, error and retry) and the menu order and the new page                                                                                                                                                                                                                                                |

## Decisions

- Only the current period of each horizon is shown (the card says past periods come later). The tab opens with `staleTime: 0`, so a new period shows no plans.
- Each tab has its own query key `['/api/plans', horizon]`; #343 can invalidate `apiKey('/api/plans')` to refresh all of them.

## Verification

- `vitest run src/plans.test.tsx src/app.test.tsx`: 22 passed.
- Browser check at 390x844 and 1440x900: not done in this lane (no local server with auth and database); passed to the user as a to-do.
- `npm run check`: see the PR.
