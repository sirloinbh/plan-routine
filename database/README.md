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
