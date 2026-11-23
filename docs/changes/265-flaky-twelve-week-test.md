# #265 Fix a flaky twelve-week test that waits only one tick

- Issue: [#265](https://github.com/sirloinbh/plan-routine/issues/265)
- Branch: `chore/265-flaky-twelve-week-test`
- Date: 2026-11-23 (Asia/Seoul)

## Purpose

"an open window moves to the next period by itself and shows goals to review" failed now and then (CI on the #255 merge, twice on the #244 PR head) because it waited one macrotask after advancing the timers.

## Changes

`frontend/src/twelve-week.test.tsx`: wait two ticks after advancing the timers, as `flush()` does. Test only.

## Verification

See the PR for the `npm run check` result.

## Limits and follow-up

None.
