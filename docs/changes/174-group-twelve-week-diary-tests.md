# Group the long twelve-week and diary test files by concern (#174)

## Purpose

`twelve-week.test.tsx` (about 870 lines) and `diary.test.tsx` (about 1000 lines) were flat lists of tests with helpers declared in the middle, and the diary tests rebuilt stored-draft JSON in several places.

## Changes

| File                                | Change                                                                                                                                                                                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/twelve-week.test.tsx` | Helpers moved to the top; tests grouped in `describe` blocks: the goals of this period, reviewing past periods, loading, keyboard focus, linking routines to goals                                                                       |
| `frontend/src/diary.test.tsx`       | Helpers moved to the top; tests grouped: showing and saving an entry, moving between days, a refused save, the unsaved draft, a draft shared with other tabs, keyboard focus; one `draftJson` builder replaces the hand-built draft JSON |

No test was added, removed or changed in what it asserts: 39 twelve-week tests and 56 diary tests pass before and after.

## Verification

- `npm test -w frontend -- diary twelve-week`: same counts as before (39 and 56)
- `npm run check`
