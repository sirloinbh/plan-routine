# #44 Move checks to the new period when the date or week changes with the screen kept on

- Issue: [#44](https://github.com/sirloinbh/plan-routine/issues/44)
- Branch: `fix/44-date-rollover`
- Date: 2026-10-31 (Asia/Seoul)

## Purpose

If a PC window is kept on past midnight, the event of the screen becoming visible again may not occur. Then the next check was saved to a past date or a past period, and on the weekly and 4-week screens it could not be undone.

## Changes

`frontend/src/use-checklist.ts` (applied together to today's check, weekly, 4-week, and the "4-week routines ending soon" card)

- Date change detection: every minute, and when the window gets focus, it checks the service date (`Asia/Seoul`) from the device clock, and if it differs from the day last fetched, it fetches again. If the date is the same, no request goes to the server. However, if the fetch failed for a temporary reason (a connection failure, a 5xx) or the server's today differs from the device's, it fetches again every minute.
- Check before saving: on a screen that follows today, if the date has changed and the period being viewed has also ended, it does not save. Instead, it fetches anew and says "The date changed, so the new period was loaded. Please check again."
- If only the date changes within the same week or the same 4 weeks, the check is saved as it is. The server saves by the period start date, so the result is the same.
- While the user is looking at a past date they chose, saving is not blocked.

So that it works even if the device clock is a little fast, it looks at whether the date changed after fetching, not at the clock's date itself, and if the server's today differs from the device's, it checks again. Which date is today is still decided by the server.

## Tests

- `frontend/src/daily-checklist.test.tsx`: the first check after midnight is not saved and the new date is shown, then the next check is saved with the new date, showing the new date by the 1-minute check and by focus, no extra request if the date is the same, a chosen past date does not block saving, automatic retry of a failed refetch, keeping the notice of a click rejected after a failure, and not re-requesting a date outside the range every minute.
- `frontend/src/period-routines.test.tsx`: the first check after the week changes is saved to the new week, if only the date changes within the same week it is saved as it is, the first check after a 4-week period ends is not saved to the past period, and reaching the new week even if the device clock is fast.
- `frontend/src/four-week-due.test.tsx`: not saving to the past period on the "ending soon" 4-week card either, and no notice remains if there is no card in the new period.

## Verification

- Local (`TEST_DATABASE_URL` removed): format, lint, type checks, and build passed. Frontend tests were 133 pass / 0 fail / 2 skip out of 135 with `--testTimeout=60000` (the skips are the same dark-mode-only shared tests as in the #7 record). The backend did not change.
- Browser: connected the Vite dev server to an in-memory temporary API and checked with headless Chrome. I moved the clock of the open page and the date of the temporary API from Saturday to Sunday. There were no console errors. The screen connected to a real DB was not checked.
  - Mobile 390×844 and PC 1440×900: the first click was not saved, and the new week (2026-11-01 to 2026-11-07) and the notice appeared. The next click was saved to the new week. No horizontal scroll.
  - The 1-minute check and the focus behavior were checked only by screen tests.

## Limits and follow-up

- Until it fetches again, a past period may be visible on the screen for a short time (usually up to 1 minute). A check pressed then is not saved and a notice appears. However, if the device clock is a little faster than the server, a check pressed after the server's midnight until the next check (up to about 1 minute) may be saved to the past period.
- If the device clock is slower than the server, the date change is not noticed by that difference, so a check in between may be saved to the past period. This is the limit of this method that looks only at the device clock.
- On a device whose clock is wrong by several days, the refetch continues every minute.
- The diary screen is not a target. The saved date is shown in the title and any date can be fixed (the #9 limit).

## Automated code review

- First: 5 applied.
  - (High) If the device clock was faster than the server, the past period fetched again at midnight stayed fixed all day and #44 recurred. If the server's today differs from the device's, it checks again a minute later. Added a test.
  - (Medium) If the refetch after midnight failed, it did not retry automatically. It retries a minute later. Added a test.
  - (Low) The notice of a click rejected after a fetch failure was cleared right away. The notice is kept. Added a test.
  - (Low) If there was no card in the new period, only "Please check again" stayed forever. If there is no card, only the error is shown. Added a test.
  - (Low) Fixed an inaccurate sentence in the record and wrote the limit of a device with a slow clock.
- Second: no defect blocking the merge. Confirmed the 5 first-review follow-ups were applied. 2 of 3 low findings were applied.
  - It re-requested the 400 for a date outside the range every minute. Only temporary failures are retried. Added a test.
  - Wrote the short gap when the device clock is a little fast in the limits and fixed the comment.
  - Not applied: if the window is kept on for more than 3 weeks, a hidden notice may be shown together with the next card. Only the wording is off, and saving is not affected.
  - The review ends at 2 rounds.
