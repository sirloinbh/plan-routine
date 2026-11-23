# #276 Edit a routine's target amount, and add a unit later (part 1)

- Issue: [#276](https://github.com/sirloinbh/plan-routine/issues/276)
- Branch: `feat/276-edit-routine-amount`
- Date: 2026-11-24 (Asia/Seoul)

## Purpose

#246 set a routine's unit and target amount only when the routine was added. This first part lets the target be changed or cleared, and a unit be added to a routine that has none. Editing weekdays or times per week, and changing a unit that is already set, depend on policy questions sent to the coordinator and are not part of this PR (issue #276 stays open).

## Changes

- `backend/src/routine-routes.ts`: `PUT /api/routines/:id/amount` with `{ unit, targetAmount }`. It sends the whole setting, so repeating it changes nothing. A unit that is set cannot change or be removed (409), because amounts recorded on checks would lose their meaning; a target needs a unit (400). Routines are locked `FOR UPDATE` while it is read and written.
- `backend/src/routines.ts`: the unit and target rules are shared with adding a routine (`routineUnit`, `routineTarget`), so both give the same English messages.
- `backend/src/openapi.ts`, `docs/openapi.json`: the new route.
- Frontend: an "Amount" button on each routine opens a small form. A routine without a unit takes a unit and then a target; a routine with a unit shows it as fixed text and takes only the target.

## Tests

`backend/test/routine-amount.test.ts` (new), `backend/test/db-amounts.integration.test.ts` (needs a DB), `frontend/src/routines.test.tsx`.

## Verification

See the PR.

## Limits and follow-up

- Still open in #276: editing weekdays and times per week, and changing an already set unit. See the issue comments for the options.
