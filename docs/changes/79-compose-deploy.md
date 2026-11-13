# #79 Align compose.yaml with the assumptions of the deploy script

- Issue: [#79](https://github.com/sirloinbh/plan-routine/issues/79)
- Branch: `chore/79-compose-deploy`
- Date: 2026-11-01 (Asia/Seoul)

## Purpose

`deploy/remote-deploy.sh` assumes per-commit image tags and port variables, but `compose.yaml` did not have them. If the health check failed, it came up again with the image just uploaded, so the rollback did not work.

## Changes

Only `compose.yaml` was changed.

- `image: plan-backend:${IMAGE_TAG:-local}` and `plan-frontend:${IMAGE_TAG:-local}` for api and web.
- The web port is `${WEB_BIND:-127.0.0.1}:${WEB_PORT:-8107}:80`. The defaults are the same as now, so the local address does not change.
- `-h 127.0.0.1` in the DB health check. The temporary server of the first run answers only over the socket, so it does not become healthy before the real server comes up.

What changes locally is as follows. The defaults of the address and port stay the same.

- The image names become `plan-backend:local` and `plan-frontend:local`. So even `docker compose up -d` without `--build` rebuilds once the first time, and the shell needs `NODE_AUTH_TOKEN`. The old images stay locally.
- On the first run with an empty volume, api waits until the real server comes up.
- If `WEB_BIND` and `WEB_PORT` are in the local `.env`, they are followed.

The compose description and examples in `docs/project-setup.md` were also aligned.

I compared against the central template. The image and port are the same as the central `scaffold/app/compose.yaml` and `docs/runbooks/deploy.md`. Only the `-h 127.0.0.1` of the health check differs, and it is an intended difference. The work of putting it in the central repository was registered as [project-standards#392](https://github.com/sirloinbh/project-standards/issues/392). The same race in the restore check of `deploy/backup.sh` is also a centrally managed file, so I put it in that card.

## Verification

- Local: confirmed with `docker compose config` (no Docker daemon needed). With the defaults it is `plan-backend:local`, `plan-frontend:local`, and port `127.0.0.1:8107`, and with `IMAGE_TAG=abc123 WEB_BIND=0.0.0.0 WEB_PORT=9000` it is `plan-backend:abc123`, `plan-frontend:abc123`, and `0.0.0.0:9000`.
- Local: `env -u TEST_DATABASE_URL npm run check` passed. Backend 93 pass / 0 fail / 18 skip (DB tests) out of 111, frontend 253 pass / 0 fail / 2 skip out of 255, and `test:skills` 4 pass. `npm run standards:check` passed.
- **A real `docker compose up` and a rollback on a real server were not checked.** The Docker daemon is off on this PC and deployment is not connected. So this PR does not close the issue. When "the local `docker compose up` works as before" is confirmed, the issue will be closed.

## Limits and follow-up

- The `docker compose up` check above remains. At that time, also look at how long the first initialization takes. The health check allowance is about 75 seconds.

## Automated code review

- First: no defect in `compose.yaml`. 3 low findings applied (recording the impact scope, the result of comparing with the central template, and the examples in `docs/project-setup.md`). 1 existing bug was registered as a central card.
