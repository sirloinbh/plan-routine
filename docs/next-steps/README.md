# Next steps

Last updated: **2026-11-24 (Asia/Seoul)**.

The first list of cards for the basic features is in roadmap [#14](https://github.com/sirloinbh/plan-routine/issues/14). Read the current state from this document and the issue list. Finished feature cards: #3, #4, #5, #6, #7, #8, #9, #10, #11, #12, #19, #34, #41, #42, #44, #45, #47, #52, #60, #64, #66, #70, #73, #75, #76, #79, #87, #126, #145, #151 to #159, #162 to #174, #178, #222, #233, and from the 2026-11-23/24 run #242 to #248, #250, #257, #258, #262 to #265, #270, #276, #277, #280, #281, and from the review round #288 to #295 and #304 (see the [2026-11-24 summary](../daily/2026-11-24.md)). #160 and #161 were closed as not planned: #178 moved the screens onto the shared query layer instead (see the [2026-11-23 summary](../daily/2026-11-23.md)). The epics #147 to #150, #179, #239 and #240 are closed.

## What to do next

Everything left needs the user. There are no open PRs.

1. **[#249](https://github.com/sirloinbh/plan-routine/issues/249) evening reminders: Web Push was chosen (2026-11-24).** Still the user's: approve installing `web-push` (with `--ignore-scripts`), create and register the VAPID keys as secrets, and settle device-reachable sign-in. Then a lane can build it. Closing it also lets the epic [#241](https://github.com/sirloinbh/plan-routine/issues/241) close.
2. **[#101](https://github.com/sirloinbh/plan-routine/issues/101) is blocked upstream** (rechecked 2026-11-24). `eslint` 10.15.0, `@eslint/config-array` 0.23.6 and `@typescript-eslint/typescript-estree` 8.73.0 accept `minimatch` 11, but `eslint-plugin-jsx-a11y-x` 0.2.0 still needs `^10.2.5`. The versions are pinned through the central standards, so removing the `overrides` goes through a central issue ([project-standards#392](https://github.com/sirloinbh/project-standards/issues/392) exists). Recheck with `npm view eslint-plugin-jsx-a11y-x dependencies.minimatch`. The epic [#103](https://github.com/sirloinbh/plan-routine/issues/103) waits for it.
3. **Check the autodeploy on the server.** Whether `plan-autodeploy.timer` is installed is not confirmed; until it is, treat a merge to main as a live deploy. Check the timer, the deployed commit and `/api/health` (the journal and `.last-deploy.log` on the server).
4. **Try the README Docker steps on a clean host** ([#291](https://github.com/sirloinbh/plan-routine/issues/291)): the steps follow `compose.yaml` and the auth code but were not run.
5. **Check the new screens against a real database and server.** The DB integration tests passed in CI and, since 2026-11-26, also locally against `plan_test` (setup in the [DB document](../../database/README.md)); that is a test database, not real data. Not yet seen with real data: the weekly review, search (text, date range, routine filter, links to Records), the Settings "Download your data" files (open the CSVs in a spreadsheet; the checks CSV now has amounts and skipped periods), skipping a check, streaks and trends, weekday and N-per-week schedules, amounts and totals, editing a routine's schedule, unit and target, and the mood table on the stats page. Also still unseen: a real phone and screen reader, dark mode of the link select box, the tab-close warning dialog and the Spinner on the goal, retrospective, link and name save buttons, and in a real browser at 390x844 and 1440x900 the keyboard focus after skipping a routine ([#288](https://github.com/sirloinbh/plan-routine/issues/288)) and the mood table reloading on a date change ([#290](https://github.com/sirloinbh/plan-routine/issues/290)).
6. **Apply the new migrations to an existing DB.** `npm run db:migrate` applies 008 to 012 (see Things to know). The first run on a DB without the record table applies everything from 001, so a renamed '목표 재설정' (reset goals) routine may appear again. The steps are in the [DB document](../../database/README.md).

Back up before you remove a volume: `docker compose down -v` deletes all data. Download a copy first ([docs/data-export.md](../data-export.md)).

## Open PRs

None.

## Things to know

- **`/` redirects to `/today`** (#167); there is no dashboard page.
- **Migrations 008 to 012** came from this run: `008_weekly_reviews` (#242), `009_diary_scores` (#247), `010_routine_skips` (#243), `011_routine_schedules` (#245), `012_check_amounts` (#246). Each lane took the next free number at merge time. Never edit an existing migration.
- **The export finds tables at request time** (`GET /api/export`, #248): it lists the public tables from `information_schema`, so a table added by a later migration is exported without a code change. Only `schema_migrations` is left out. Import (restore from JSON) is not built.
- **Search rules** (#250, #258, #264, #277): text search is a plain `ILIKE` over the diary body, the three notes and skip reasons (`%`, `_` and `\` escaped); `pg_trgm` is only to be added if it gets slow, and that is a DB extension, so ask first. With a routine filter, a missed day is a past day on which the daily routine was due (created by then, scheduled that weekday, not archived on or before it) with no check and no skip; such days are listed even without a diary entry, with a link to the day. A skipped day is listed once as "Skipped" with its reason and is not missed. N-per-week routines are not covered by the daily filter. The search text stays in the address, so Back restores it.
- **Skipped is not missed** (#243, #244, #262, #263): a skipped period is left out of both counts on Records, Stats, the diary progress and the mood table, neither breaks nor extends a streak, and shows as "Skipped" everywhere.
- **Editing a routine's schedule applies to the whole history** (#276, Q1 A): past periods are re-evaluated. A unit change or removal keeps the amounts, which are hidden while the routine has no unit (Q2 B). **Once-a-week to N-times and back is not reversible** (Q3 B): once to N keeps the check on the week's Sunday and loses which day; N to once merges a week's checks into one on the Sunday with the earliest check time and the summed amounts. It runs in one transaction and writes an `audit_log` entry ([record](../changes/276-edit-routine-schedule.md)).
- **Backend integration tests are per-feature files** (`backend/test/db-*.integration.test.ts`) and `npm test -w backend` runs with `--test-concurrency=1` because they share one test database (#158). They are skipped without `TEST_DATABASE_URL`, so do not report the DB as verified from a local run.
- **`scripts/gh-project.ps1` works on macOS** when `USERPROFILE` is set: run it as `USERPROFILE="$HOME" pwsh -NoProfile -File scripts/gh-project.ps1 <gh args> --repo sirloinbh/plan-routine`. Do not switch gh accounts.
- **The screens load data through the shared query layer** (`@tanstack/react-query`, #178). The diary has no background reload on purpose: its form is a working copy of the load, and a refresh must not replace what the user typed.
- **Never run `npm ci` or `npm install` in a worktree whose `node_modules` is a symlink** to another checkout; every lane shares it.
- **Clear `TEST_DATABASE_URL` before local tests.** This variable in the shell points to another project's DB (`study_test`). On 2026-10-31 a test created 2 empty tables in that DB, and they were deleted with the user's approval. This project's test DB is `plan_test`.
- **If a local frontend test fails with a timeout, add `--testTimeout=60000`.** The default limit can be too short when the PC is busy.
- **The progress for past dates can differ between "Today's check" and "Records".** Today's check shows every routine that exists now, so a routine created later can still be checked on a past date, while Records counts the routines that existed on that day (#10).
- **The cause of the earlier intermittent failure was found.** The `fetch failed: bad port` error in backend tests happened when a random port was a port that `fetch` blocks. It was fixed in #47.
- **The agent closes CodeQL `js/missing-rate-limiting` alerts.** The user approved this on 2026-10-31. The reason is the `/api/` request limit in `frontend/nginx.conf`. For alerts of other rules, ask the user.
- **Run the merge command alone, after looking at the result of the earlier work.** Running them in parallel once merged a commit from before the fix (#85).
- **Exported files are real data.** Never commit them or attach them to issues or PRs.

## Labels

- Priority: `priority/P0` to `priority/P4`. The criteria are in chapter 2 of `std-backlog`.
- Type: `type/feature`, `type/docs`, `type/security`, `type/chore`, `type/research`
- Feature: `기능: 루틴` (feature: routine), `기능: 체크리스트` (feature: checklist), `기능: 일기` (feature: diary), `기능: 기록·열람` (feature: records and viewing), `기능: 프로젝트 연계` (feature: project link)
- Kind of work: `작업: DB` (work: DB), `작업: API` (work: API), `작업: UI` (work: UI), `작업: 설계` (work: design)
- Other: `추적` (tracking; an issue that groups several cards), `accessibility`

## Execution boundary

Never deploy by hand: a merge to main may deploy through the server's autodeploy (treated as live, see item 3). Creating AWS resources is done only on separate request. The ECR repository for the shared infrastructure is added to the list in `shared-aws-infrastructure` at the first deployment.
