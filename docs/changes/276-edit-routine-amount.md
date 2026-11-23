# #276 Edit a routine's unit and target amount (part 1)

- Issue: [#276](https://github.com/sirloinbh/plan-routine/issues/276)
- Branch: `feat/276-edit-routine-amount`
- Date: 2026-11-24 (Asia/Seoul)

## Purpose

#246 set a routine's unit and target amount only when the routine was added. This first part lets the unit and the target be changed, added or removed. Decision (user, 2026-11-24, Q2 B): a unit change or removal is allowed even when checks hold amounts; old amounts keep their numbers and show the new unit label, and are hidden (not deleted) while the routine has no unit. Editing weekdays and times per week is the next part (issue #276 stays open).

## Changes

- `backend/src/routine-routes.ts`: `PUT /api/routines/:id/amount` with `{ unit, targetAmount }`. It sends the whole setting, so repeating it changes nothing. A target needs a unit (400); removing the unit clears the target. Routines are locked `FOR UPDATE` while it is read and written.
- `backend/src/routines.ts`: the unit and target rules are shared with adding a routine (`routineUnit`, `routineTarget`), so both give the same English messages.
- `backend/src/check-routes.ts`, `record-routes.ts`: the checklist and the day record show an amount only while the routine has a unit.
- `backend/src/openapi.ts`, `docs/openapi.json`: the new route.
- Frontend: an "Amount" button on each routine opens a small form. The unit box is always editable, the target box appears once there is a unit, and a note says what happens to recorded amounts.

## Tests

`backend/test/routine-amount.test.ts` (new), `backend/test/db-amounts.integration.test.ts` (needs a DB), `frontend/src/routines.test.tsx`.

## Verification

See the PR.

## Limits and follow-up

- Still open in #276: editing weekdays and times per week (including switching between once a week and N times a week).
