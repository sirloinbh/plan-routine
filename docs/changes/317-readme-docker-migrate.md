# 317: Add the migrate step and local sign-in notes to the README Docker section

Issue: [#317](https://github.com/sirloinbh/plan-routine/issues/317).

## Why

The #291 steps were followed as written on a Mac on 2026-11-26 against the local stack (network create, `NODE_AUTH_TOKEN`, `docker compose up --build -d`): web answered 200 and `/api/health` 200. Gaps found: no migrate step (the API was healthy with 0 tables), no hint that screens stay empty without shared-auth, and the compose project name depends on the folder.

## Changes

- README Docker section: `npm run db:migrate`, the `-p plan-routine` note, and the 401 explanation with a pointer to the development run.

## Verification

- Real run: images built, `db:migrate` applied 001 to 013 to the empty local `plan` DB, web 8107 and health answered 200, `/api` answered 401 without a session. With a throwaway local auth stub (removed afterwards) every screen (today, diary, records, stats, weekly review, search, routines, weekly, settings) loaded with seeded local data at 390x844 and 1440x900, with no horizontal overflow and no console errors.
- The local `plan` DB now holds a few test routines, checks and diary entries (test data, not real data).
- The development run (`AUTH_DISABLED=1 npm run dev`) was not verified: the API crashed because this worktree's shared `node_modules` lacks `web-push` (an install problem of this checkout, not of the README).
