# Answer API errors with HttpError, parseId and serviceDate (#151)

Issue: https://github.com/sirloinbh/plan-routine/issues/151

## Purpose

Routes answered 4xx errors inline and `app.ts` kept a copy of `serviceDate`. The standard helpers in `standard/http.ts` do the same job in one place.

## Changes

- `backend/src/app.ts`: imports `serviceDate` from `standard/http.ts`; the local copy is deleted. `health.test.ts` imports it from there too.
- Commit 1 of the route work: `routine-routes.ts` and `check-routes.ts`. Commit 2: `goal-routes.ts`, `diary-routes.ts`, `record-routes.ts`, `project-link-routes.ts`. Every inline `res.status(4xx).json(...)` and every 4xx reply inside a transaction is now `throw new HttpError(status, message)`. The status and text of each answer are unchanged. A throw inside `inTransaction` rolls the transaction back, as a 4xx reply did before.
- `routine-routes.ts` exports `routineNotFound` (a message) instead of the `notFound` body object.
- Ids: the `/^\d{1,18}$/` regexes named in the issue are already gone. Every path id goes through `pathId`, which uses `ID_PATTERN` (no `0`, no leading zeros, at most 15 digits). `pathId` stays a zod schema because it also runs inside object schemas with other fields, so `parseId` is not used.
- New test: `/api/health` answers 200 with an auth middleware installed and no session, and does not call the auth service.

## Verification

- `grep -n "res.status(4" backend/src/*-routes.ts`: no matches.
- `npm run typecheck -w backend`, `npm run lint`: clean.
- `npm test -w backend`: 159 pass, 0 fail, 21 skipped (DB integration tests need `TEST_DATABASE_URL`; they run in CI).
