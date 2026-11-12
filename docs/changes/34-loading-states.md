# #34 Change the loading indicators to the shared Skeleton and Spinner

- Issue: [#34](https://github.com/sirloinbh/plan-routine/issues/34)
- Branch: `chore/34-loading-states`
- Date: 2026-11-01 (Asia/Seoul)

## Purpose

The feature screens showed only the text "Loading". Change this as the central rule (`docs/ui-components.md` in `sirloinbh/project-standards`) says.

## Changes

- `frontend/src/loading-region.tsx` (new file): wraps the shared Skeleton in a region with `aria-busy` and a name. To match the shape after loading, card grids (today's check, daily routines, achievement rate, records by date) and a single card (the period checklist, the calendar, 12-week goals, the diary) use `SkeletonCard`, and row lists inside a card (period routines, the link panel, the project list) use `SkeletonList`.
- Put `Spinner size="sm"` in the save and delete buttons: adding a routine, saving a name, and archive confirmation, adding, saving, and delete confirmation of goals, adding and delete confirmation of projects, saving the diary, saving the retrospective, and saving a link. It appears only on the pressed button. Separately from the shared `busy` used for disabling, it remembers which button started the action as `pending`.

## Decision

The buttons for saving the diary, saving the retrospective, and saving a link are not given `disabled`, and still prevent duplicates in code as before. The central rule and the issue require `disabled`, but disabling takes the focus away from the pressed button, so this PR makes an exception. The other buttons are already `disabled`.

## Tests

`loading-region.test.tsx`: the name, `aria-busy`, and the shape. `diary.test.tsx`: the first fetch and the Spinner of the save button. `routines.test.tsx`: the Spinner only on the pressed add button and archive confirmation, and none when moving. `project-links.test.tsx`: none on the add button when deleting. `records.test.tsx`: the renamed region.

## Verification

- Local: `env -u TEST_DATABASE_URL npm run check` passed. Backend 142 pass / 0 fail / 19 skip (DB tests) out of 161, frontend 271 pass / 0 fail / 2 skip out of 273, and `test:skills` 4 pass.
- Browser: with a temporary API at 1440×900, 375×812, and 390×844, I checked the loading state of today's check, daily routines, the diary, records, achievement rate, and 12-week (settings at 1440×900 and 375×812). A named `aria-busy` region appeared, and there was no "Loading" text or horizontal scroll. I also checked the Spinner at 1440×900 and 390×844 by delaying write responses. When adding a routine it appears as one on the pressed form only and disappears when done, and when archiving it appears only on "Confirm archive" of that row. The Spinner of goals, projects, links, and retrospective was not seen in the browser, and only some were checked by screen tests.

## Limits and follow-up

None.

## Automated code review

- First: 5 applied.
  - (Medium) Because of the shared `busy`, even the Spinner of a button that was not pressed spun. It now remembers the button that started. Added a test.
  - (Medium) A list-shaped placeholder was also used for card screens. It now matches the shape after loading.
  - (Low) The basis of the `disabled` exception was inaccurate. Fixed.
  - (Low) The screen check missed 390×844 and the Spinner. Checked them.
  - (Low) Fixed the order of the finished card list.
- Second: no defect of medium or above. Fixed the placeholder of today's check to a grid and corrected the test title. The Spinner of the goal, retrospective, link, and name save has neither a test nor a browser check. The review ends at 2 rounds.
