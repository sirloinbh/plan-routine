# #780 Ids are numbers

plan-routine returns and accepts number ids like the other apps (project-standards ADR-0025, issue #780).

## Change

- Backend: the 9 `id::text` casts are gone; `setInt8Parser` (managed `standard/db.ts`) makes pg return BIGINT ids as numbers and throws above 2^53.
- Path ids use `pathId` (`ID_PATTERN`, at most 15 digits, no leading zero) and body ids use `bodyId` (integer, 1 to 999999999999999), both in `backend/src/ids.ts`. This replaces the `^\d{1,18}$` string patterns.
- OpenAPI: path `id` is an integer; `docs/openapi.json` regenerated.
- Frontend: all id types are `number`; the project-link select converts its value with `Number`.
- Tests: ids in fixtures and expectations are numbers; a string id in a body is now the invalid case.

## Contract change

Clients that sent ids as strings in request bodies (`projectLinkId`, `routineIds`, review `id`) must now send numbers. Responses return numbers. Path ids are unchanged (digits in the URL). The frontend and backend change in the same PR.

## Checks

- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run contract:check`: pass.
- Backend tests: 152 pass without a database; 171 pass (0 skipped) against a local PostgreSQL 17 with all migrations.
- Frontend tests: 389 pass, 3 skipped.
- Merging is a production deploy.
