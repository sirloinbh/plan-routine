# Next steps

Last updated: **2026-11-03 (Asia/Seoul)**.

The first list of cards for the basic features is in roadmap [#14](https://github.com/sirloinbh/plan-routine/issues/14). Read the current state from this document and the issue list. Finished feature cards: #3, #4, #5, #6, #7, #8, #9, #10, #11, #12, #19, #34, #41, #42, #44, #45, #47, #52, #60, #64, #66, #70, #73, #75, #76, #87.

## What to do next

1. **Check #79.** The user decided to do it later (2026-11-03). It is blocked now because the Docker engine does not start. When Docker Desktop was started on 2026-11-02, it showed `no virtualization available`, and both `VirtualizationFirmwareEnabled` and `HypervisorPresent` were False. No distribution is installed in WSL either.
   - User: restart the PC, turn on CPU virtualization in the BIOS/UEFI (Intel VT-x or AMD SVM), and tell the agent it is on. If Docker still does not start after that, look at the WSL state again.
   - Agent: check that `docker compose up -d --build` works as before. To avoid touching the existing volume, check the first run on an empty volume with a separate project name (`-p`) and a throwaway `POSTGRES_PASSWORD`, then remove only that project. The first run rebuilds because the image name changed, so the shell needs `NODE_AUTH_TOKEN`. Also look at how long the first initialization takes (health check allowance is about 75 seconds). If there is no problem, close [#79](https://github.com/sirloinbh/plan-routine/issues/79).
2. **Apply to an existing DB.** A search on 2026-11-03 found no DB for this project on this PC, so nothing was run. The local PostgreSQL 17 (port 5432) has only `cert`, `cert_test`, `postgres`, and `study_test`, and there is no Docker data disk either. If a DB used elsewhere exists, run `npm run db:migrate`. The first run applies every file again, so if a renamed '목표 재설정' (reset goals) routine exists, an entry with the original name may appear again.
3. **Check the real environment when possible.** Not yet seen: the screens connected to a real DB, a real phone and screen reader, the link select box in dark mode, the tab-close warning dialog, and the Spinner on the goal, retrospective, link, and name save buttons.

Cleanup done (2026-11-03): the temporary branch `tmp/42-no-lock` was deleted. The user confirmed the decisions made as recommendations (#52, #12, #64, #45, #34, #66). The #13 integration hub design will be handled in another project, so it was closed as "not planned". The `minimatch` warning was fixed in [#99](https://github.com/sirloinbh/plan-routine/issues/99).

The open cards are #79 and [#101](https://github.com/sirloinbh/plan-routine/issues/101) (remove `overrides` once ESLint accepts `minimatch` 11, low priority). The central repository has [project-standards#392](https://github.com/sirloinbh/project-standards/issues/392).

## Open PRs

None.

## Things to know

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
