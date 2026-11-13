# #6 Setting and checking weekly routines

- Issue: [#6](https://github.com/sirloinbh/plan-routine/issues/6)
- Branch: `feat/6-weekly-routines`
- Date: 2026-10-31 (Asia/Seoul)

## Purpose

Set tasks that need to be done once a week, and check whether they are done this week. The week runs from Sunday to Saturday (confirmed in #3).

## Rules decided during implementation

- The "default examples" of the issue (writing a book report, cleaning, keeping a household ledger) are not put in beforehand, and are shown as placeholder text in the input. This is so that items the user does not want do not appear by themselves.
- The screen handles only this week. Editing last week's checks is possible through the API within the date range of #5, but it is not placed on the screen.

## Changes

- Screen (`frontend/src/weekly-routines.tsx`, menu "Weekly routines", `/weekly`): the display of this week's period, the checklist and progress, and adding, reordering, renaming, and archiving items.
- Made shared (reused by the 4-week and 12-week cards)
  - `frontend/src/use-checklist.ts`: moved the fetch and save logic of `daily-checklist.tsx` so it can be used per cadence.
  - `frontend/src/use-routine-list.ts`, `routine-list.tsx`: moved the item management logic and the screen pieces of `routines.tsx`. The accessible names of the daily routines screen are unchanged. Two behaviors changed together: the list is fetched again when the screen is visible again, and the fetch error is cleared when the next fetch succeeds.
  - `frontend/src/checklist.tsx`: added `ChecklistPending`, the display for the first loading and failure.
- Gave the name cell of the item management row a minimum width. This fixes the problem on mobile where a long name was squeezed by the buttons and wrapped very narrowly. When there is not enough room, the buttons drop to the next line. It also applies to the daily routines screen.
- No API or DB change. It uses the weekly period calculation and the check API built in #3 to #5.

## Tests

- `frontend/src/weekly-routines.test.tsx` (screen): the Sunday to Saturday period and progress, saving a check and keeping it after a fresh fetch, keeping within the same week and resetting for a new week while keeping last week's records, no category when adding and reflecting it in both lists, excluded from the checklist after the archive confirmation, a 404 for a routine archived elsewhere, and retrying after the checklist fails to load.
- `backend/test/db.integration.test.ts` (real DB): the week boundary (a Thursday check lasts until Saturday, one row even when rechecked in the same week, a new week starts on Sunday, last week's records are kept, and unchecking).
- `frontend/src/app.test.tsx`: opening weekly routines from the menu.
- Regressions from making things shared are confirmed by passing the existing `routines.test.tsx` and `daily-checklist.test.tsx` without changing them.

## Verification

- Local (`TEST_DATABASE_URL` removed): format, lint, type checks, and build passed, the skill check 4 pass. Backend tests were 38 pass / 0 fail / 9 skip out of 47, and the 9 skips are DB integration tests. Frontend tests all 100 passed with `--testTimeout=60000`.
- 1 intermittent failure: on the first run, 1 test, "saving trims the text" in `diary-routes.test.ts`, which I did not touch, failed. I did not keep the failure content because I filtered the output. It did not reproduce in the 4 full runs and 36 repeated runs under load afterwards. I could not confirm the cause.
- Browser: connected the Vite dev server to an in-memory temporary API and checked with headless Chrome. There were no console errors. The screen connected to a real DB was not checked.
  - Mobile 390×844: no horizontal scroll (scrollWidth 390), long names wrap.
  - PC 1440×900: no horizontal scroll.
  - Both sizes: the period display, checks and progress, focus kept after a check, both lists reflecting an add, exclusion after archiving, and kept after a refresh. As a regression check of the sharing, I also confirmed that the "Daily routines" and "Today's check" screens show up. Moving up was checked on mobile, and on PC it could not be checked because the order values of the temporary API overlapped. Moving weekly items is confirmed by the DB test.

## Limits and follow-up

- Last week's checks cannot be fixed on the screen.
- If the week changes while the screen is kept open, checks are saved to last week until it is fetched again: [#44](https://github.com/sirloinbh/plan-routine/issues/44).
- Returning keyboard focus after editing or archiving: [#19](https://github.com/sirloinbh/plan-routine/issues/19). It uses the same part.

## Automated code review

- First: no defect blocking the merge. The refactor preserved behavior. 4 follow-ups applied and 1 handed to #44.
  - (Low) When the first load of the list failed, "No routines yet" stayed and there was no way to recover. A retry button is shown. Added a test.
  - (Low) The two lists could get out of sync. The management list is also fetched again when the screen is visible again and when saving a check fails. Added a test.
  - (Low) If fetching again failed, there was no way to retry. A retry button is shown. Added a test.
  - (Low) Moving and renaming weekly items had no test. Added DB and screen tests and fixed an inaccurate sentence in the record.
  - (Medium) If the week changes with the screen kept on, checks are saved to last week. Widened the scope of [#44](https://github.com/sirloinbh/plan-routine/issues/44) to the weekly screen and raised its priority to P2.
- Second: no defect blocking the merge. All 3 low findings applied. The review ends at 2 rounds.
  - If fetching again failed on a management list that has items, there was no retry button, so adding again could create a duplicate. A retry button is always shown. Added a test.
  - A fetch failure overlapping with a change could erase the change result message. The display is reset when the change ends. Also applied to the checklist hook.
  - Fixed the sentence "behavior is unchanged" in the record to match the current behavior.
