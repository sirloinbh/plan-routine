# #70 Put a limit on the number of messages in an input error response

- Issue: [#70](https://github.com/sirloinbh/plan-routine/issues/70)
- Branch: `fix/70-error-message-limit`
- Date: 2026-11-01 (Asia/Seoul)

## Purpose

All input errors were joined together in the answer, so the response to an invalid large request could become much larger than the request.

## Decision

The user said to proceed with the recommendations for the choices, so instead of replacing the whole thing with the handler in the central `backend/src/standard/http.ts`, I brought over only the limit rule (`MAX_ISSUES`). Replacing the whole handler would change the responses decided in #47. The wording for broken JSON and for 413 differs, there is no wording only for 415, and for other 4xx errors the app unifies to 400 while the central one keeps the original status. 409 is the same. The 400 handling of `22021` that exists only centrally is replaced by the app's NUL rejection. It was recorded in the issue comment.

## Changes

`backend/src/app.ts`: shows up to 10 messages, and if there are more, adds "외 N개" (and N more). It is the same format as the central handler.

## Tests

`backend/test/request-input.test.ts`: for 15 errors, 10 and "외 5개" (and 5 more), and for 10 errors, unchanged.

## Verification

- Local: `env -u TEST_DATABASE_URL npm run check` passed. Backend 144 pass / 0 fail / 19 skip (DB tests) out of 163, frontend 292 pass / 0 fail / 2 skip out of 294, and `test:skills` 4 pass.
- Real DB in CI: this change does not touch the DB.

## Limits and follow-up

None.

## Automated code review

- First: there was no defect in the behavior code and tests. Fixed a sentence that wrongly described the difference from the central handler. Because only the record was fixed, the second review is not done.
