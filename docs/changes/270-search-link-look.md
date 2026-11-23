# Make Search result dates look like links (#270)

## Purpose

The browser check of `/review` and `/search` (the coordinator's item 2, 2026-11-23) found two small problems on the Search page. This record also holds the result of that check.

## Changes

| File                      | Change                                                                                                                                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/search.tsx` | Result date links are underlined (they looked like plain bold text); the Search button keeps its natural width in the form grid (`justify-self-start`; it stretched over the first column at 1440 px) |

## Browser check (390x844 and 1440x900)

Vite on port 5207 with a mock `/api` (a small script outside the repo; same shapes as the real routes). Nothing was changed in the real data.

- `/review`: no horizontal scroll at either size; the cards stack at 390 px and sit side by side at 1440 px; the long routine name wraps; Previous and Next week move between weeks and Next is disabled on this week; the notes show their counters. Saving the notes was only checked by the component tests.
- `/search`: no horizontal scroll at either size; a text search shows diary, note and skip-reason results; "Show the whole entry" opens the entry; a routine alone shows the missed day without a diary entry as "Missed <routine>"; the date link opens `/records?date=YYYY-MM-DD` with that day selected.
- Not checked in a browser: real data (no local plan DB), touch input, the sign-in gate (off on localhost).
- Found and fixed here: the two problems above. After the fix, at 1440 px the Search button is 77 px wide and the result links are underlined.

## Verification

- `npm run check`: see the PR
