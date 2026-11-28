# Add the Mandalart data model and API (#345)

## Purpose

The app had no Mandalart (a 9x9 goal chart: one main goal, 8 sub-goals, 8 actions per sub-goal). This adds the storage and the API; the screens come in #346 and #347.

## Changes

| File                                             | Change                                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `database/migrations/015_mandalarts.sql`         | `mandalarts` (title 1-100) and `mandalart_cells` (block 0-8, position 0-8, text up to 100, cascade)    |
| `backend/src/mandalart-routes.ts`                | list, get, create, rename, `PUT /:id/cells`, delete                                                    |
| `backend/src/app.ts`, `backend/src/openapi.ts`   | mount `/api/mandalarts`, describe the routes; `docs/openapi.json` regenerated                          |
| `backend/test/mandalart-routes.test.ts`          | unit tests with a fake pool (validation, 404, mirroring, one transaction)                              |
| `backend/test/db-mandalarts.integration.test.ts` | DB tests: migration re-run and limits, 81-cell round trip, mirroring, rename, delete cascade           |
| `backend/test/db-export.integration.test.ts`     | the JSON export must contain both new tables (the export reads every table, so no export code changed) |

## Decisions

- **Always store all 81 cells** (user decision relayed by the coordinator, option B on #345). Creating a Mandalart inserts 81 rows with empty text; `PUT /:id/cells` only changes their text. The alternative (store only non-empty cells) was not chosen.
- The grid is `cells[block][position]`. Block 4 position 4 is the main goal, block 4 holds the 8 sub-goals, and the centre of every other block repeats its sub-goal. The server copies the centres from block 4 on every save and on every read, so a client-sent centre is ignored and the grid cannot drift.
- `filledCount` in the list counts the non-empty cells the grid shows.

## Verification

See the PR for the `npm run check` result. DB integration tests run only with `TEST_DATABASE_URL`; none was available on this machine, so they were verified by CI.
