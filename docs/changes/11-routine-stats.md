# #11 Viewing history and achievement rate per routine

- Issue: [#11](https://github.com/sirloinbh/plan-routine/issues/11)
- Branch: `feat/11-routine-stats`
- Date: 2026-11-01 (Asia/Seoul)

## Purpose

See by period how steadily routines were kept, and improve through feedback.

## Confirmed rules (confirmed by the user, recorded in the #11 comment)

- The denominator of the achievement rate includes only items that were active in that period. Periods before creation and after archiving are excluded.
- A streak display is not added this time.

## Detailed rules decided during implementation (recorded in the #11 comment)

- The status per period is decided in the following order. Dates are based on `Asia/Seoul`.
  - If there is a check in that period, it is **Done**.
  - If the item was not yet created before the period ended, or was archived before the period ended, it is **Not applicable**. This is the same basis as "a routine that existed on that day" in #10.
  - If the period has not ended yet, it is **In progress**. It is not put in the denominator. If it is done, it is put in.
  - Otherwise it is **Not done**.
- The achievement rate is done ÷ (done + not done). If the denominator is 0, it is "No data", not 0%.
- The range shown: for daily routines, the latest 8 weeks and 6 months, and per item the latest 14 days. Weekly is the latest 8 weeks, 4-week is the latest 6 periods, and 12-week is the latest 4 periods.
- An archived item that has no applicable period in the range is removed from the list.

## Changes

- `backend/src/routine-stats.ts`: the aggregation rules. It is a function that does not use the DB, so boundary cases are checked by unit tests.
- API (`backend/src/stats-routes.ts`): `GET /api/stats`. The achievement rate per cadence and the history per item.
- Screen (`frontend/src/stats.tsx`, menu "Achievement rate", `/stats`): the achievement rate per cadence and the history per item. It is read-only.
  - Visualization: the ratio bar uses a single color, with the number written beside it. The statuses in the history are not told apart by color alone but also with symbols, and opening "View by period" under a row shows the periods and statuses as text. The same content can be read by touch, keyboard, and screen reader.

## Tests

- `backend/test/routine-stats.test.ts` (unit, API): the boundaries of the status judgment (the creation day, the archive day, in progress, check first), the weekly and monthly aggregation of daily routines and today, month boundaries and year end, the period boundary of long cadences, the history per item, including and excluding archived items, and the range fetched.
- `backend/test/db.integration.test.ts` (real DB): the `Asia/Seoul` boundary of the creation day and archive day, aggregation per cadence, and keeping the checks of an archived item.
- `frontend/src/stats.test.tsx` (screen): the achievement rate and numbers, the difference between "No data" and 0%, the order of the history per item and the status names, the archived display, the empty state, the bar length, rounding not being shown wrongly as 0% or 100%, read-only, a fetch failure and retry, fetching again on returning to the screen and on a date change, and ignoring late responses.
- `frontend/src/app.test.tsx`: opening achievement rate from the menu.

## Verification

- Local (`TEST_DATABASE_URL` removed): format, lint, type checks, and build passed, the skill check 4 pass. Backend tests were 70 pass / 0 fail / 14 skip out of 84, and the 14 skips are DB integration tests. Frontend tests were 186 pass / 0 fail / 2 skip out of 188 with `--testTimeout=60000` (the skips are the same dark-mode-only shared tests as in the #7 record).
- Browser: connected the Vite dev server to a temporary API and checked with headless Chrome. There were no console errors. The screen connected to a real DB was not checked. The numbers of the temporary API are for checking the screen, and the aggregation rules are confirmed by unit and DB tests.
  - Mobile 390×844: no horizontal scroll (scrollWidth 390), no line overflow, cards in one column.
  - PC 1440×900: no horizontal scroll, cards in two columns.
  - Both sizes: the distinction between the achievement rate per cadence and "No data", the history cells per item (symbols and legend), and the archived display.

## Limits and follow-up

- Old periods outside the range cannot be seen. Records by date are viewed on the "Records" screen.

## Automated code review

- First: no bug producing a wrong value in the aggregation rules. 6 follow-ups applied and 1 split off.
  - (Medium) The date and status of a history cell showed only on mouse hover, so touch and keyboard users could not know them. Added a text list with "View by period". Fixed the test.
  - (Low to medium) 216/217 was shown as 100% and 1/217 as 0%. It now shows at least 1% when there is a done item and at most 99% when there is a not-done item. Added a test.
  - (Low) The status name depended only on the item's `aria-label`. Replaced it with the text list.
  - (Low) The DB test was affected by other routines left in the DB, and its cleanup was outside `try`. It now checks only the increase and the cleanup was moved inside `try`.
  - (Low) With the same order value, it sorted by text order. This API was changed to sort by number.
  - (Trivial) Merged the `shiftMonth` duplicate into `periods.ts`.
  - Split off: another API with the same sorting pattern [#60](https://github.com/sirloinbh/plan-routine/issues/60).
- Second: no bug producing a wrong value. Confirmed the 6 first-review follow-ups were applied. All 4 low findings applied. The review ends at 2 rounds.
  - Fixed the wrapping of long names and the touch area of "View by period".
  - Removed an unneeded option in the test, and checked that the symbol cell is not exposed to the screen reader.
  - Updated the next-steps document.
