# Keep the screen routine categories in step with the backend (#169)

## Purpose

`frontend/src/routine-groups.ts` copies the category codes and labels of `backend/src/routines.ts` with nothing checking they match, dropped routines with an unknown category, and sorted ids with `Number`.

## Changes

| File                                  | Change                                                                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `frontend/src/routine-groups.ts`      | Routines with an unknown or missing category go to an "Other" group (shown only when it has routines). Ids sort as strings by length then value. |
| `frontend/src/routines.tsx`           | The "Other" group has no add form, because there is no category to post to                                                                       |
| `frontend/src/routine-groups.test.ts` | Fails when the backend and frontend category codes, order or labels differ; covers "Other" and large-id sorting                                  |
| `frontend/src/routines.test.tsx`      | A routine with an unknown category renders in "Other"                                                                                            |

## Verification

- `npm test -w frontend`: all passed. Adding a category to only the frontend list makes `routine-groups.test.ts` fail (checked by hand).
- `npm run check`: see the PR.
