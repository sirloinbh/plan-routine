# Add Mandalart create, edit and delete screens (#347)

## Purpose

The owner could view a Mandalart (#346) but not make or change one. This adds creating, editing, renaming and deleting.

## Changes

| File                                     | Change                                                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `frontend/src/mandalart-editor.tsx`      | "New Mandalart" dialog (title, then opens in edit mode) and the editor form                                 |
| `frontend/src/mandalart-leave.ts`        | warns before leaving with unsaved input (browser prompt on reload/close, a confirm dialog for in-app links) |
| `frontend/src/mandalart-grid.tsx`        | the grid and zoom dialog moved out of `mandalarts.tsx` (shared by the view and the editor preview)          |
| `frontend/src/mandalarts.tsx`            | New, Edit and Delete buttons; delete uses the shared confirm dialog                                         |
| `frontend/src/mandalart-cells.ts`        | client-side `mirrorGrid`, `emptyGrid`, `sameCells`                                                          |
| `frontend/src/mandalart-editor.test.tsx` | create, edit, mirror, title validation, refused save, discard and leave prompts, delete                     |

## Decisions

- The editor is a form in the order the issue asks: title, main goal, 8 sub-goals, then the 8 actions of each sub-goal in their own group (the group title shows the sub-goal as you type). A live preview grid shows the centre copies before saving. 81 inputs inside a 9x9 grid would not be usable at 390 px, so the grid stays read-only.
- One save sends all 81 cells with the single PUT, then a PATCH only when the title changed.
- There is no shared "unsaved form" helper in the repo, so `useLeaveGuard` was added. `BrowserRouter` has no route blocker, so in-app links are intercepted with a click listener; browser back/forward is not intercepted.
- Deleting does not refetch the deleted Mandalart (it would answer 404); only the list is refreshed.

## Verification

- `npm run check` and `npm run standards:check`: see the PR.
- Browser check (Vite dev server, mocked API) at 390x844 and 1440x900: no horizontal scroll, sub-goal edit shows its centre copy, and reloading with unsaved input raised the browser's leave prompt.
