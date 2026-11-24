# #290 Reload the mood and energy table when the date changes

- Issue: [#290](https://github.com/sirloinbh/plan-routine/issues/290)
- Branch: `fix/290-mood-reload`
- Date: 2026-11-24 (Asia/Seoul)

## Purpose

The stats page reloaded its completion rates when the service date changed or the page was shown again, but the "Mood and energy by week" table below it kept its old weeks and averages.

## Changes

- `frontend/src/mood-stats.tsx`: `MoodStats` uses `useReloadWhenCurrent` for `/api/mood-stats`, the same hook the other pages use.
- `frontend/src/mood-stats.test.tsx`: a test that the table loads again when the page is shown again.

## Verification

See the PR for the `npm run check` result.
