# Move the 12-week goals onto the plans model (#344)

## Purpose

`twelve_week_goals` duplicated the `twelve_week` plans from #341. The 12-week page now reads and writes plans of the `twelve_week` horizon, so there is one source of plans.

## Decision

One table, and the old tables are dropped (option B on the coordinator's list; user decision relayed 2026-11-28). Migration 016 copies every `twelve_week_goals` row, its review answers and its `twelve_week_goal_routines` links into `plans` and `plan_routines`, then drops both old tables in the same migration (one transaction, so a failed copy leaves them in place). **The drop cannot be undone: take a database backup before this migration is applied.** `legacy_goal_id` on each copied plan keeps the old goal id.

## Changes

| File                                                                                                                                     | Change                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `database/migrations/016_goals_on_plans.sql`                                                                                             | Adds `achieved`, `review_note`, `reviewed_at` and `legacy_goal_id` to `plans`, a `plan_routines` link table, and copies every goal and its routine links. Copies goals and links, then drops both old tables. A re-run after the drop does nothing (the copy runs only while the old tables exist, once per goal through `legacy_goal_id`) |
| `backend/src/goal-routes.ts`                                                                                                             | `/api/goals` reads and writes `plans` with `horizon = 'twelve_week'` and `plan_routines`. The API shape is unchanged. A review also sets the plan status: met is done, not met is dropped, cleared goes back to planned (an in-progress plan with only a note keeps its status)                                                            |
| `e2e/accessibility.spec.ts`                                                                                                              | `/plans` added to the `screens` list                                                                                                                                                                                                                                                                                                       |
| `e2e/accessibility.spec.ts`                                                                                                              | `/plans` added to the `screens` list                                                                                                                                                                                                                                                                                                       |
| `backend/test/goal-routes.test.ts`, `db-goals.integration.test.ts`, `db-routines.integration.test.ts`, `db-baseline.integration.test.ts` | Tests follow the new tables; a new DB test recreates the old tables with data, runs 016 and shows the copied plans and links are intact after the drop, the old tables are gone, and a re-run is harmless; the baseline test expects the old tables to be absent                                                                           |

## Notes

- Goal ids change: a copied goal gets a new plan id (`legacy_goal_id` keeps the old one). The page does not store goal ids.
- Status of copied goals: achieved is done, not achieved is dropped, not reviewed is planned.
- The data export lists every public table, so `plans` and `plan_routines` are exported; the old tables no longer exist.
- `/api/goals/:id` only accepts plans of the `twelve_week` horizon in the current period, as before.
- `docs/openapi.json` does not change: the routes and bodies are the same.
- Do not merge before the user has backed up the production database; a merge to `main` may autodeploy the migration.

## Verification

- Goal, plan and openapi unit tests: 27 passed.
- DB integration tests run in CI (no local database in this lane).
- `npm run check`: see the PR.
