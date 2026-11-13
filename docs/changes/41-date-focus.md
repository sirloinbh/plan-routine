# #41 Keyboard focus on date navigation and the 12-week screen

- Issue: [#41](https://github.com/sirloinbh/plan-routine/issues/41)
- Branch: `fix/41-date-focus`
- Date: 2026-11-01 (Asia/Seoul)

## Purpose

The date navigation buttons are disabled at the end of the range and "To today" disappears, so the focus fell to `body`. The changed date was also not announced to the screen reader. Also fix the same problems on the diary and 12-week screens that were handed over from PR reviews.

## Changes

Gathered the focus handling in `frontend/src/focus-moves.ts` (new file). The `use-routine-list.ts` code of #19 also uses it.

| Screen                | Action                                             | Where the focus goes                                                                                                                  |
| --------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Today's check, diary  | Move to another date                               | The date heading. The screen reader reads the new date                                                                                |
| Diary                 | Saving fails because the body is empty or too long | The body input. Marked `aria-invalid`                                                                                                 |
| 12-week goals         | Save or cancel a rename                            | The "Edit" button of that goal                                                                                                        |
| 12-week goals         | Rename fails                                       | The input. If the goal is gone, the "New goal" input                                                                                  |
| 12-week goals         | Delete                                             | The "Edit" of the next goal. If none, the previous goal, and if that is also none, the "New goal" input                               |
| 12-week goals         | Delete fails                                       | The "Delete" button of that goal                                                                                                      |
| 12-week goals         | Add                                                | The "New goal" input                                                                                                                  |
| 12-week retrospective | Saving moves the card to another list              | The heading of the moved card. The browser scrolls to that position. The notice also appears on that card, not at the top of the page |

- If the user moved elsewhere while waiting, focus is not taken.
- Focus is not moved when a fetch fails or when the date changes by itself at midnight.
- On a touch screen, focus is not moved to the "New goal" input, so the keyboard does not come up by itself.

## Tests

`daily-checklist.test.tsx`, `diary.test.tsx`, `twelve-week.test.tsx`: the actions in the table above, the end of the range, a fetch failure, a user who moved elsewhere, and midnight. `routines.test.tsx` passes unchanged, confirming the #19 behavior is kept.

## Verification

- Local (`TEST_DATABASE_URL` removed): format, lint, type checks, and build passed. Frontend tests were 235 pass / 0 fail / 2 skip out of 237 with `--testTimeout=60000` (the skips are dark-mode-only shared tests). On this PC, running `npm run check` in one go makes the frontend hit the default time limit, so I ran it in parts. Backend 70 pass / 0 fail / 14 skip out of 84 (DB tests, run without a DB), and `test:skills` 4 pass.
- Browser: with a temporary API and headless Chrome at PC 1440×900 and mobile 390×844 (simulating touch input), I checked date navigation with the real Enter key, saving an empty diary body, opening, cancelling, and deleting a goal edit, and the card moving after saving a retrospective. I found in this check that the heading of the moved card was hidden by the top fixed bar, and fixed it with a scroll margin. There were no console errors or horizontal scroll. It was not checked with a real screen reader, a real phone, or a real DB.

## Limits and follow-up

- If deleting a goal fails after it was deleted elsewhere, that row disappears after the refetch and the focus falls to `body`. I left it as it is rare.
- Month navigation on the records screen is not in the scope of this card.
- After the first load fails, pressing "Retry" drops the focus to `body`. Split off as [#66](https://github.com/sirloinbh/plan-routine/issues/66).

## Automated code review

- First: 4 applied and 1 split off.
  - (Low to medium) A diary save failure took the focus from a user who had moved elsewhere. If they moved, it only shows the mark. Added a test.
  - (Low) The test submitted the save twice. Fixed.
  - (Low) Rename failure and delete failure of goals had no test. Added them and wrote the verification scope as it really was.
  - (Low) The date heading had no top bar margin. Added it together with the retrospective card.
  - (Low) Focus after "Retry" is out of scope, so it was split off to [#66](https://github.com/sirloinbh/plan-routine/issues/66).
- Second: no defect blocking the merge. Confirmed the first-review follow-ups were applied. 2 low findings applied (moving the focus after the diary body is shown, and including the notch area in the scroll margin). The review ends at 2 rounds.
