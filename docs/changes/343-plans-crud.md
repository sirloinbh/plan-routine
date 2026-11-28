# Add create, edit and delete for plans (#343)

## Purpose

The Plans page (#342) was read-only. The owner can now add a plan to any horizon, edit its title, description, status and period, and delete it.

## Changes

| File                              | Change                                                                                                                                                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/plan-form.tsx`      | Dialog form (`dialog.tsx`) with title, description, horizon (select), period start (`DateField`) and status (select). Server field messages show next to the field and typed values stay after a rejected save |
| `frontend/src/plans.tsx`          | "Add plan" button, Edit and Delete per row (`ConfirmDialog`), a shared notice for success; a saved plan opens on its own horizon tab                                                                           |
| `frontend/src/plan-form.test.tsx` | Tests for add, add on another horizon, a rejected save, edit, delete, cancel and a failed delete                                                                                                               |

## Decisions

- The horizon of a saved plan cannot be changed (the API does not allow it); the select is disabled when editing.
- The add form starts with the open tab's horizon and period start. Changing the horizon clears the period start, which means the current period of the new horizon.
- A failed delete shows its error inside the confirm dialog, because the open modal hides the rest of the page from screen readers.
- All plan lists refresh after a save or delete by invalidating `['/api/plans']`.

## Verification

- `vitest run` for the plan, form and app tests: 28 passed.
- Browser check at 390x844 and 1440x900: not done in this lane (no local server with sign-in and database); handed to the user as a to-do.
- `npm run check`: see the PR.
