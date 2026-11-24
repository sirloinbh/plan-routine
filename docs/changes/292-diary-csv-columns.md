# 292: Correct the diary CSV columns in the data export doc

Issue: [#292](https://github.com/sirloinbh/plan-routine/issues/292).

## Why

`docs/data-export.md` listed one "notes" column for the diary CSV. `backend/src/export-routes.ts` writes `date, entry, went_well, could_be_better, tomorrow, mood, energy, updated_at`.

## Changes

- The diary row of the table in `docs/data-export.md` lists the real columns. The checks CSV row (`date, routine, cadence, category, checked_at`) was compared with the code and already matched.

## Verification

See the PR.
