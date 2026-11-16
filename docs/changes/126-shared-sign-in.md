# #126 Require the shared sign-in

- Issue: [#126](https://github.com/sirloinbh/plan-routine/issues/126)
- Branch: `chore/standards-sync-b3f43a7`

## Purpose

The app had no login and relied only on the IP allow list. The shared sign-in is live (sirloinbh/project-standards ADR-0015, #550, #551), and workout-memo (#303) was the pilot. This app now uses the same wiring.

## Changes

- `backend/src/app.ts`: `createApp` takes an `auth` middleware and mounts it on `/api` before any route; `/api/health` stays open (the middleware's `publicPaths`). New `GET /api/me` returns the signed-in user.
- `backend/src/server.ts`: passes `sharedAuth()` (the managed `standard/auth.ts`) to `createApp`. It builds the middleware when `AUTH_INTERNAL_URL` is set and refuses to start in production without it.
- `compose.yaml`: the API joins the external `shared-auth` network and checks sessions at `http://shared-auth-api:3110`.
- `frontend/src/app.tsx`: the app is wrapped in `SignInGate` and the top bar shows `AccountActions`. On `<app>.<domain>` a signed-out visitor goes to `https://auth.<domain>/sign-in`; on localhost and IP addresses nothing changes.
- `backend/test/sign-in.test.ts`: every `/api` path but `/api/health` is 401 without a session; with one, `/api/me` returns the user and the API answers.
- This app has no `docs/api.md` or OpenAPI contract, so there is no `/api/me` row to add.

## Verification

- Local: format, lint and typecheck pass; backend `sign-in` and `health` tests (6 pass); frontend `app` and `auth-origin` tests (15 pass); `node .standards/check.mjs` passes. The tests that need PostgreSQL and the rest of the frontend run in CI.
- `npm install --ignore-scripts` (user step) and `node .standards/lockfiles.mjs --write` updated the lockfiles for `@sirloinbh/auth-client` 1.0.0.
