# #156 Keep the API running when an idle database connection drops

Issue: https://github.com/sirloinbh/plan-routine/issues/156

## Purpose

An idle pool connection that drops must not crash the API, a local run must not listen on every interface, and Ctrl+C must stop the server cleanly.

## Changes

- The pool error listener and the `HOST`-aware listen host already come from the managed standard (`createPool` in `standard/db.ts`, `listenHost` in `standard/auth.ts`), so `server.ts` needed no change for them. The log line is the standard's `Database connection failed` message.
- `backend/src/shutdown.ts` (new): `closeOnSignals` closes the server then the pool on `SIGTERM` and `SIGINT`; `server.ts` uses it.
- `compose.yaml`: `HOST: 0.0.0.0` for the api service, so the container is reachable regardless of the auth setting.
- `backend/test/server-runtime.test.ts` (new): pool and client `error` events are logged and do not throw; `HOST` overrides the host and the default is `127.0.0.1`; both signals close the server and the pool.

## Verification

`npm run check` passed locally (backend 159 pass, 21 skipped DB tests). DB integration tests run in CI only (no local `plan_test`).

## Limits

The JSON log line shape asked for in the card is not used: the managed `createPool` logs with `console.error`; changing it belongs to `sirloinbh/project-standards`. The container health check after deploy is a user check (no deploy is connected).
