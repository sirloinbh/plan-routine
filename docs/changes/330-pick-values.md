# #330 Pick values instead of typing them in forms

- Issue: [#330](https://github.com/sirloinbh/plan-routine/issues/330)
- Branch: `feat/330-pick-values`
- Related: sirloinbh/project-standards#1130

## Free-text field list

| Form                                                                       | Field                                              | Result                                                                                                  |
| -------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Routine add form, routine amount form                                      | Unit                                               | Combobox: units already used on the routines, plus pages, minutes, times. A new unit can still be typed |
| Add and rename routine, goal, project                                      | Name, title, project name and URL                  | Free text (open values)                                                                                 |
| Skip reason, diary, weekly review, 12-week note, search, assistant message | Notes and queries                                  | Free text                                                                                               |
| Weekdays, times per week, category, dates, targets                         | Already checkboxes, selects, date or number fields | Unchanged                                                                                               |

## Change — 2026-11-27

- `frontend/src/routine-list.tsx`: both unit fields use the shared `Combobox`.
- `frontend/src/lib/used-values.ts` (+ test): distinct used values, most used first, then the common ones.
- Tests: the unit fields are comboboxes now; a test picks a used unit from the list.
