# #75 Provide the migration runner for the deploy script

- Issue: [#75](https://github.com/sirloinbh/plan-routine/issues/75)
- Branch: `feat/75-migration-runner`
- Date: 2026-11-01 (Asia/Seoul)

## Purpose

`deploy/remote-deploy.sh` runs `node dist/migrate.js`, but its source was not in the repository. If deployment is connected, it fails at this step.

## Decision

Bring in as they are the runner (`scaffold/app/backend/src/migrate.ts`, `migrations.ts`) and the rules (`docs/conventions/database.md`) of the central `sirloinbh/project-standards`.

At first I wrongly judged that "the central repository has no original" and built in the app a runner that re-runs everything without a record table. It was my mistake to accept an empty result from a code search as meaning it does not exist. It came out in the first review. That method also had a defect where `004` would run again at every deploy, so the '목표 재설정' (reset goals) routine that the user renamed would come back to life. I corrected the issue comment.

## Changes

- `backend/src/migrate.ts`, `migrations.ts`, `backend/test/migrations.test.ts`: exactly the central scaffold. However, the regex in `migrations.ts` had an invisible BOM character as it was, which tripped this repository's lint, so I changed it to an escape notation with the same behavior.
- `package.json`, `backend/package.json`: the `db:migrate` script. The shared CI looks for the runner under this name and runs it.
- `database/README.md`: fixed the apply steps to be based on the runner.
- The app behavior and `deploy/remote-deploy.sh` were not changed. The path of the built `dist/migrate.js` matches the script's mount (`/database/migrations`).

## Tests

- `backend/test/migrations.test.ts`: the name format, duplicate numbers, checksums, and the apply order rules.
- `backend/test/db.integration.test.ts`: applying everything to an empty schema, applying nothing when run again, a renamed default routine not coming back to life, and a DB without the record table.

## Verification

- Local: `env -u TEST_DATABASE_URL npm run check` passed. Backend 93 pass / 0 fail / 18 skip (DB tests) out of 111, frontend 250 pass / 0 fail / 2 skip (dark-mode-only shared tests) out of 252, and `test:skills` 4 pass. `npm run standards:check` passed. I ran the built `backend/dist/migrate.js` without `DATABASE_URL` and confirmed the user-facing message and exit code 1.
- Real DB in CI: all 111 backend tests pass, skip 0. The shared CI ran `npm run db:migrate` and recorded 001 to 005 (PR run 41303400481).
- It was not checked with a real server deployment. Deployment is not connected.

## Limits and follow-up

- On an existing DB without the record table, the first run applies all files again. If you had renamed the '목표 재설정' (reset goals) routine by then, it is created again. This is behavior set by the central rules, and it can be deleted.
- If the DB connection drops during the run, the process ends without cleanup code. The exit code is 1 and the server rolls back the transaction and locks. I left the central files as they are without fixing them.
- The problem that `compose.yaml` does not keep the assumptions of `remote-deploy.sh` (image tags, port variables) is out of the scope of this card, so it was split off to [#79](https://github.com/sirloinbh/plan-routine/issues/79).

## Automated code review

- First: found that the premise "the central repository has no original" was wrong, and the defect that a renamed default routine comes back to life. Replacing it with the central runner solved both. I also fixed the DB document. The deployment assumption problem was split off.
- Second: no defect in the code and tests. I ran the runner directly on a temporary PostgreSQL and confirmed the behavior. Fixed 3 places in the documents where the apply steps for an existing DB were outdated. The review ends at 2 rounds.
