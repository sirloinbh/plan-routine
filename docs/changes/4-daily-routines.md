# #4 Managing daily routine items

- Issue: https://github.com/sirloinbh/plan-routine/issues/4
- Date: 2026-10-22 (Asia/Seoul)

## Purpose

Set and change daily routines directly, by category: wake up, exercise, diet, housework, management, study, and reading.

## Confirmed rules (confirmed by the user, recorded in the #4 comment)

- There are 7 fixed categories. User-defined categories are left as a follow-up.
- An item has only a name. Details such as a target time are left as a follow-up.

## Changes

- API (`backend/src/routine-routes.ts`, `/api/routines`)
  - `GET ?cadence=daily`: the list of routines that are not archived.
  - `POST`: add. It goes in at the last position of the same cadence and category. The first-use day is also recorded in the same SQL statement, so both are applied or both are cancelled (applying the #3 follow-up). If added concurrently, the order values can be the same, but they are sorted by id and renumbered at the next move.
  - `PATCH /:id`: rename.
  - `POST /:id/move {direction: up|down}`: swap places with the neighbor and renumber the group's order from 0. In one transaction it locks the group's rows in id order so that concurrent moves do not deadlock.
  - `POST /:id/archive`: archive. It leaves the list and the check records remain.
  - Validation errors are all a 400 with a user-facing message, and a missing routine is a 404 with a user-facing message. Even with no body, per-field messages are returned.
- Screen (`frontend/src/routines.tsx`, menu "Daily routines"): 7 category cards, with the item list, count, and empty state in each card, an add input, and up/down, edit, and archive buttons. Archiving runs only after pressing "Confirm archive" once more. Results are shown with `status`/`alert` notices.
- `frontend/src/api.ts`: a JSON request helper that throws the server's error message as it is.
- `backend/src/routines.ts`: split out the name schema `routineName`, used for both adding and editing.

## Tests

- `backend/test/routine-routes.test.ts` (API, fake pool): recording the first-use day and the parameters on add, user-facing input error messages (empty name, missing category, no body; no query is run), rename and 404, archive 404, 400 for an invalid id, direction, and cadence, and the cadence filter.
- `backend/test/db.integration.test.ts` (real DB): add 3 → check the order → move up → moving the top item up changes nothing → rename → archive an item that has checks → excluded from the list and checks kept → moving an archived item gives 404. The rows created and the first-use day are restored.
- `backend/test/app-ui.test.ts` (screen): the harness was extended to load `./x` modules (including tsx) and to handle input, form submit, and aria-label buttons. The empty state of the 7 categories, the add request body and the list update and input reset, the notices for an empty name and a server error with the input kept, and the move, edit, and archive confirmation flows.

## Verification

- Local `npm run check` → **exit 0**. Of 36 app tests, **31 pass / 0 fail / 5 skip** (after the first review follow-up), and the skill check 4 pass. The 5 skips are DB integration tests (no local DB), and the CI `verify` runs them against a real PostgreSQL.
- Browser: there is no local DB, so I connected the Vite dev server to **an in-memory temporary API with the same response format instead of the real API** (a scratch file outside the workspace), and checked with headless Chrome (DevTools protocol). I used this method because there was no Chrome extension connection.
  - Mobile 390×844: no horizontal scroll (scrollWidth 390), the 7 cards in one column, long names wrap, and the add, move up, edit form, and archive confirmation buttons were shown.
  - PC 1440×900: no horizontal scroll, and the cards were laid out in 3 columns.
  - The screen connected to a real DB could not be checked. API and DB behavior is checked by the CI DB integration tests.

## Limits and follow-up

- User-defined categories, target times, and restoring archived items are out of scope.
- The check API and the today checklist screen are built in #5.
- Returning keyboard focus after saving or cancelling a rename: #19.

## Automated code review

- First: no blocking defect. 5 follow-ups applied.
  - (Medium) Reload the list even when a move, edit, or archive fails. This fixes the problem where an item archived elsewhere stayed and kept failing. A UI test was added.
  - (Low) Added an ignore flag to the list request so a late earlier response does not overwrite the latest list.
  - (Low) Grouped adding a routine and recording the first-use day into one SQL statement (atomicity of multi-row changes in AGENTS.md). Added a first-use day check to the DB test.
  - (Low) Always render the notice area (`status`/`alert`) and gave the rename input `autoFocus`. Returning focus after save or cancel was split off to #19 because the harness does not support `useRef`.
  - (Low) Matched the fake API's move response in the UI test to the real format (`routines`) and verified the move request path and body.
- Second: nothing to improve. Confirmed the 5 first-review follow-ups were applied and the PostgreSQL behavior of the CTE (a data-modifying CTE that is not referenced also runs exactly once). The review ends at 2 rounds.
