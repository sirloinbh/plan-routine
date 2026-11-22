# Next steps

Last updated: **2026-11-23 (Asia/Seoul)**.

The first list of cards for the basic features is in roadmap [#14](https://github.com/sirloinbh/plan-routine/issues/14). Read the current state from this document and the issue list. Finished feature cards: #3, #4, #5, #6, #7, #8, #9, #10, #11, #12, #19, #34, #41, #42, #44, #45, #47, #52, #60, #64, #66, #70, #73, #75, #76, #79, #87, #145, #151 to #159, #162 to #174, #178, #222, #233. #160 and #161 were closed as not planned: #178 moved the screens onto the shared query layer instead (see the [2026-11-23 summary](../daily/2026-11-23.md)).

## What to do next

1. **Check the shared sign-in on the server ([#126](https://github.com/sirloinbh/plan-routine/issues/126)).** The code is merged. After the app is deployed with the `shared-auth` network, check that a signed-out visitor is sent to the sign-in page, then close the issue. Deployment is done only on separate request.
2. **Apply to an existing DB.** A search on 2026-11-03 found no DB for this project on this PC, so nothing was run. The local PostgreSQL 17 (port 5432) has only `cert`, `cert_test`, `postgres`, and `study_test`, and there is no Docker data disk either. If a DB used elsewhere exists, run `npm run db:migrate`. The first run applies every file again, so if a renamed '목표 재설정' (reset goals) routine exists, an entry with the original name may appear again.
3. **Check the real environment when possible.** Not yet seen: the screens connected to a real DB, a real phone and screen reader, the link select box in dark mode, the tab-close warning dialog, and the Spinner on the goal, retrospective, link, and name save buttons.

Cleanup done (2026-11-03): the temporary branch `tmp/42-no-lock` was deleted. The user confirmed the decisions made as recommendations (#52, #12, #64, #45, #34, #66). The #13 integration hub design will be handled in another project, so it was closed as "not planned". The `minimatch` warning was fixed in [#99](https://github.com/sirloinbh/plan-routine/issues/99).

#79 was closed on 2026-11-16: with CPU virtualization on, the local `docker compose up` check passed ([record](../changes/79-compose-deploy.md)).

The open cards are [#126](https://github.com/sirloinbh/plan-routine/issues/126) (server check above), [#101](https://github.com/sirloinbh/plan-routine/issues/101) (remove `overrides`, low priority) and the epics [#179](https://github.com/sirloinbh/plan-routine/issues/179) and [#103](https://github.com/sirloinbh/plan-routine/issues/103). #101 is still blocked (checked 2026-11-16): `eslint` 10.15.0 and `@eslint/config-array` 0.23.6 accept `minimatch ^11.0.5`, but `@typescript-eslint/typescript-estree` 8.72.2 (under `typescript-eslint`) still needs `^10.2.2` and `eslint-plugin-jsx-a11y-x` 0.2.0 needs `^10.2.5`. Those versions are also pinned through the central standards. The central repository has [project-standards#392](https://github.com/sirloinbh/project-standards/issues/392).

The epics #147, #148, #149 and #150 were closed on 2026-11-22 after a four-lane run; the summary is in [docs/daily/2026-11-23.md](../daily/2026-11-23.md).

## Open PRs

- [#135](https://github.com/sirloinbh/plan-routine/pull/135) Dependabot: `basic-ftp` 5.3.1 to 6.2.6 (major, security group), checks green. Merge or close is the user's decision.

## Things to know

- **`/` redirects to `/today`** (#167); there is no dashboard page.
- **Backend integration tests are per-feature files** (`backend/test/db-*.integration.test.ts`) and `npm test -w backend` runs with `--test-concurrency=1` because they share one test database (#158).
- **`scripts/gh-project.ps1` fails on macOS** (it needs `USERPROFILE` and `~/.config/gh-personal`). Plain `gh --repo sirloinbh/plan-routine` with the active account `sirloinbh` was used instead; do not switch accounts.
- **The screens load data through the shared query layer** (`@tanstack/react-query`, #178). The diary has no background reload on purpose: its form is a working copy of the load, and a refresh must not replace what the user typed.
- **Never run `npm ci` or `npm install` in a worktree whose `node_modules` is a symlink** to another checkout; every lane shares it.
- **Clear `TEST_DATABASE_URL` before local tests.** This variable in the shell points to another project's DB (`study_test`). On 2026-10-31 a test created 2 empty tables in that DB, and they were deleted with the user's approval. This project's test DB is `plan_test`.
- **If a local frontend test fails with a timeout, add `--testTimeout=60000`.** In late 2026-11-01, `npm run check` passed with the default limit, but a timeout can happen when the PC is busy.
- **The progress for past dates can differ between "Today's check" and "Records".** Today's check shows every routine that exists now, so a routine created later can still be checked on a past date, while Records counts the routines that existed on that day (#10).
- **The screens connected to a real DB have not been checked yet.** There is no DB for this project locally, so the browser checks after #4 used a temporary API. API and DB behavior is checked by the DB integration tests in CI.
- **Apply to an existing DB with `npm run db:migrate`.** The first run on a DB without the record table applies everything again from 001, so a renamed '목표 재설정' (reset goals) routine may appear again. The steps are in the [DB document](../../database/README.md).
- **The cause of the earlier intermittent failure was found.** The `fetch failed: bad port` error in backend tests happened when a random port was a port that `fetch` blocks. It was fixed in #47.
- **The agent closes CodeQL `js/missing-rate-limiting` alerts.** The user approved this on 2026-10-31. The reason is the `/api/` request limit in `frontend/nginx.conf`. For alerts of other rules, ask the user.
- **Run the merge command alone, after looking at the result of the earlier work.** Running them in parallel once merged a commit from before the fix (#85).

## Labels

- Priority: `priority/P0` to `priority/P4`. The criteria are in chapter 2 of `std-backlog`.
- Type: `type/feature`, `type/docs`, `type/security`, `type/chore`, `type/research`
- Feature: `기능: 루틴` (feature: routine), `기능: 체크리스트` (feature: checklist), `기능: 일기` (feature: diary), `기능: 기록·열람` (feature: records and viewing), `기능: 프로젝트 연계` (feature: project link)
- Kind of work: `작업: DB` (work: DB), `작업: API` (work: API), `작업: UI` (work: UI), `작업: 설계` (work: design)
- Other: `추적` (tracking; an issue that groups several cards), `accessibility`

## Execution boundary

Deployment, syncing the sub-repositories, and creating AWS resources are done only on separate request. The ECR repository for the shared infrastructure is added to the list in `shared-aws-infrastructure` at the first deployment.
