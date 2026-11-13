# #68 Move the backend validation code to zod 4 syntax

- Issue: [#68](https://github.com/sirloinbh/plan-routine/issues/68)
- Branch: `chore/68-zod4-syntax`

## Purpose

Step 1 of the central `sirloinbh/project-standards#386`. Move the code first so this app does not break when the central repository raises `zod` to 4.6.7. The Dependabot alert for the security advisory GHSA-mrhx-c7xc-m3w5 is closed by that sync. It is not closed by this PR alone.

## Changes — 2026-11-01

- 8 files in `backend/src` import from `zod/v4`. The installed 3.25.76 contains this path, so `package.json` and the lock file were not changed.
- Moved `required_error`, `invalid_type_error`, and `errorMap` to `error`.
- Changed `.min()` and `.max()` of the strings and of the minimum count of the retrospective array to `.refine()`. The length check of zod 4 also runs after a type failure when the input has `.length`, so sending an array or an empty string wrongly gives two messages.
- Newly put `.max(1000)` on the retrospective array. This array had no length limit, so `standards:check` was warning, and it was the target of the security advisory (GHSA-mrhx-c7xc-m3w5) where errors pile up per element. 4.6.7 uses only the length checks that run consecutively at the front to reject before reading elements, so `.max()` is placed at the very front of the chain. The app has no limit on the number of goals, so the value was set to one that is hard to reach in a real period.

## Responses that change

I sent 1136 of the same inputs to the real routes before the switch, with 3.25.76's `zod/v4`, and with 4.6.7, and compared the status code, the response body, and the values passed to the DB. 10 differ from before the switch. There is no case where the saved value changes. The Korean messages in the table are quoted as they were.

| Input                                                                                        | Before                                                        | After                                                                                                       |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| The body is an array (routine register, rename, move, diary save)                            | `Expected object, received array`                             | `Invalid input: expected object, received array`                                                            |
| In a retrospective, the same goal is sent twice and the memo is also wrong                   | Only the memo message                                         | After the memo message, `같은 목표를 두 번 회고할 수 없습니다` (cannot review the same goal twice) is added |
| 1001 or more retrospectives, all valid, with different goals                                 | Passes validation (404 in the test as the goals do not exist) | 400 `한 번에 회고할 수 있는 목표는 1000개까지입니다` (up to 1000 goals can be reviewed at once)             |
| 1001 or more retrospectives, with invalid elements or overlapping goals                      | 400, an element error or the duplicate message                | 400, with 4.6.7 only the limit message, with 3.25.76 the limit message and the existing message             |
| `reviews` is a string of 1001 or more characters, or an object with `length` of 1001 or more | `회고할 목표가 없습니다` (no goals to review)                 | The limit message is added after it                                                                         |

3.25.76 and 4.6.7 differ only in the 2 of the fourth row. 4.6.7 rejects before reading the elements. The array body and memo message differences are treated as inputs that appear only when building the request directly, and since the 400 is kept, they were not fixed. The fifth row was left because the `.max()` at the very front is needed for the fast rejection. The emoji input added to guard against a code point counting difference showed no difference.

`z.record` is not used. For an input whose body has a `constructor` key that is null, a number, or an object, the responses before and after are the same and no 500 occurs.

## Verification

- `npm run check`: passed (backend 77 passed and 14 skipped out of 91, frontend 235 passed and 2 skipped, and skills 4 passed). `TEST_DATABASE_URL` was cleared, so the DB integration tests were not run locally and are confirmed by the PR CI.
- 4.6.7: with the copy that `knip` installed alongside, the type check, the backend unit tests, and the before-and-after comparison passed. The check of the install itself is done by the CI of the central sync PR.
- Once, the `saving trims the text...` test failed with `fetch failed: bad port`. It is the case where the random port the test server got was a port that fetch blocks. It is unrelated to the code, and it passed when run again.
