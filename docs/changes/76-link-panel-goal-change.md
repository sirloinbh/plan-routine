# #76 Announce when a goal changes while the routine link panel is open

- Issue: [#76](https://github.com/sirloinbh/plan-routine/issues/76)
- Branch: `fix/76-link-panel-goal-change`
- Date: 2026-11-01 (Asia/Seoul)

## Purpose

If the goal disappeared while the panel was open, the checks were discarded without a notice and the focus went to `body`. Pressing "Edit" on the same row also made the checks disappear.

## Decision

The user said to proceed with the recommendations for the choices, so the following was decided. The issue said to lift the open state up to `CurrentGoals`, but it could be fixed more simply, so the panel's state was left as it is. It was recorded in the issue comment.

- Keep the panel together with the edit screen. Even if the name is fixed, the checks stay.
- If the goal disappears, announce it and move the focus to the "New goal" input. On a touch screen, it is not moved to the input.

## Changes

`frontend/src/twelve-week.tsx`, `goal-routine-links.tsx`.

## Tests

`frontend/src/twelve-week.test.tsx`: the notice and focus when the goal disappears, no notice for a closed panel, the panel being edited and the checks kept, a goal deleted in this tab, several panels, the case of losing both the edit and the panel, and a changed name.

## Verification

- Local: `env -u TEST_DATABASE_URL npm run check` passed. Backend 144 pass / 0 fail / 19 skip (DB tests) out of 163, frontend 304 pass / 0 fail / 2 skip out of 306, and `test:skills` 4 pass.
- Browser: with a temporary API and headless Chrome at 1440×900 and 390×844, I pressed edit with the panel open, and confirmed that the focus goes to the input and the checks stay. There was no horizontal scroll or console error. The case where the goal disappears was checked only by screen tests.

## Limits and follow-up

None.

## Automated code review

- First: 4 applied. (Medium) For a goal deleted in this tab with the panel open, a failure notice appeared and the success notice disappeared. Fixed it and added a test. (Low) Only one notice remained. What was lost is now gathered into one message. (Low) It announced with the old name. Fixed. (Low) There was no test for a panel closed by a save or fetch failure. Added one.
- Second: no defect to fix. Notices overlapping each other when another action is in progress is a rare race that comes from the existing design where only one notice is shown, so I left it. The review ends at 2 rounds.
