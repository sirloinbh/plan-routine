# #244 Show routine streaks and completion trends

- Issue: [#244](https://github.com/sirloinbh/plan-routine/issues/244)
- Branch: `feat/244-streaks-trends`
- Date: 2026-11-23 (Asia/Seoul)

## Purpose

Show whether a change helped over time, and give each routine a streak.

Decisions (user, 2026-11-23): a skipped period neither breaks nor extends a streak; the open current period does not break a streak; trends cover 12 weeks and 6 four-week periods; no new chart package (plain SVG).

## Changes

- `backend/src/routine-stats.ts`: each item has `streak: { current, best }`, counted in periods of the routine's own cadence from its first record (creation or earliest check/skip). Done adds one, missed resets, skipped / not applicable / the open period change nothing; today done adds to the run. `trend.weeks` (12) and `trend.fourWeeks` (6) hold newest-first tallies over daily routines per day plus weekly routines per week (plus four-week routines in the four-week trend); skips are left out.
- `backend/src/stats-routes.ts`: reads every check and skip (a best streak can reach back to the first record), so `statsStart` was removed.
- `backend/src/diary-routes.ts`: the diary's routine progress leaves out routines skipped that day (follow-up of #243, allowed by the coordinator).
- `frontend/src/stats-trend.tsx` (new): two SVG line charts with a text summary (`role="img"` label) and a values list; a period with no records breaks the line instead of drawing 0%. Streak text per item. `stats.tsx` mounts them.

## Tests

`backend/test/routine-stats.test.ts` (streak cases: miss, skip, open period, today done, cadence, archived, no record; trend lengths and counts), `backend/test/diary-routes.test.ts`, `frontend/src/stats.test.tsx` (streak text, chart text alternative, empty trend).

## Verification

See the PR. Browser check on Vite with a mocked `/api` at 390x844 and 1440x900: skip controls on the checklist (open form, skip with reason, remove skip), trend charts and streaks on the stats page; no horizontal overflow.

## Limits and follow-up

- Streaks use the whole history; with years of data this is a small per-request loop (one user).
- The records page skip display was covered by screen tests only (not in the browser run).
