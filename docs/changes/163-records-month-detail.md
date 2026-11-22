# Keep the records detail panel in the shown month (#163)

## Purpose

After "Previous month" the records page still showed the detail of a day from another month while no calendar cell was pressed. One reload counter also made the month and the day refetch each other.

## Changes

| File                            | Change                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/records.tsx`      | `moveMonth` clears the chosen day. Today is selected only while its month is shown, otherwise the panel says "Choose a day to see its records". The month and the day have separate reload counters (`monthVersion`, `dayVersion`). `moveMonth` no longer calls `reload()`. Re-choosing the shown day and the day retry reload only the day; the month retry reloads only the month. A page shown again or a date change still reloads both. |
| `frontend/src/records.test.tsx` | The month-move test now expects one month request, no day request, no detail panel and no pressed day outside the month, and today's detail on return. A new test checks that re-choosing a day reloads only the day.                                                                                                                                                                                                                        |

## Verification

- `npm test -w frontend -- records`: 19 passed.
- `npm run check`: see the PR.
- Browser check at 390×844 and 1440×900: see the PR.
