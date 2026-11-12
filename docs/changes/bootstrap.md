# Initial development environment setup (before issues)

- Date: 2026-10-19 (Asia/Seoul)
- Basis: workout-memo's [development environment setup document](../project-setup.md) (workout-memo PR #57)

## Purpose

Prepare the development environment, a minimal app, verification, and repositories so the plan-routine project can be developed issue by issue. Detailed features proceed after the user registers issue cards.

## Content

- Stack: React 19 + Vite + TypeScript, Express 5 + pg + Zod, PostgreSQL 17, npm workspaces, Docker Compose, GitHub Actions. Node 24.21.0 / npm 11.19.0.
- Dependencies: only the same packages and versions as workout-memo's lock file were used (only the workspace names changed). With the user's approval they were installed with `npm ci --ignore-scripts`, and no new package was added. `npm audit`: 0 vulnerabilities.
- Minimal app: `GET /api/health` (DB check, service date), 404 and 500 error handling with user-facing messages, a sidebar, a page header, a status display, an empty-state screen, and design tokens based on CSS variables.
- DB: `database/migrations/001_initial.sql` (`app_settings`, safe to run again). For an existing DB, only the `psql -f` method is described.
- Tests: unit (`health.test.ts`), DB integration (`db.integration.test.ts`, skipped without `TEST_DATABASE_URL`), UI (`app-ui.test.ts`, vm harness), and the skill sync check.
- AI instructions: `AGENTS.md`, `CLAUDE.md`, and 3 skills (source in `skills/`, copy in `.claude/skills/`).
- Repositories: the umbrella `sirloinbh/plan-routine` + the deployment sub-repositories `plan-routine-frontend`, `plan-routine-backend`, and `plan-routine-db` (private, subtree). AWS uses the shared `shared-aws-infrastructure`.

## Verification

- Applied the migrations as UTF-8 to the dedicated test DB `plan_routine_test` (workout-memo's test container) and ran `npm run check`: **exit 0**.
  - App and DB tests **8 pass / 0 fail / 0 skip** (the DB integration tests actually ran)
  - Skill check **4 pass / 0 fail / 0 skip**
  - Format, lint, and types passed, and the frontend and backend builds passed
- The real browser check was done in study-log, which was made from the same template (mobile 390px with no horizontal scroll, status and menu switching normal, PC 1440px normal). This project differs only in the title and ports, and was checked with the UI tests.
- The initial commit was pushed directly to `main` to create the repositories. From then on, every change goes through issue → branch → PR.
- The Docker image build is checked by the `docker-build` job in GitHub Actions. A local `docker compose up` was not run.
