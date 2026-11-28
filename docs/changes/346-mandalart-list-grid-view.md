# Add the Mandalart list and 9x9 grid view (#346)

## Purpose

The owner had no screen to see a Mandalart. This adds a "Mandalart" menu item, a list page and a read-only 9x9 grid page (editing comes in #347).

## Changes

| File                               | Change                                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| `frontend/src/app.tsx`             | `/mandalarts` and `/mandalarts/:id` pages and the "Mandalart" menu item (after "12-week routines") |
| `frontend/src/mandalarts.tsx`      | list (title, filled-cell count, loading, error with retry, empty state) and the read-only grid     |
| `frontend/src/mandalart-cells.ts`  | shared helpers: query key, path, cell and block names (reused by the editor in #347)               |
| `frontend/src/mandalarts.test.tsx` | list, empty, error and retry, loading, 81 named cells, zoom dialog, missing and invalid id         |
| `frontend/src/app.test.tsx`        | menu order and the Mandalart page, kept marked on a Mandalart                                      |

## Decisions

- The grid is 3x3 blocks of 3x3 cells. The main goal is the dark cell, sub-goals (block 4 and the centre of each outer block) are shaded. Every cell is a list item with an accessible name such as "Action 2 of sub-goal 1: text" or "empty".
- Phone width: each block has a "Zoom in" button that opens the block enlarged in a dialog. Cell text in the small grid is clamped.

## Verification

- `npm run check`: see the PR.
- Browser check with a mocked API (no local DB), Vite dev server: 390x844 and 1440x900, no horizontal scroll, grid and zoom button shown. At 390 px the cell text is tiny and clamped, so reading goes through "Zoom in".
