# #19 Returning keyboard focus after editing or archiving a daily routine

- Issue: [#19](https://github.com/sirloinbh/plan-routine/issues/19)
- Branch: `fix/19-routine-focus`
- Date: 2026-11-01 (Asia/Seoul)

## Purpose

After saving, cancelling, archiving, or moving, the pressed element was redrawn or disabled, so the keyboard focus fell to `body`. Keep keyboard and screen reader users from losing their place.

## Changes

`frontend/src/use-routine-list.ts`, `routine-list.tsx`. It applies to all the daily, weekly, 4-week, and 12-week screens that share the item management part.

| Action                  | Where the focus goes                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Save or cancel a rename | The "Edit" button of that routine                                                                                               |
| Rename fails            | The input. If the routine is gone, the add input of that card                                                                   |
| Move up or down         | The same button. If it is disabled by reaching the end, the opposite button. If the routine is gone, the add input of that card |
| Archive confirm         | The "Edit" of the next item. If none, the previous item, and if that is also none, the add input of that card                   |
| Archive fails           | The "Edit" button of that routine                                                                                               |
| Add                     | The add input of that card                                                                                                      |

- Focus is moved after the refetch finishes, because when the order of rows changes the positions of the buttons change too.
- A refetch that reflects changes made elsewhere does not move the focus.
- If the user moved elsewhere while waiting for a change, focus is not taken.
- On a touch screen, focus is not moved to the add input, so the keyboard does not come up by itself. If a rename fails, the input must be fixed, so focus is moved to that input.

## Tests

`frontend/src/routines.test.tsx`: each action in the table above, not taking focus after the user moved elsewhere, keeping the focus when returning to the screen, and the touch screen.

## Verification

- Local (`TEST_DATABASE_URL` removed): format, lint, type checks, and build passed. Frontend tests were 200 pass / 0 fail / 2 skip out of 202 with `--testTimeout=60000` (the skips are the same dark-mode-only shared tests as in the #7 record). The backend did not change.
- Browser: connected the Vite dev server to a temporary API and checked the focus position with real Enter and Tab key input in headless Chrome. There were no console errors. It was not checked with a real DB, a real screen reader, or a real phone's virtual keyboard.
  - PC 1440×900: saving and cancelling a rename, moving up, adding, and the archive confirmation.
  - Mobile 390×844, simulating touch input (`pointer: coarse`): no horizontal scroll (scrollWidth 390), focus did not go to the input after adding, and after archiving it went to the "Edit" button of the neighboring item. Archiving the last item of a group was checked by a screen test.

## Limits and follow-up

- Focus after editing or deleting on a 12-week goal card and focus after date navigation are handled in [#41](https://github.com/sirloinbh/plan-routine/issues/41). The goal card was added to #41.

## Automated code review

- First: 8 follow-ups applied.
  - (Medium) Even if the user moved elsewhere while waiting, focus was taken, so input could go into another card. Focus is not taken unless it is where the change started. Added a test.
  - (Medium) The rename-failure test did not check the focus and failed depending on timing (1 CI failure). Split and rewrote it.
  - (Medium) Mobile was not checked. I checked it, and on touch screens focus is skipped so the keyboard does not come up from an input focus. Added a test.
  - (Low) When archiving failed, focus went to a neighboring row. It now stays in its own row. Added a test.
  - (Low) If saving failed after cancelling during the save, the focus was lost. The Edit button was made the next candidate.
  - (Low) If a routine that was gone was moved or renamed, the focus was lost. The add input was made the last candidate. Added a test.
  - (Low) Fixed 2 tests that could not verify the cause.
  - (Low) Fixed the record, added the goal card to #41, and updated the next-steps document.
- Second: no defect blocking the merge. Confirmed the 8 first-review follow-ups were applied. 2 low findings applied (made the touch description match the code, and a test for the case where the pressed button keeps focus). The review ends at 2 rounds.
