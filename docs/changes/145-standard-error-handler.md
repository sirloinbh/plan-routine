# Use the standard error handler so error logs have the request ID (#145)

Issue: https://github.com/sirloinbh/plan-routine/issues/145

## Purpose

`app.ts` had its own 404 and error handlers, so the `request_error` log line had no request ID and the daily report could not trace a 500 to a request.

## Changes

- `backend/src/app.ts`: `app.use('/api', notFound)` and `app.use(errorHandler)` from `standard/http.ts` replace the inline handlers. The error log now carries `requestId`.
- `backend/src/request-input.ts`: removed `requestFailure`, which only the inline handler used.
- Status codes are unchanged (Zod 400, 23505 409, other 4xx kept, 500). The body shape is still `{ error }`. Some texts now come from the standard handler:

| Case                                  | Before                                              | After                          |
| ------------------------------------- | --------------------------------------------------- | ------------------------------ |
| Broken JSON body (400)                | Invalid request format                              | Request body is not valid JSON |
| Body over the limit (413)             | The request is too large                            | Request body is too large      |
| Other 4xx from Express (415, bad URL) | Invalid request format / Unsupported request format | Cannot process the request     |
| PostgreSQL 23505 (409)                | This item is already registered                     | This item already exists       |
| Unexpected error (500)                | A server error occurred                             | Server error                   |
| Zod error beyond ten issues           | `5 more`                                            | `and 5 more`                   |

Frontend tests only mock these texts, so no screen test changes.

## Verification

- `npm test -w backend`: 158 pass, 0 fail, 21 skipped (DB integration tests need `TEST_DATABASE_URL`; they run in CI).
- New tests in `backend/test/health.test.ts`: the 500 log line has the same `requestId` as the `X-Request-Id` header; 23505 gives 409 and 22P02 gives 400 without leaking the database text; a bad `date` gives a 400.
