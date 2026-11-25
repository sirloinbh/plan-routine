# 312: Document the local plan_test database

Issue: [#312](https://github.com/sirloinbh/plan-routine/issues/312).

## Why

A local `plan_test` database exists, but the setup was not written down, and `docs/next-steps/README.md` still said there is none.

## Changes

- `database/README.md`: new section with the role and database creation in the compose db container, the migration step, the `TEST_DATABASE_URL` per-command rule, and "one test process at a time".
- `README.md` links to it; `docs/next-steps/README.md` (done at the coordinator's request) no longer says there is no local test DB.

## Verification

- Full backend suite against `plan_test` on 2026-11-26: 271 passed, 0 skipped, about 15 s. A first run hung and failed one test while another lane used the same database; the AI-tools test passed alone and the second full run passed.
- The creation and migration commands were run against a throwaway role and database (`CREATE ROLE`, `CREATE DATABASE`, `npm run db:migrate` applied 001 to 012), which were dropped afterwards. The existing `plan_test` was not touched.
