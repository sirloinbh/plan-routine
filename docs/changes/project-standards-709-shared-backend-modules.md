# Adopt the shared db and rate-limit modules (project-standards#709, part 1)

- The five hand-written transactions (check, goal and routine routes) run on the managed `withTransaction` through `src/transaction.ts`: a reply with status 400 or above rolls back, any other commits. Behavior is the same as before, and a failed ROLLBACK now destroys the connection.
- `src/pool.ts` (`connectPool`): the managed `createPool` plus a per-connection `error` listener (pg stops listening on a checked-out client), used by `server.ts`. The server had no error listener before.
- `app.ts` uses the managed `apiRateLimit(app)` (new here: 600 per minute per client IP, health not counted), placed after `requestLog` and before the shared sign-in.
- Not in this PR: the OpenAPI builder (needs typed path params in the managed builder). The ids-as-numbers change is project-standards#780.
- Verification: typecheck, eslint, prettier, non-DB tests. DB tests run in CI.
