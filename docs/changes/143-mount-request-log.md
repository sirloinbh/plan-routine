# 143 Mount requestLog so every request has an ID

## Purpose

`backend/src/app.ts` imports only `MAX_ISSUES` from `standard/http.ts` and never mounted `requestLog`, so project-standards#552 (request IDs and JSON request logs) was not in effect. Part of sirloinbh/project-standards#658.

## Changes

- `backend/src/app.ts`: `app.use(requestLog)` is the first middleware, before the sign-in guard and every route, so a 401 also gets an ID and a log line.
- `backend/test/helpers.ts`: `withApi` also returns the response headers.
- `backend/test/health.test.ts`: a test that API responses (200 and 404) carry `X-Request-Id`.

## Verification

See the PR for the commands and results.

## Limits

- `backend/src/standard/*` is a managed file and is not edited.
- This app still has its own inline error handler and 404 handler instead of `errorHandler` and `notFound` from `standard/http.ts`; they are left as they are (tracked centrally in project-standards#658).
