# First AI tool: list_routines and the audit_log table (project-standards#711)

Follows project-standards `docs/conventions/first-ai-tool.md`. One PR adds the tool and its audit table together.

- `backend/src/ai-tools.ts`: one read-only tool, `list_routines` (entity `routine`, access and action `read`). Input: an optional `cadence` and a `limit` (1 to 200, default 50). It uses the same query as the routes through the new `listRoutines(db, cadence, limit)` in `routine-routes.ts`; the route calls it without a limit, so its answer and queries are unchanged.
- `database/migrations/007_audit_log.sql`: the `audit_log` table, copied unchanged from the scaffold's `002_audit_log.sql` (project-standards `scaffold/app/database/migrations/`).
- `backend/src/app.ts`: `registerToolRoutes(app, { app: 'plan-routine', tools, pool, publicKey: options.toolsPublicKey, requireBinding: true })` before the `/api` 404 handler; `server.ts` passes `AI_TOOLS_PUBLIC_KEY`.
- `compose.yaml`: `AI_TOOLS_PUBLIC_KEY` for the api service, the `shared-ai` network with the alias `plan-routine-api`, and the external `shared-ai` network. `.env.example`: `AI_TOOLS_PUBLIC_KEY` with its SSM name.
- The app serves `/internal/tools` for shared-ai only when `AI_TOOLS_PUBLIC_KEY` is set; outside `/api`, so the proxy never reaches it. This app has no `docs/api.md`, so the line is only here.
- Tests: `ai-tools.integration.test.ts` (list, scopes, signature, audit rows `denied`, `ok`, `error`; off without the key; runs in CI with the test database) and `ai-tools-binding.test.ts` (unbound, wrong-tool and replayed tokens are refused).
- Verification: typecheck, eslint, prettier, the non-DB tests (155 plus the binding test). The DB tests run in CI. The live check through shared-ai follows after the merge (recipe section 4).
