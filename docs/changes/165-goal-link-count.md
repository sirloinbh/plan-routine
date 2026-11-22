# Report the routines the server actually linked to a goal (#165)

## Purpose

The "Linked N routines" notice counted the routines the user ticked. If one was archived between load and save, the server dropped it and the notice overstated the count.

## Changes

| File                                       | Change                                                                |
| ------------------------------------------ | --------------------------------------------------------------------- |
| `frontend/src/goal-routine-links.tsx`      | The notice (and the "Unlinked all" case) uses `saved.routines.length` |
| `frontend/src/goal-routine-links.test.tsx` | 3 ticked and 2 saved shows "Linked 2 routines"; singular message test |

## Verification

- `npm test -w frontend -- goal-routine-links`
- `npm run check`
