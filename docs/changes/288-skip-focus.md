# #288 Keep keyboard focus when skipping a routine or removing a skip

- Issue: [#288](https://github.com/sirloinbh/plan-routine/issues/288)
- Branch: `fix/288-skip-focus`
- Date: 2026-11-24 (Asia/Seoul)

## Purpose

`SkipControl` swapped the control that had focus for another one at every step, so focus fell to `<body>` and keyboard and screen reader users had to tab from the top of the page again.

## Changes

- `frontend/src/checklist.tsx`: pressing "Skip" focuses the reason input. After a skip is saved, focus goes to "Remove skip"; after Cancel, or a skip the server refused, to "Skip"; after "Remove skip", to "Skip" (or back to "Remove skip" if that failed). The form stays open and its buttons are disabled while the save runs, so a double press cannot send it twice.
- `onSkip` and `onUnskip` may return a promise; the daily, weekly, 4-week and "ending soon" lists pass the save's promise through.
- `frontend/src/skip-checklist.test.tsx`: two tests for where focus is after each step, including a refused skip.

## Verification

See the PR for the `npm run check` result. Browser check at 390x844 and 1440x900 is recorded in the PR.
