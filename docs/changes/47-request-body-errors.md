# #47 Answer an invalid request body with a user-facing error

- Issue: [#47](https://github.com/sirloinbh/plan-routine/issues/47)
- Branch: `fix/47-request-body-errors`
- Date: 2026-11-01 (Asia/Seoul)

## Purpose

Broken JSON and bodies over 256KB became a 500, and when the body was an array an English message went out. A NUL character in a routine name could also become a 500. Saved data is not affected, but an invalid request must be answered in a user-facing message.

## Changes

Gathered the rules that the diary and the goals each had into `backend/src/request-input.ts` (new file). The response messages below are quoted in Korean as they were, with an English gloss.

| Request                                      | Before         | After                                                                            |
| -------------------------------------------- | -------------- | -------------------------------------------------------------------------------- |
| Broken JSON, number, boolean, or string body | 500            | 400 "요청 형식이 올바르지 않습니다" (the request format is not valid)            |
| Over 256KB                                   | 500            | 413 "요청 내용이 너무 큽니다" (the request is too large)                         |
| A character encoding that cannot be read     | 500            | 415 "지원하지 않는 요청 형식입니다" (an unsupported request format)              |
| An address that cannot be decoded            | 500            | 400 "요청 형식이 올바르지 않습니다" (the request format is not valid)            |
| Array body (routine, diary)                  | 400 in English | 400 "요청 형식이 올바르지 않습니다" (the request format is not valid)            |
| NUL character in a routine name              | 500 possible   | 400 "쓸 수 없는 문자가 들어 있습니다" (contains a character that cannot be used) |

The error handler in `app.ts` answers this way only for errors that have a 4xx status. Other errors are logged as before and answered with a 500.

## Tests

`backend/test/request-input.test.ts`: checks the status and the message for each case in the table above, and checks that these requests do not reach the DB. It also checks that an unexpected error is still a 500.

## Verification

- Local: `env -u TEST_DATABASE_URL npm run check` passed. Backend 84 pass / 0 fail / 15 skip (DB tests) out of 99, frontend 235 pass / 0 fail / 2 skip (dark-mode-only shared tests) out of 237, and `test:skills` 4 pass. The `TEST_DATABASE_URL` in the shell points to another project's DB, so the DB tests were not run locally.

- CI: `ci / verify` including the real DB and `ci / docker-build` passed. This PR did not change DB queries.

## Test helper fix

While working, a backend test failed rarely with `fetch failed: bad port`. I reproduced it once by running 30 times in parallel. `withApi` opens the server on port 0, and it happens when Windows gives a low port that `fetch` blocks. It is unrelated to the app code. `backend/test/helpers.ts` was fixed to open again if it gets such a port. After the fix, I ran 60 times under the same load and there was no failure. Because it is a rare failure, this is not a complete proof.

## Limits and follow-up

- If there are many input errors, the response grows with them. This is not a problem this PR created, so it was split off to [#70](https://github.com/sirloinbh/plan-routine/issues/70).

## Automated code review

- First: no defect in the behavior code. There were no English messages even in a test that sent 1,882 inputs. 4 low findings applied (the description of the earlier behavior, running `npm run check`, the scope of the keep-500 test, and the test title). The error response size was split off to [#70](https://github.com/sirloinbh/plan-routine/issues/70).
- Second: no defect in the behavior code. Confirmed the first-review follow-ups were applied. 1 low finding about a test title was applied. The review ends at 2 rounds.

## Merge from main

#68 (the zod 4 syntax switch) was merged first, so `diary-routes.ts`, `goal-routes.ts`, `routine-routes.ts`, and `routines.ts` conflicted. I re-applied this PR's changes on top of main's code. `badRequest` uses the `error` option of zod 4. After the merge, `npm run check` passed again.
