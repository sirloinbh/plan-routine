# API healthcheck in compose.yaml (project-standards#894)

- The `api` service has a `healthcheck` on `/api/health` (a `node` fetch, 5 s interval, 15 retries, 10 s start period), copied from project-standards `scaffold/app/compose.yaml`, and `web` waits for it with `depends_on: api: condition: service_healthy`.
- Why: `docker compose up -d --wait` can now tell when the API is ready; `standards-check` no longer warns that the api service has no healthcheck.
- Verification: `node .standards/check.mjs` passes without the warning, prettier passes. CI and the autodeploy check the rest.
