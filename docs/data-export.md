# Back up and export your data

Your data lives only in the PostgreSQL volume (`plan-routine-data`). **`docker compose down -v` deletes that volume and everything in it.** Plain `docker compose down` keeps it.

## Download from the app

Open **Settings**, section **Download your data**:

| Button          | File                                  | Content                                                                                                                                                                                                             |
| --------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All data (JSON) | `plan-routine-export-YYYY-MM-DD.json` | `{ version, exportedOn, tables }`: every row of every table in the database, found at download time (so tables added by later migrations are included). Only the migration runner's `schema_migrations` is left out |
| Checks (CSV)    | `plan-routine-checks-YYYY-MM-DD.csv`  | One row per check: date, routine, cadence, category, checked_at (UTC)                                                                                                                                               |
| Diary (CSV)     | `plan-routine-diary-YYYY-MM-DD.csv`   | One row per entry: date, entry, notes, mood, energy, updated_at (UTC)                                                                                                                                               |

The same files come from `GET /api/export`, `GET /api/export/checks.csv` and `GET /api/export/diary.csv`. They need the shared sign-in like every other `/api` route.

- The JSON export reads all tables in one read-only snapshot, so the tables agree with each other. Dates are `YYYY-MM-DD` and timestamps are ISO 8601 (UTC).
- CSV files are UTF-8 with a byte order mark, so Excel shows Korean text correctly. A text cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return gets a leading `'`, so a spreadsheet shows it as text instead of running it as a formula.
- Import (restore from JSON) is not built. Restore from a database backup as below.

**The files are your real data.** Do not commit them, attach them to issues or PRs, or paste them into chats.

## Database backups on the server

`deploy/backup.sh` (started by `plan-backup.timer`, and before each deploy) dumps the database with `pg_dump` to `/var/backups/plan` and keeps 14 days; it copies the dump to S3 when the server `.env` names a bucket. `plan-restore-check.timer` restores the newest dump into a throwaway container each week and compares row counts. See `deploy/backup.sh` for the exact steps.

A JSON/CSV download is a convenient extra copy for reading or moving data, not a replacement for those dumps.

## Before you run `down -v`

1. Download **All data (JSON)** (and the CSVs if you want them in a spreadsheet).
2. Check that the file is not empty and is stored outside the repository folder.
3. Only then remove the volume.
