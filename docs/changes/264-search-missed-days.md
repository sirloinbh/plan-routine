# List a routine's missed days without a diary entry in search (#264)

## Purpose

The routine filter of #250 only narrowed diary entries, so a missed day with no diary entry was never found. User decision (2026-11-23, option B on #250): with a routine filter, search also lists those days, as results without text that link to the day.

## Changes

| File                           | Change                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/src/search-routes.ts` | A third `UNION ALL` source (`kind: "missed"`) built with `generate_series`: from the later of the start date and the day the routine was created, to the earlier of the end date and yesterday; skips days with a check or a diary entry and days after the routine was archived. Added only for a routine with `result=missed` and no text. "Today", the routine and the dates are still bound once and shared |
| `frontend/src/search.tsx`      | A missed-day result reads "Missed <routine>", links to its day and has no "whole entry" panel                                                                                                                                                                                                                                                                                                                   |
| tests                          | `backend/test/search.test.ts`, `backend/test/db-search.integration.test.ts` (real SQL, CI), `frontend/src/search.test.tsx`                                                                                                                                                                                                                                                                                      |

## Rules

- "Missed" is the definition of #250: a past day on which the daily routine was due (created by then, not archived on or before it) and not checked. A skipped day counts as missed here, as in the diary filter; whether it should is an open question for the user.
- A missed day that has a diary entry stays one diary result (no second row for the same day and source).
- With search text, or `result=done`, the missed days are not added: they have no text, and they are not done days.
- The range is generated per request: at most one row per day since the routine was created. For one user this is a few thousand rows at most.

## Verification

- `npm test -w backend`: 211 passed (DB integration tests skipped: no local `plan_test` DB; CI runs them, including the missed-day cases)
- `npm test -w frontend -- search app.test`: 28 passed
- `npm run check`: see the PR
