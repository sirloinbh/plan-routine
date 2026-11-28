# Make the Mandalart editor tests wait for the real condition (#369)

## Purpose

`frontend/src/mandalart-editor.test.tsx` failed once under load with a 1 s `findByRole` timeout, and passed alone and on rerun.

## Cause

The editor page has about 100 inputs and 162 list items. `getByRole(..., { name })` works out the accessible name of every element with that role, so one query over this page is slow. Measured with a throwaway test on this page:

| Machine                      | `getByRole('textbox', { name })` (first) | `getByLabelText` (same field) | `getByRole('listitem', { name })` | `getByLabelText` (same cell) |
| ---------------------------- | ---------------------------------------- | ----------------------------- | --------------------------------- | ---------------------------- |
| idle                         | 147 ms                                   | 7 ms                          | 38 ms                             | 3 ms                         |
| 32 busy processes on 8 cores | 1199 ms                                  | 78 ms                         | 220 ms                            | 3 ms                         |

A single query that takes over 1 s fails `findBy*` and `waitFor` whatever the condition is, because the wait ends before the query returns. Raising the wait would hide the cost; making the query cheap removes it.

## Changes

| File                                     | Change                                                                                                                                                                                                                                                                        |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/mandalart-editor.test.tsx` | text fields, grid cells and the sub-goal group are found by label text or legend text (`getByLabelText` with `selector: 'input'`, `getByText` on the legend); after creating a Mandalart the test waits for the editor's main goal field, which is the real "ready" condition |

No timeout was added or raised, and no app code changed. Buttons, dialogs and headings keep their role queries: few elements match them, so they stay cheap.

## Not changed (reported to the coordinator)

`frontend/src/test/setup.ts` does not import the managed `./standard-setup.ts`, which sets `asyncUtilTimeout` to 8 s. Every screen test therefore runs with the 1 s default wait (only `routines.test.tsx` sets its own). That file is not part of this card.

## Verification

- `npm run check` and `npm run standards:check`: see the PR.
- The old and the new test file both passed 4 runs each under 32 busy processes on 8 cores, so the original failure was not reproduced; the table above is the evidence for the cause.
