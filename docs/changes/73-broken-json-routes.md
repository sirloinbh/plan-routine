# #73 Fix broken JSON bodies being answered with a 500

- Issue: [#73](https://github.com/sirloinbh/plan-routine/issues/73)
- Branch: `test/73-broken-json-routes`
- Date: 2026-11-01 (Asia/Seoul)

## Purpose

This is the problem where broken JSON and primitive JSON value bodies become a 500. The behavior was already fixed in [#47](47-request-body-errors.md). Only the issue's done criterion, "a test that checks this input on every route", remained.

## Changes

`backend/test/request-input.test.ts`: checks that all 35 combinations of the 7 routes that read a body and the issue's 5 bodies (`{`, `null`, `1`, `"x"`, `true`) are a 400 with a user-facing message and do not reach the DB. The app code was not changed.

The issue gives health-log's wording `요청 본문의 JSON 형식이 올바르지 않습니다` (the JSON format of the request body is not valid) as an example, but the done criterion is "a 400 and a user-facing message", so the wording decided in #47 is kept.

## Verification

- Local: `env -u TEST_DATABASE_URL npm run check` passed. Backend 145 pass / 0 fail / 19 skip (DB tests) out of 164, frontend 304 pass / 0 fail / 2 skip out of 306, and `test:skills` 4 pass.

## Limits and follow-up

None.
