# Move the 12-week goals onto the plans model (#344)

## Purpose

`twelve_week_goals` duplicated the `twelve_week` plans from #341. The 12-week page now reads and writes plans of the `twelve_week` horizon, so there is one source of plans.

## Decision

One table (option A on the card). The goals tables are **copied, not dropped**: the old tables stay in the database, unused, for one release, so the change can be reversed and no data is lost. A later card drops them after a backup.

## Changes

| File                                                                                                                                     | Change                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `database/migrations/016_goals_on_plans.sql`                                                                                             | Adds `achieved`, `review_note`, `reviewed_at` and `legacy_goal_id` to `plans`, a `plan_routines` link table, and copies every goal and its routine links. Safe to re-run: `legacy_goal_id` makes the copy once per goal                                                         |
| `backend/src/goal-routes.ts`                                                                                                             | `/api/goals` reads and writes `plans` with `horizon = 'twelve_week'` and `plan_routines`. The API shape is unchanged. A review also sets the plan status: met is done, not met is dropped, cleared goes back to planned (an in-progress plan with only a note keeps its status) |
| `backend/test/goal-routes.test.ts`, `db-goals.integration.test.ts`, `db-routines.integration.test.ts`, `db-baseline.integration.test.ts` | Tests follow the new tables; a new DB test covers the copy (fields, status, links, re-run, old tables untouched)                                                                                                                                                                |

## Notes

- Goal ids change: a copied goal gets a new plan id (`legacy_goal_id` keeps the old one). The page does not store goal ids.
- Status of copied goals: achieved is done, not achieved is dropped, not reviewed is planned.
- The data export lists every public table, so `plans` and `plan_routines` are exported and the old tables still are until dropped.
- `/api/goals/:id` only accepts plans of the `twelve_week` horizon in the current period, as before.
- `docs/openapi.json` does not change: the routes and bodies are the same.
- Back up the database before the deploy that applies migration 016 (the user decides about production).

## Verification

- Goal, plan and openapi unit tests: 27 passed.
- DB integration tests run in CI (no local database in this lane).
- `npm run check`: see the PR.
