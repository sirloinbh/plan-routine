# #8 12-week routines: resetting goals and retrospective

- Issue: [#8](https://github.com/sirloinbh/plan-routine/issues/8)
- Branch: `feat/8-twelve-week-goals`
- Date: 2026-11-01 (Asia/Seoul)

## Purpose

Set goals again every 12 weeks and look back on the past 12 weeks. A period is 84 days each, starting from the Sunday of the week that contains the app's first-use day (confirmed in #3).

## Confirmed rules (confirmed by the user, recorded in the #8 comment)

- Goals are not linked to daily or weekly routines. The link was split off into [#52](https://github.com/sirloinbh/plan-routine/issues/52).

## Detailed rules decided during implementation (recorded in the #8 comment)

- Goals can be added, edited, and deleted only in the current 12-week period. Goals of a past period stay as they are, and only the retrospective can be written or fixed.
- The retrospective is left for each goal of a past period as achieved, not achieved, or undecided, plus a memo (up to 1000 characters). Goals of a period in progress cannot be reviewed. If it is "undecided" and there is no memo either, it is treated as not reviewed yet.
- You can write new goals even without finishing the retrospective. Instead, the period to review is shown at the top of the screen.
- Deleting a goal of the current period asks for one more confirmation and really deletes it. It is not archived because no check records are attached.
- A goal name is up to 200 characters.
- The checklist item "목표 재설정" (reset goals) is put in only once by a migration. It does not reappear even if archived.

## Changes

- DB (`database/migrations/004_twelve_week_goals.sql`): the `twelve_week_goals` table and the checklist item "목표 재설정" (reset goals). Safe to run again. For an existing DB, apply it with the steps in `database/README.md`.
- API (`backend/src/goal-routes.ts`, `/api/goals`)
  - `GET`: the current period and the weeks left, the goals, and the goals and retrospectives by past period (from the latest period).
  - `POST`: add a goal to the current period. The server decides the period.
  - `PATCH /:id`, `DELETE /:id`: edit or delete only goals of the current period.
  - `PUT /reviews`: save the retrospectives of several goals in one transaction. If any one is invalid, all are cancelled.
- Screen (`frontend/src/twelve-week.tsx`, menu "12-week routines", `/twelve-week`): the order is the past period to review, this 12-week period's goals, the checklist and item management (reusing `PeriodRoutines`), and the past periods whose retrospective is done.
- `frontend/src/labeled-textarea.tsx`: moved the diary screen's input with a character count so it is also used by the retrospective memo.
- `frontend/src/use-date-change.ts`: moved the date change check (#44) of `use-checklist.ts` into a shared hook, used together with the goal screen.

## Tests

- `backend/test/goal-routes.test.ts` (API, fake pool): the response format and the weeks left, grouping past periods, a 400 with a user-facing message for input errors, a 404 for a missing goal, rejecting edits and deletes of past period goals, and rejecting and cancelling a retrospective of a period in progress.
- `backend/test/db.integration.test.ts` (real DB): re-running the migration and the constraints, exactly 1 item "목표 재설정" (reset goals), saving by period, moving to a review target in the next period, saving a retrospective and the transaction cancel, and rejecting a past period edit.
- `frontend/src/twelve-week.test.tsx` (screen): the period and weeks left, adding, editing, and the delete confirmation of goals, the empty name error, showing and saving the review target, keeping the input when saving fails, the display of a reviewed period, the item checklist, and retrying after a fetch failure.
- `frontend/src/app.test.tsx`: opening 12-week routines from the menu.

## Verification

- Local (`TEST_DATABASE_URL` removed): format, lint, type checks, and build passed, the skill check 4 pass. Backend tests were 49 pass / 0 fail / 12 skip out of 61, and the 12 skips are DB integration tests. Frontend tests were 151 pass / 0 fail / 2 skip out of 153 with `--testTimeout=60000` (the skips are the same dark-mode-only shared tests as in the #7 record).
- Browser: connected the Vite dev server to an in-memory temporary API and checked with headless Chrome. There were no console errors. The screen connected to a real DB was not checked. The period, weeks left, and rejection rules are confirmed by API and DB tests, not by the temporary API.
  - Mobile 390×844: no horizontal scroll (scrollWidth 390), cards in one column, long goals wrap.
  - PC 1440×900: no horizontal scroll.
  - Both sizes: the period to review shown at the top, saving the retrospective and its notice, adding a goal, and checking the item "목표 재설정" (reset goals). A long goal with no spaces also does not overflow (confirmed after the first review follow-up).

## Limits and follow-up

- Linking goals and routines: [#52](https://github.com/sirloinbh/plan-routine/issues/52).
- The goal order is fixed to the order added. Reordering is out of scope.
- If the migration is applied again after the item name was changed, "목표 재설정" (reset goals) is created anew. Reapplying happens only manually, so no tracking key was added.
- The notice when a review card moves appears at the top of the page, so it may not be visible when scrolled down. If the card position changes during a refetch, the keyboard focus is also lost: [#41](https://github.com/sirloinbh/plan-routine/issues/41).
- If you switch menus with an unsaved retrospective, the input is lost. It is the same problem as the diary's [#45](https://github.com/sirloinbh/plan-routine/issues/45).

## Automated code review

- First: no defect blocking the merge. 9 follow-ups applied.
  - (Medium) Right after saving a retrospective, the screen returned to the pre-save values, so saving again after a failed refetch could overwrite with the old values. The save response is reflected immediately. Added a test.
  - (Medium) If the period changed with the window kept on, only the goal card stayed in the past period. The date check of #44 was pulled out into a shared hook and used together. If a goal being edited disappears, it is announced. Added a test.
  - (Low) The save notice of the retrospective could remain or appear off-screen. It is cleared when saving starts, and shown at the top only when the card moves.
  - (Low) A long goal with no spaces overflowed the card. Fixed the wrapping and shortened the memo label to "Memo".
  - (Low) Input errors of the retrospective API showed English messages. Specified user-facing messages. Added a test.
  - (Low) A radio change while saving silently vanished. It is ignored while saving. Added a test.
  - (Low) Typing goals one after another erased the first characters. The input in between is kept. Added a test.
  - (Low) An empty retrospective also showed "Saved". It now says the retrospective is not finished, and the rule was written down. Added a test.
  - (Low) Filled test gaps (the number of refetches, period switching, reapplying after an archive). The case of reapplying after a rename was written in the limits.
- Second: no defect blocking the merge. Confirmed the 9 first-review follow-ups were applied.
  - Applied: also announce when undoing a finished retrospective moves a card up. Added a test.
  - Handed over: the problem that the notice of a moved card can be off-screen was added to the focus card [#41](https://github.com/sirloinbh/plan-routine/issues/41).
  - The review ends at 2 rounds.
