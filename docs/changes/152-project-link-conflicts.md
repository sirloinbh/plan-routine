# Return clear 4xx answers for project-link conflicts (#152)

Issue: https://github.com/sirloinbh/plan-routine/issues/152

## Purpose

A duplicate project name answered the generic "This item already exists", and a project deleted while a routine link was being saved failed with `23503`, which became a 500.

## Changes

- `POST /api/project-links`: PostgreSQL `23505` (unique index on `lower(name)`) answers 409 "A project with this name already exists (names ignore case)".
- `PUT /api/routines/:id/project-link`: `23503` (foreign key, project deleted after the `EXISTS` check) answers 404 "Routine or project not found", the same answer as the no-row case.
- `backend/src/request-input.ts`: new `hasPgCode(error, code)` helper.

## Verification

- New route tests: a pool that throws `23505` gets the 409 text; a pool that throws `23503` on the link update gets 404, not 500.
- `backend/test/db.integration.test.ts`: the existing duplicate-name check now also asserts the 409 text (runs in CI only; no local `plan_test` DB).
- `npm run typecheck -w backend`, `npm run lint`, `npm test -w backend`: 166 pass, 0 fail, 21 skipped.
