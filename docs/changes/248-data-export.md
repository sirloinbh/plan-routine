# Export all data as JSON and CSV (closes #248)

## Purpose

Data lived only in the PostgreSQL volume, and `docker compose down -v` deletes it. The user can now download a copy.

## Changes

| File                                                    | Change                                                                                                                                                                                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `backend/src/export-routes.ts`                          | `GET /api/export` (versioned JSON of every table, listed from `information_schema` at request time, one read-only snapshot), `GET /api/export/checks.csv`, `GET /api/export/diary.csv`; attachments, `Cache-Control: no-store` |
| `backend/src/export-csv.ts`                             | UTF-8 CSV with a byte order mark and CRLF; cells starting with `=`, `+`, `-`, `@`, tab or CR get a leading apostrophe                                                                                                          |
| `backend/src/app.ts`, `openapi.ts`, `docs/openapi.json` | Routes registered behind the shared sign-in and documented                                                                                                                                                                     |
| `frontend/src/export-section.tsx`, `app.tsx`            | "Download your data" card on the Settings page: the file is fetched first and saved only on success, so an error is never saved as a file                                                                                      |
| `docs/data-export.md`, `README.md`                      | What `down -v` deletes, how to download, the CSV rules, and a pointer to `deploy/backup.sh`                                                                                                                                    |
| tests                                                   | CSV unit tests, route tests with a fake pool (content, headers, 401 without a session), DB test that compares the export with row counts of every table (CI), UI tests                                                         |

## Notes

- Tables are discovered, not listed, so tables other work adds (weekly reviews from #242, skips from #243) are included without a change here. Only `schema_migrations` is left out.
- Import is out of scope, as the issue says.

## Verification

- Browser check at 390x844 and 1440x900 on Vite (port 5217, mocked `/api`): a real file download happened and the page has no horizontal scroll.
- No local `plan_test` database: `db-export.integration.test.ts` is skipped locally and runs in CI.
