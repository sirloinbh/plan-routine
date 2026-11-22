# #159 Make the migration CLI fail cleanly and reject unknown flags

Issue: https://github.com/sirloinbh/plan-routine/issues/159

## Purpose

`npm run db:migrate` (also run by the deploy script) should print one clear line when it cannot connect, and refuse a mistyped flag with exit 1.

## Changes

- Unknown flags: the managed CLI already refuses them with `Unknown option: ... The only option is --status.` and exit 2, before it connects. The card asked for exit 1; the coordinator decided to keep the central exit code 2, so the entry adds nothing here.
- The entry imports the managed CLI inside a `try`, so a failure while connecting prints `Migration failed: <message>: <cause>` (via `describeError`, which also unwraps pg's `AggregateError` and `cause`) and exits 1 instead of an unhandled stack trace.
- `backend/test/migrate-cli.test.ts` (new) runs the entry as a child process: an unreachable `DATABASE_URL` gives exit 1 and one line of output; `--stauts` gives exit 2 and no connection attempt.

## Verification

`npm run check` passed locally (backend 163 pass, after the exit-code change). DB integration tests run in CI only (no local `plan_test`).

## Limits and follow-up

These parts of the card live in managed files (`backend/src/standard/migrate.ts`, `standard/migrations.ts`) and were not edited here. They are tracked in `sirloinbh/project-standards`: connect-in-try with the cause and the unlock log are #1002, and the Pool typing is #997:

- `client.connect()` is outside the `try` in the managed CLI (this entry now catches it from outside).
- `MigrationDb` is already `Pick<Client, 'query'>` with a comment about the single connection, so the Pool typing item is already done upstream.
- A failing unlock after every file committed still throws in `migrate()` and reports a failed migration.
