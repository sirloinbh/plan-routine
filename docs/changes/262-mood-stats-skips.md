# Leave skipped days out of the mood table's completion rate (closes #262)

## Purpose

Since #243 the records calendar, the day record and the stats page leave a skipped routine period out of both counts. The weekly mood table (#247) did not, so a week with skipped days showed a lower rate there than on the stats page.

## Changes

| File                                             | Change                                                                                                                      |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `backend/src/mood-stats-routes.ts`               | The expected count of a day excludes routines skipped that day (same `NOT EXISTS routine_skips` rule as `record-routes.ts`) |
| `backend/test/mood-stats-routes.test.ts`         | The SQL carries the skip rule                                                                                               |
| `backend/test/db-mood-stats.integration.test.ts` | A skipped day lowers the week's total by one and leaves its checks (runs in CI only)                                        |

## Verification

- `npm run check`; the DB test is skipped locally (no `plan_test`) and runs in CI.
