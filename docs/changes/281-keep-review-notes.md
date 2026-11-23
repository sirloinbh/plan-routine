# Keep unsaved weekly review notes when changing the week (#281)

## Purpose

The notes form was mounted per week, so going to another week with unsaved text silently discarded it.

## Changes

| File                                  | Change                                                                                                                                                          |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/weekly-review.tsx`      | The page keeps the unsaved text of each week (`drafts`); the form starts from its week's draft, else the saved notes; a successful save drops that week's draft |
| `frontend/src/weekly-review.test.tsx` | Type, change week, come back: the text is there; after saving the draft is gone                                                                                 |

## Notes

- Drafts live in page state only: a reload or leaving the page still drops them (no storage of typed text).
- The week rollover at Sunday is covered the same way, because drafts are keyed by week start.

## Verification

- `npm test -w frontend -- weekly-review`: 7 passed
- Browser check not repeated: no markup or layout change
- `npm run check`: see the PR
