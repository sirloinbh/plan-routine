# #10 Viewing records by date (check results and diary)

- Issue: [#10](https://github.com/sirloinbh/plan-routine/issues/10)
- Branch: `feat/10-date-records`
- Date: 2026-11-01 (Asia/Seoul)

## Purpose

Look again at the daily routine checks and the diary of past days.

## Confirmed rules (confirmed by the user, recorded in the #10 comment)

- Progress by date is counted based on the routines that existed on that day. The progress on the diary screen is aligned to the same basis.

## Detailed rules decided during implementation (recorded in the #10 comment)

- "A routine that existed on that day" is one of the following. Dates are based on `Asia/Seoul`.
  - A routine that has a check on that day. This includes a routine created later and checked on a past date, or archived on that day.
  - A routine created on or before that day, and not archived or archived after that day.
- A routine archived on that day and with no check on that day is not counted.
- The viewing screen is read-only. Checks and the diary are changed only on the "Today's check" and "Diary" screens.
- The viewing targets are the daily routines and the diary. Viewing weekly, 4-week, and 12-week checks is handled in #11.
- The calendar is by month, and future months and future dates cannot be viewed.

## Changes

- `backend/src/day-records.ts`: the SQL condition for "a routine that existed on that day".
- API (`backend/src/record-routes.ts`)
  - `GET /api/records?month=YYYY-MM`: the progress by date and whether a diary was written, for the calendar, and the previous and next months. If the month is omitted it is this month, and it answers only up to today.
  - `GET /api/records/:date`: that day's routines and checks, the progress, and the diary.
- `backend/src/diary-routes.ts`: changed the progress of the diary screen to the same basis. For a date before the first routine was created, no progress is shown on the diary screen. Before the change, the routines not archived now were counted as the total (the #9 limit).
- Screen (`frontend/src/records.tsx`, menu "Records", `/records`): the calendar and the record of the selected day. An archived routine is shown as "Archived".

## Tests

- `backend/test/record-routes.test.ts` (API, fake pool): the month default and the range up to today, the last day of a month (including leap years and year end) and the previous and next months, a 400 with a user-facing message for an invalid, future, or too early month and date, a day's record and an empty day, and rejecting write requests.
- `backend/test/db.integration.test.ts` (real DB): before creation, before and after archiving, the day of archiving, the case of being created later and checked on a past date, the `Asia/Seoul` midnight boundary, the match between the calendar and the day's record, and the diary progress.
- `frontend/src/records.test.tsx` (screen): opening with this month and today, the weekday cell of the first day, showing archived routines and the diary, the empty day notice, no input elements and no write requests, month navigation, a fetch failure and retry, fetching again when returning to the screen, ignoring late responses, following today when the date changes, and keeping the chosen day.
- `frontend/src/app.test.tsx`: opening records from the menu.

## Verification

- Local (`TEST_DATABASE_URL` removed): format, lint, type checks, and build passed, the skill check 4 pass. Backend tests were 57 pass / 0 fail / 13 skip out of 70, and the 13 skips are DB integration tests. Frontend tests were 171 pass / 0 fail / 2 skip out of 173 with `--testTimeout=60000` (the skips are the same dark-mode-only shared tests as in the #7 record).
- Browser: connected the Vite dev server to an in-memory temporary API and checked with headless Chrome. There were no console errors. The screen connected to a real DB was not checked. The judgment of "a routine that existed on that day" is confirmed by the DB tests, not by the temporary API.
  - Mobile 390×844: no horizontal scroll (scrollWidth 390), calendar cell width 41px, cards in one column.
  - PC 1440×900: no horizontal scroll, cards in two columns.
  - Both sizes: opening with this month and today, the first day fits the weekday cell when moving to the previous month (2026-10-01 is a Thursday), selecting a date, showing archived routines and the diary, the empty day notice, and no input elements.

## Limits and follow-up

- The "Today's check" screen shows every routine not archived now, even for past dates, because a routine created later must be checkable on a past date. So the progress of that screen and the progress of the records screen can differ.
- Viewing weekly, 4-week, and 12-week checks: [#11](https://github.com/sirloinbh/plan-routine/issues/11).
- After choosing a calendar date, the keyboard focus stays in place and does not move to the record: [#41](https://github.com/sirloinbh/plan-routine/issues/41).

## Automated code review

- First: no problem blocking the merge and no error in the progress calculation. All 6 low findings and 1 addition were applied.
  - A "today" chosen automatically stayed even when the date changed. Until the user picks one directly, it follows the server's today. Added a test.
  - The height of empty calendar cells differed, so the date rows could be misaligned. The height is kept with a non-breaking space.
  - Fixed the heading structure. The empty day notice is h3, and the button was removed from the calendar heading. Added a test.
  - Added the weekday to the name of the calendar buttons.
  - A notice is shown while another day is being fetched, and the earlier error is cleared when a day is chosen. Added a test.
  - Added tests for late month and day responses, and fixed an assertion that was always true.
  - The "0/0 done" no longer appears on the diary screen for a date before the first routine was created.
  - Also fixed a problem found by looking at the screen before the review. A long routine name dropped to a different line from the display symbol.
- Second: confirmed the first follow-ups were applied. 2 follow-ups applied. The review ends at 2 rounds.
  - (Medium) Clicking a day that failed to load again on the calendar got stuck on "Loading" without a request. Clicking the same day fetches again. Added a test.
  - (Low) The display condition of the progress on the diary screen had no test. Added a test.
