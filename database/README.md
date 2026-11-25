# Plan, Practice, Routine, Feedback PostgreSQL

PostgreSQL 17. The only source of migrations is `migrations/NNN_<description>.sql`. On an empty Docker volume, Docker applies nothing; the runner applies the files, and CI also applies all files in order.

Right after you first start an empty volume, run `npm run db:migrate` once to apply every file and leave a record.

Apply to an existing DB with the runner. The source of the rules is `docs/conventions/database.md` in `sirloinbh/project-standards`.

```powershell
npm run db:migrate             # apply pending files
npm run db:migrate -- --status # only show the applied and pending lists
```

The runner records the applied files and their checksums in the `schema_migrations` table. It does not run an applied file again, and it stops if the content has changed. So **do not edit an applied file**; change it with a new numbered file. On a DB without the record table, the first run applies everything again from 001. `deploy/remote-deploy.sh` runs the same runner with `dist/migrate.js` at deploy time. Do not use psql meta commands, `BEGIN`/`COMMIT`, or `CREATE INDEX CONCURRENTLY` inside a file.

Only when the runner cannot be used, copy the file into the container and apply it there. In this case no record is left.

```powershell
docker compose cp database/migrations/NNN_<description>.sql db:/tmp/NNN_<description>.sql
docker compose exec -T db psql -U plan -d plan -v ON_ERROR_STOP=1 -f /tmp/NNN_<description>.sql
```

Do not pass the file through a PowerShell pipe such as `Get-Content … | docker compose exec … psql`. Windows PowerShell 5.1 sends ASCII to external programs, so Korean text turns into `?`.

Rules: write every migration so it is safe to run again. A parallel branch reserves its number when it starts. Keep the meaning of existing data, and leave values you could not confirm as NULL. For Korean literals in SQL, use the `U&'\\XXXX'` escape when possible.

## Local test database (`plan_test`)

The DB integration tests (`backend/test/db-*.integration.test.ts` and `ai-tools.integration.test.ts`) run only when `TEST_DATABASE_URL` is set; without it they are skipped, and a skipped test is not a pass. They write to the database and clean up, so give them their own role and database, never the app's `plan` database and never another project's database. The shell default of `TEST_DATABASE_URL` may point at another project, so set it for each command.

Create the role and database once in the compose db container (it runs as the `plan` superuser; the port is bound to 127.0.0.1 only, and the password is a local test value, not a secret):

```powershell
docker compose up -d db
docker compose exec -T db psql -U plan -d postgres -v ON_ERROR_STOP=1 -c "CREATE ROLE plan_test LOGIN PASSWORD 'plan_test'" -c "CREATE DATABASE plan_test OWNER plan_test"
$env:DATABASE_URL = "postgres://plan_test:plan_test@127.0.0.1:15407/plan_test"; npm run db:migrate   # apply every migration; repeat after each new migration
$env:TEST_DATABASE_URL = "postgres://plan_test:plan_test@127.0.0.1:15407/plan_test"; npm test -w backend
```

On bash or zsh use `DATABASE_URL=... npm run db:migrate` and `TEST_DATABASE_URL=... npm test -w backend` on one line each. A full backend run takes about 15 seconds and should report 0 skipped.

Run only one test process at a time against `plan_test`: two runs at once (for example two worktrees) clean each other's rows, and one hangs or fails. CI uses its own PostgreSQL service and does not need any of this.
