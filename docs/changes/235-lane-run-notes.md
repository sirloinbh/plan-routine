# Record the 2026-11-22 lane run in the daily notes and next steps (#235)

Issue: https://github.com/sirloinbh/plan-routine/issues/235

## Purpose

std-session-notes: keep progress, decisions and next steps in md files. The notes stopped at 2026-11-16 while a four-lane run closed about 35 cards.

## Changes

- `docs/daily/2026-11-23.md` (new) and its line in `docs/daily/README.md`: what the run did, the behavior that changed, tooling notes and what is left open.
- `docs/next-steps/README.md`: last updated 2026-11-23, finished cards, open cards (#126, #101, epics #179 and #103), open PR #135, and new "Things to know" (`/today` redirect, per-feature integration tests with `--test-concurrency=1`, `gh-project.ps1` on macOS, the shared query layer and the diary's no-background-reload).

## Verification

- Card, epic, PR and central-issue numbers were read from `gh` (closed issues and merged PRs since 2026-11-22, open issues and PRs), not copied from the request. Differences from the request: #162 was also closed (by PR #232), and the central PR for the query feature is `project-standards#1004`.
- `npm run check` (format check included).
