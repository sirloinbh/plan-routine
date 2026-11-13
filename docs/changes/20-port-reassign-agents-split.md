# #20 Change the ports to the central standard (slot 07) and split the AGENTS project-specific rules

- Issue: https://github.com/sirloinbh/plan-routine/issues/20
- Central tracking issue: https://github.com/sirloinbh/project-standards/issues/99

## Purpose

- Apply the ports that the central registry reassigned so that the ports of the 8 apps do not overlap (project-standards ADR-0006).
- Before the first central standards sync turns AGENTS.md into the shared instructions, move this project's PR review and merge rules into AGENTS.project.md and keep them.

## Changes

| Kind                       | Before | After         |
| -------------------------- | ------ | ------------- |
| Web                        | 8097   | 8107          |
| API                        | 3017   | 3107          |
| Vite                       | 5177   | 5207          |
| Host DB                    | 55447  | 15407         |
| e2e API and web (reserved) | none   | 3207 and 5307 |

- Files whose ports were changed: `.env.example`, `README.md`, `backend/Dockerfile`, `backend/src/server.ts`, `compose.yaml`, `frontend/nginx.conf`, `frontend/vite.config.ts`, `AGENTS.md`
- Step 5 of the procedure in `AGENTS.md` (the automated code review and merge rules) was moved word for word to the "Work procedure" of `AGENTS.project.md`, and `AGENTS.md` now makes that file a must-read.
- The past records in `docs/changes/`, `docs/daily/`, and `docs/next-steps/` were not edited because they are the state at that time.

## What the user does

- Change the port in `DATABASE_URL` in the local `.env` from `55447` to `15407`, and `PORT` from `3017` to `3107`. Do not commit `.env`.

## Verification

- 2026-10-22: the result is written in the PR body.
