# Open Records on a date from the address, and link search results to it (#257)

## Purpose

Search results (#250) expanded in place because `/records` could not open a given day. Now `/records?date=YYYY-MM-DD` opens that day, and each Search result's date links there.

## Changes

| File                            | Change                                                                                                                                                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/records.tsx`      | One spot (plan-lane-1 owns the file): `dateFromAddress()` reads `?date=` once when Records opens and feeds the two initial states (`month` and `chosen`). A value that is not a real date, is before 2000-01-01 or after today by the device clock is ignored |
| `frontend/src/search.tsx`       | The result's date is a link to `/records?date=<date>`; the "whole entry" panel stays                                                                                                                                                                          |
| `frontend/src/records.test.tsx` | `?date=` opens that day and its month; missing, malformed, impossible, future and too-early values fall back to this month and today                                                                                                                          |
| `frontend/src/search.test.tsx`  | Results link to their day; the tests render inside a router                                                                                                                                                                                                   |

## Notes

- The address is read only at start. Clicking a day inside Records does not change the address, as before.
- A date later than the server's today but not later than the device's passes the check and the server answers 400 for it; the page shows that error with its retry, as for any failed load.

## Verification

- `npm test -w frontend -- records search app.test`: 53 passed
- `npm run check`: see the PR
