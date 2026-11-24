# 291: Make the README run steps match compose and the shared sign-in

Issue: [#291](https://github.com/sirloinbh/plan-routine/issues/291).

## Why

README said the app runs without a login and gave only `docker compose up --build -d`. In fact `compose.yaml` needs the external `shared-auth` and `shared-ai` networks and the `NODE_AUTH_TOKEN` build secret, the API checks every `/api` session through `AUTH_INTERNAL_URL`, and `backend/src/standard/auth.ts` refuses to start without it unless `NODE_ENV=development`, `NODE_ENV=test` or `AUTH_DISABLED=1`. The `npm run dev` script sets none of those, so the documented development run failed to start the API.

## Changes

- README intro and Run section: the shared sign-in, the one-time `docker network create` commands, the build token (a placeholder, no value), the effect of a missing shared-auth, and `AUTH_DISABLED=1` plus `npm run db:migrate` for the development run.
- `docs/project-setup.md` line 26 ("no login") is the workout-memo template and is already marked historical by the note from #289; not changed.

## Verification

See the PR. I did not run Docker here, so the steps follow `compose.yaml` and `auth.ts`; a real clean-host run is not done.
