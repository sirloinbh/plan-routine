# #7 Setting and checking 4-week routines

- Issue: [#7](https://github.com/sirloinbh/plan-routine/issues/7)
- Branch: `feat/7-four-week-routines`
- Date: 2026-10-31 (Asia/Seoul)

## Purpose

Set tasks done once every 4 weeks, such as washing bedding, and check them so they are not forgotten. A period is 28 days each, starting from the Sunday of the week that contains the app's first-use day (confirmed in #3).

## Confirmed rules (confirmed by the user, recorded in the #7 comment)

- Show the incomplete items together on the "Today's check" screen only in the last 7 days of a 4-week period.

## Detailed rules decided during implementation (recorded in the #7 comment)

- The last 7 days are the days where the days left until the end date are 0 to 6. The server makes the judgment.
- An item completed on the today check screen stays there as checked so it can be undone right away, and drops out after switching menus or refreshing.
- The default examples (washing bedding, replacing consumables, a deep cleaning) are shown as placeholder text in the input, as in #6.

## Changes

- API (`backend/src/check-routes.ts`): added `remainingDays` (the days left from today to the period end date) and `endsSoon` (whether it is the last 7 days) to the `GET /api/checklist` response. Added `daysBetween` to `backend/src/periods.ts`. No DB change.
- Screen
  - `frontend/src/period-routines.tsx` (renamed from `weekly-routines.tsx`): weekly and 4-week use the same screen. The 4-week one also shows the days left. Menu "4-week routines", `/four-week`.
  - `frontend/src/four-week-due.tsx`: the "4-week routines ending soon" card on the "Today's check" screen.

## Tests

- `backend/test/periods.test.ts`: `daysBetween`.
- `backend/test/check-routes.test.ts`: the days left and the boundary of the last 7 days (7 days left, 6 days left, the last day, the first day of the next period), and a past period.
- `backend/test/db.integration.test.ts` (real DB): the 4-week boundary (one row even when rechecked in the same period, the next period resets, past period records are kept, and calculation from the first-use day).
- `frontend/src/period-routines.test.tsx`: the 4-week period and days left, the last-day text, the add request, and checks. The weekly test only changed the path it loads from.
- `frontend/src/four-week-due.test.tsx`: hidden when it is not the last 7 days, only incomplete items shown, keeping the place after completion and undoing, excluded after leaving the screen, not carrying over to the next period, hidden when all are done, fetch failure and retry, recovery from a save failure, a 404 for a routine archived elsewhere, and the heading level.
- `frontend/src/app.test.tsx`: opening 4-week routines from the menu, and the 4-week card on the today check screen.

## Verification

- Local (`TEST_DATABASE_URL` removed): format, lint, type checks, and build passed, the skill check 4 pass. Backend tests were 41 pass / 0 fail / 10 skip out of 51, and the 10 skips are DB integration tests. Frontend tests were 117 pass / 0 fail / 2 skip out of 119 with `--testTimeout=60000`. The 2 skips are tests for dark-mode-only apps that came in with the central standards sync (#49), and do not apply to this app.
- The browser check was done again after the first follow-up, with the same result.
- Browser: connected the Vite dev server to an in-memory temporary API and checked with headless Chrome. There were no console errors. The screen connected to a real DB was not checked. The period calculation of the temporary API is not the real server code, so the period and days left are confirmed by API and DB tests.
  - Mobile 390×844: no horizontal scroll (scrollWidth 390), cards in one column.
  - PC 1440×900: no horizontal scroll.
  - Both sizes: the period and progress of the 4-week screen, and the last-day text. On the today check screen, only incomplete items shown, keeping the place after a check, and undoing.

## Limits and follow-up

- Checks of a past period cannot be fixed on the screen.
- If the period changes while the screen is kept open, checks are saved to the past period until it is fetched again: [#44](https://github.com/sirloinbh/plan-routine/issues/44).

## Automated code review

- First: no defect blocking the merge. 4 follow-ups applied and 1 handed to an issue.
  - (Medium) If the fetch of the 4-week card failed, there was no way to retry. A "Reload 4-week routines" button is shown. Added a test.
  - (Low) When there was no daily list, the heading order skipped, and the card based on today was placed under the past date's heading. Raised the card title to h2.
  - (Low) The record of a checked item stayed until the next period. It is now separated by period. Fixed the document's "drops out the next time it is fetched" to match the real behavior.
  - (Low) Connecting the card and the save-failure behavior had no test. Added tests.
  - Handed over: added the 4-week screen and the card to [#44](https://github.com/sirloinbh/plan-routine/issues/44).
- Second: no defect to fix. Confirmed the 4 first-review follow-ups were applied. Only 2 test code cleanups (deleting an unused helper, adding the new field to a fake response) were applied. The review ends at 2 rounds.
