# #9 Writing a diary (feedback on today)

- Issue: [#9](https://github.com/sirloinbh/plan-routine/issues/9)
- Branch: `feat/9-diary`
- Date: 2026-10-31 (Asia/Seoul)

## Purpose

At the end of the day, leave the day's feedback as a diary. Show the progress of the routines checked that day alongside, to help with writing.

## Confirmed rules (confirmed by the user, recorded in the #9 comment)

- The diary is one entry per day. Saving again on the same date is handled as an edit.
- The fields are a free body (required) and optional fields (what went well, what fell short, and what to do tomorrow).
- Writing and editing past dates is allowed with no period limit, and only future dates are blocked.

## Detailed rules decided during implementation (recorded in the #9 comment)

- The maximum length is 5000 characters for the body and 1000 characters for each optional field.
- If there is unsaved content, the date is not moved and saving is announced first.
- PostgreSQL has no year 0000, so the lower bound was set to 2000-01-01. A date earlier than this gives a 400 with a user-facing message.
- Progress uses the daily routines that are not archived now as the total, and counts how many of them were checked that day.

## Changes

- DB (`database/migrations/003_diary.sql`): `diary_entries`, with the date as the primary key. Safe to run again. For an existing DB, apply it with the steps in `database/README.md`.
- API (`backend/src/diary-routes.ts`)
  - `GET /api/diary?date=`: the diary of a date, the daily routine progress, and the previous and next dates. If the date is omitted, it is the server's today.
  - `PUT /api/diary/:date`: save. It trims the surrounding whitespace and saves an empty optional field as `null`.
- Screen (`frontend/src/diary.tsx`, menu "Diary", `/diary`): the body and 3 optional fields, progress, date navigation, and save.
  - If there is unsaved content, the date is not moved and saving is announced.
  - Even if saving fails, the text typed stays as it is.
- Added a "Write today's diary" link to the "Today's check" screen.

## Tests

- `backend/test/diary-routes.test.ts` (API, fake pool): the defaults and the neighboring dates, a day with no diary, whitespace cleanup and empty optional fields, a per-date upsert in the save SQL, a 400 with a user-facing message for an empty body, too long text, and a wrong type, allowing the maximum length, a 400 for a future, too early, or nonexistent date, and the lower-bound date.
- `backend/test/db.integration.test.ts` (real DB): re-running the migration, the constraints, one entry per date and editing, concurrent saves, past dates, and the progress count.
- `frontend/src/diary.test.tsx` (screen): the progress and the empty form, the save request and keeping it after a fresh fetch, editing an existing diary, keeping the text when saving is rejected or fails, writing a past date and separation by date, blocking navigation when unsaved, and retrying after a navigation or first-load failure.
- `frontend/src/app.test.tsx`: opening the diary from the menu, and going to the diary from today's check.

## Verification

- Local check (`TEST_DATABASE_URL` removed): format, lint, type checks, and build passed, the skill check 4 pass. Backend tests were 38 pass / 0 fail / 8 skip out of 46, and the 8 skips are DB integration tests. All 87 frontend tests passed with `--testTimeout=60000`. This PC can hit a timeout with the default 5-second limit (see the #5 record).
- Real DB behavior is confirmed by the DB integration tests in CI.
- The browser check was done again after the first follow-up (the character count display and the notice position), with the same result.
- Browser: connected the Vite dev server to an in-memory temporary API and checked with headless Chrome. There were no console errors. The screen connected to a real DB was not checked.
  - Mobile 390×844: no horizontal scroll (scrollWidth 390), input width 308px.
  - PC 1440×900: no horizontal scroll.
  - Both sizes: entering by the link on today's check, a user-facing error when saving an empty body, blocking date navigation with a notice when unsaved, whitespace cleanup and the notice after saving, and kept after a refresh. On PC, saving a past date was also checked.

## Limits and follow-up

- If you go to another menu or close the tab without saving, the input is lost. Only date navigation is blocked: [#45](https://github.com/sirloinbh/plan-routine/issues/45).
- If the screen is kept open past midnight, it is saved as the diary of the earlier date until fetched again. The date is shown in the title.
- If you refresh while looking at a past date, it goes back to today.
- The progress is not based on that day. Even for a date before the routines were created, the current number of routines appears as the total, and a routine archived later drops out of the count of past days. Counting based on that day is handled in #10.
- Responses for broken JSON, an oversized body, and an array body stay as the existing behavior: [#47](https://github.com/sirloinbh/plan-routine/issues/47).
- Keyboard focus on date navigation and on a save error: [#41](https://github.com/sirloinbh/plan-routine/issues/41).
- The date can be moved only one at a time. Viewing by date is handled in #10.

## Automated code review

- First: no problem that breaks saved data. 5 follow-ups applied and the follow-up work handed to issues.
  - (Medium) When text over the limit was pasted, the browser silently cut it. The input limit attribute was removed and the character count is shown, so the server's 400 with a user-facing message appears and the text stays. Added a test.
  - (Low) Text containing a NUL character became a 500. It is now rejected with a 400 with a user-facing message. Added a test.
  - (Low) The save result could appear off-screen. It is now shown next to the save button. Added a test.
  - (Low) The lock during loading and saving and ignoring late responses had no test. Added tests. Also added a check of the check response status and saving the maximum length to the DB test.
  - (Low) Recorded the rules the user confirmed and the rules decided during implementation separately. Also wrote the progress basis in the limits.
  - Handed over: the request body error response [#47](https://github.com/sirloinbh/plan-routine/issues/47), focus [#41](https://github.com/sirloinbh/plan-routine/issues/41), progress based on that day [#10](https://github.com/sirloinbh/plan-routine/issues/10).
- Second: no defect to fix. Confirmed the 5 first-review follow-ups were applied. The review ends at 2 rounds.
