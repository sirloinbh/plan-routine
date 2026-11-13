# #5 Checklist screen and today's daily routine check

- Issue: [#5](https://github.com/sirloinbh/plan-routine/issues/5)
- Branch: `feat/5-daily-checklist`
- Date: 2026-10-31 (Asia/Seoul)

## Purpose

See the set daily routines as a checklist and mark them done right away. Make the API and the component shared so weekly, 4-week, and 12-week routines can use the same format.

## Confirmed rules (confirmed by the user, recorded in the #5 comment)

- A check on a past date can be changed up to 7 days before today. That is 8 dates including today.
- A future date cannot be checked.
- Reading the checklist also allows only the same date range. Viewing older records is handled in #10.

## Changes

- API (`backend/src/check-routes.ts`)
  - `GET /api/checklist?cadence=daily&date=`: the checklist of a date. If the cadence is omitted it is daily, and if the date is omitted it is the server's today. The response is `date`, `today`, `previousDate`, `nextDate`, `period`, and `items`, and a neighboring date outside the range is `null`.
  - `PUT /api/routines/:id/checks/:date` and `DELETE` on the same path: check and uncheck. Repeating gives the same result. A check is saved with the period start date of the routine's cadence, so it is not duplicated in the same period.
  - Saving a check is handled in one transaction with recording the first-use day (applying the #3 follow-up). The routine row is locked with `FOR SHARE`, so a check does not attach to a routine that is being archived at the same time.
  - A date outside the range gives a 400 with a user-facing message, and a missing or archived routine gives a 404 with a user-facing message.
- `backend/src/routines.ts`: split out the cadence schema `routineCadence` for shared use. `routineAnchorDate` also accepts a transaction connection.
- Screen
  - `frontend/src/checklist.tsx`: the shared checklist (title, items, the done toggle, and `done/total` progress).
  - `frontend/src/daily-checklist.tsx`, menu "Today's check" (`/today`): a checklist by category, the overall progress, moving to the previous day, the next day, and today, and a notice when there are no routines.
  - A check is reflected on the screen first, and if saving fails it is reverted, a user-facing error is shown, and the list is fetched again.
  - Repeated clicks on a cell that is being saved are ignored, because disabling the cell would lose the keyboard focus.

## Tests

- `backend/test/check-routes.test.ts` (API, fake pool): the defaults and the neighboring dates, fetching the period start date of a long cadence, a 400 with a user-facing message for a date outside the range (no query is run), the boundary of today and 7 days ago, recording the first-use day and saving a 4-week period, unchecking, a 404 for an archived routine, and an invalid number, date, or cadence.
- `backend/test/db.integration.test.ts` (real DB): saving and reading a check, preventing duplicates for repeated and concurrent checks, independence by date, repeated unchecking, and after archiving, exclusion from the list, keeping records, and 404.
- `frontend/src/daily-checklist.test.tsx` (screen): showing categories and hiding empty ones, a check reflected immediately and kept after a fresh fetch, progress, unchecking, repeated clicks while saving, restoring when saving fails, a 404 for an archived routine, date navigation and the end of the range, the empty state, and a fetch failure.
- `frontend/src/app.test.tsx`: opening the "Today's check" page from the menu.

## Verification

- Full local check (`TEST_DATABASE_URL` removed, after the user installed the packages): format, lint, and type checks passed, the skill check 4 pass, and the build succeeded. Backend tests were 31 pass / 0 fail / 6 skip out of 37, and the 6 skips are DB integration tests.
- Local frontend tests: with the default time limit (5 seconds), 4 of 74 failed with a timeout. Of these, 3 are existing tests or app screen tests that this PR did not change. Running again with `--testTimeout=60000`, all 74 pass. I judged it to be because the PC is slow, and in CI it passes with the default time limit.
- CI `verify`: all 37 backend tests passed including the DB tests (skip 0, according to the log of commit `2f0a3e2` after the code follow-up), and `verify` and `docker-build` passed up to the later commits.
- Browser: instead of the real API, I connected the Vite dev server to an in-memory temporary API with the same response format (a scratch file outside the workspace) and checked with headless Chrome (DevTools protocol). There were no console errors.
  - Mobile 390×844: no horizontal scroll (scrollWidth 390), cards in one column, long names wrap.
  - PC 1440×900: no horizontal scroll, cards in two columns.
  - Both sizes: checking by clicking the label and the cell, progress 2/6 and per-card 1/2 and 1/1, focus kept after a check, kept after a refresh, the previous day checked separately (0/6), and returning to today gives 2/6.
  - The screen connected to a real DB could not be checked. API and DB behavior is checked by the CI DB integration tests. The date-range response of the temporary API is not the real server code, so the range check is confirmed by the API tests.

## Limits and follow-up

- If the screen is kept open past midnight, it saves to yesterday's date until fetched again. The date is shown in the title: [#44](https://github.com/sirloinbh/plan-routine/issues/44).
- Only routines that are not archived now are shown, so routines added later also appear on past dates. Viewing records by date is handled in #10.
- The weekly, 4-week, and 12-week screens are built in #6 to #8. The API and `Checklist` can already accept those cadences.

## Automated code review

- First: 7 follow-ups applied and 2 split into new issues. There were no findings on the server's transactions, locks, or security.
  - (High) 2 lint errors failed the required CI. Moved `progressText` to `checklist-progress.ts` and fixed the `async` function in the test.
  - (High) The fake API in the app test was not in the checklist format, so a render error could occur. Added a `/api/checklist` response and wait until loading finishes.
  - (Medium) A screen left open past midnight saved to yesterday's date. It fetches again when the screen becomes visible again, and the today screen keeps following the server's today. Added a test.
  - (Medium) A fetch response that arrived while saving overwrote the check mark. Responses that may be pre-save data are discarded, and it fetches again after saving ends. Added a test.
  - (Low) Changed the key of the saving indicator to the date and the routine number.
  - (Low) If date navigation fails, it can be retried with the same button, and a "Retry" button is placed for a first-load failure. Added a test.
  - (Low) Updated the verification section of this record.
  - Split off: focus after date navigation [#41](https://github.com/sirloinbh/plan-routine/issues/41), DB test for concurrent archive and check requests [#42](https://github.com/sirloinbh/plan-routine/issues/42).
- Second: no defect blocking the merge; of 3 low findings, 2 were applied and 1 was split off. No third review is done.
  - (Low) A fetch started during saving could erase the check mark if it arrived later than the save. The end of the save is also counted, and such responses are discarded. Added a test.
  - (Low) The fetch-failure notice stayed even when the next fetch succeeded. Only the fetch-failure notice is cleared, and the save-failure notice is kept. Added a test.
  - Split off: the case of passing midnight with the screen kept open [#44](https://github.com/sirloinbh/plan-routine/issues/44).
