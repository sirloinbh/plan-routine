# Plan, Practice, Routine, Feedback

A personal service for making plans, recording practice and routines, and improving through feedback. The only user is the owner, and it runs locally without a login.

## Development standards

Node.js **24.21.0**, npm **11.19.0**. Install with `npm ci --ignore-scripts` (after the user confirms), format with `npm run format`, and run the full verification with `npm run check`. The full standards are in the [development environment setup document](docs/project-setup.md) and [AGENTS.md](AGENTS.md).

Changes go in this order: **GitHub issue → branch with the issue number → implementation, tests, and docs record → `npm run check` → PR → automatic code review (up to 2 rounds) → the agent merges after CI passes**. Review follow-ups are added as extra commits, and large fixes are split into new issues. When every required CI check passes on the final head, the agent merges with a merge commit ([AGENTS.md](AGENTS.md)).

## Run

```powershell
Copy-Item .env.example .env
docker compose up --build -d
```

Open http://localhost:8107 . Change the password in `.env` before you run it. Data is stored in the `plan-routine-data` volume, and `docker compose down -v` deletes the data.

Development run:

```powershell
docker compose up -d db
npm run dev
```

Vite is at http://localhost:5207, the API is at http://localhost:3107/api/health, and the host DB port is 15407.

## Verification

- `npm run check`: format, lint, types, tests, skill sync check, and build.
- The DB integration tests need `TEST_DATABASE_URL` for a dedicated test DB that has the migrations applied. They are skipped without it.
- GitHub Actions runs the full checks with a PostgreSQL service and builds the Docker image.

## Repository layout

This repository is an umbrella monorepo that holds the whole source. `frontend`, `backend`, and `database` are synced with `git subtree split` to the private deployment repositories `plan-routine-frontend`, `plan-routine-backend`, and `plan-routine-db` (`scripts/push-repositories.ps1`, only on request). AWS infrastructure is managed in the shared repository `shared-aws-infrastructure`.

## Documents

- [AI instructions](AGENTS.md) · [Claude instructions](CLAUDE.md) · [DB](database/README.md)
- [Change records](docs/changes/README.md) · [Daily logs](docs/daily/README.md) · [Next steps](docs/next-steps/README.md)
