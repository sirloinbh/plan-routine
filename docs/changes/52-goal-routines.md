# #52 Link 12-week goals to daily and weekly routines

- Issue: [#52](https://github.com/sirloinbh/plan-routine/issues/52)
- Branch: `feat/52-goal-routines`
- Date: 2026-11-01 (Asia/Seoul)

## Purpose

Make it possible to see which routine is for which goal. This is the card split off from #8.

## Decisions

The user said to proceed with the recommendations for the choices, so the following was decided. It was recorded in the issue comment.

- Link several daily and weekly routines to one goal. One routine can also be linked to several goals.
- Link and unlink only on goals of the current period. It is not shown on past period cards.
- An archived routine drops out of the list and cannot be newly linked.
- If a goal is deleted, the links are also deleted. The routines and check records stay as they are.
- It is not reflected in the achievement rate or the check screens.

## Changes

- `database/migrations/005_goal_routines.sql`: the `twelve_week_goal_routines` table. **This migration must be applied to an existing DB.**
- `backend/src/goal-routes.ts`: added `routines` to the current period goals of `GET /api/goals`, and added `PUT /api/goals/:id/routines`. It replaces everything in one transaction. If even one routine cannot be linked, nothing is changed.
- `frontend/src/goal-routine-links.tsx` (new file), `twelve-week.tsx`: shows the linked routines for each goal, and saves after checking them in "Link routines".

## Tests

- `backend/test/goal-routes.test.ts`: replacing, rejecting, a missing goal and a past goal, and invalid input.
- `backend/test/db.integration.test.ts`: on a real DB, re-running the migration, replacing, keeping on rejection, archiving, and deleting a goal.
- `frontend/src/goal-routine-links.test.tsx`, `twelve-week.test.tsx`: display, saving, failure, closing, and focus.

## Verification

- Local: `env -u TEST_DATABASE_URL npm run check` passed. Backend 88 pass / 0 fail / 16 skip (DB tests) out of 104, frontend 250 pass / 0 fail / 2 skip (dark-mode-only shared tests) out of 252, and `test:skills` 4 pass.
- Browser: with a temporary API and headless Chrome at PC 1440×900 and mobile 390×844, I checked opening, checking, saving, and returning focus with the real Enter and Space keys. A long name did not overflow either, and there were no console errors or horizontal scroll. It was not checked with a real DB, a real screen reader, or a real phone.
- Real DB in CI: the new DB tests passed on the first commit, and all 104 passed with no skip.

## Limits and follow-up

- You cannot see which routines a past period goal was linked to. It is saved.
- The routine-side screens do not show which goal it is linked to.
- If the goal disappears while the panel is open, or you press "Edit" on the same row, the checks disappear. Split off as [#76](https://github.com/sirloinbh/plan-routine/issues/76).

## Applying

For a DB already in use, apply `005_goal_routines.sql` directly with the steps in `database/README.md`. If it is not applied, `GET /api/goals` fails. A new Docker volume applies it automatically on first start. The automatic apply by the deploy script does not work yet because the repository has no runner ([#75](https://github.com/sirloinbh/plan-routine/issues/75)).

## Automated code review

- First: 8 follow-ups and a record error were applied, and 2 were split off. In the review, I ran the SQL directly on a temporary PostgreSQL and found no problem.
  - (Normal) A routine archived elsewhere stayed in the selection and saving kept being rejected. It is cleaned up when the list is received and when saving fails. Added a test.
  - (Normal) The save response was discarded, so if the refetch failed the old links were shown and could be saved back. The response is reflected immediately. Added a test.
  - (Normal) On touch screens the touch areas of the checkboxes overlapped. Increased the row height. I could not check with a real device.
  - (Low) A list load failure took the focus from a user who moved elsewhere. Fixed it and added a test.
  - (Low) If saving failed after pressing close during the save, the focus was lost. Close is ignored while saving. Added a test.
  - (Low) The earlier notice stayed even when a panel action started. It is cleared. Added a test.
  - (Low) In the rejection path, one connection was held while waiting for another. It uses the same connection.
  - (Low) Fixed an assertion that did not check the order.
  - (Low) The record saying the deploy script applies it automatically was wrong. Fixed.
  - Split off: no migration runner [#75](https://github.com/sirloinbh/plan-routine/issues/75), and the goal changing while the panel is open [#76](https://github.com/sirloinbh/plan-routine/issues/76).
- Second: no code defect. 1 low finding was applied: 005 was missing from the migration list of the next-steps document. During the review, under heavy load, the focus test in `routines.test.tsx` failed intermittently (reproduced 1 of 9 parallel runs). It was a case where the default 1 second of `waitFor` ended right after the screen updated, and after raising the wait to 10 seconds all 12 runs passed under the same load. The app code was not changed. The review ends at 2 rounds.
