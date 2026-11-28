# Add the plans data model and API for four horizons (#341)

## Purpose

The app had routines and 12-week goals only. The owner needs plans on four horizons: week (1 week), twelve_week (12 weeks), year (52 weeks) and decade (10 years). This card adds the table and the API; the page comes in #342 and #343.

## Changes

| File                                                                                  | Change                                                                                                                                                              |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `database/migrations/014_plans.sql`                                                   | New `plans` table with CHECKs for horizon, title (1-200), description (max 2000), status, and the period start (Sunday for week-based horizons, Jan 1 for a decade) |
| `backend/src/periods.ts`                                                              | `planPeriodFor`: week, twelve_week and year periods run in whole weeks from the routine anchor (7, 84, 364 days); a decade runs 10 calendar years from Jan 1        |
| `backend/src/plan-routes.ts`                                                          | `GET/POST /api/plans`, `PATCH/DELETE /api/plans/:id` with zod validation; each change writes an `audit_log` row in the same transaction                             |
| `backend/src/app.ts`, `backend/src/openapi.ts`, `docs/openapi.json`                   | Route mount and the four operations                                                                                                                                 |
| `backend/test/plan-routes.test.ts`, `db-plans.integration.test.ts`, `periods.test.ts` | Unit tests with a fake pool, DB tests (skipped without `TEST_DATABASE_URL`), period tests                                                                           |

## Decisions

- `GET /api/plans?horizon=<h>[&periodStart=<date>]`: `horizon` is required. Any date names the period that holds it; without it the period holding today is used. The answer is `{ horizon, period, plans }`, and each plan carries `periodStart` and `periodEnd`.
- `POST` and `PATCH` snap a given `periodStart` to the start of its period, so a client cannot store an unaligned period. For a decade, the owner picks the year; the period starts on Jan 1 of it. The default is the current period (the current calendar year for a decade).
- The horizon of a plan cannot change; `PATCH` changes title, description, status or period. Moving a plan to another period puts it at the end of that period's list.
- `twelve_week_goals` is untouched (as the card says); #344 moves it.
- Dates are limited to 2000-01-01 to 2999-12-31 so a decade end stays a four-digit year.

## Verification

- `./node_modules/.bin/tsx --test` for `plan-routes`, `periods` and `openapi` tests: 24 passed.
- DB integration tests need `TEST_DATABASE_URL`; there was no local database in this lane, so they run in CI.
- `npm run check`: see the PR.
