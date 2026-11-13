# #110 Translate past records in docs to English

- Issue: [#110](https://github.com/sirloinbh/plan-routine/issues/110)
- Branch: `docs/110-english-records`
- Date: 2026-11-13 (Asia/Seoul)

## Purpose

Part of sirloinbh/project-standards#487. The change records and daily logs under `docs/` are English. The current docs are handled in #111.

## Changes

- Translated all 45 Korean files in `docs/changes/` and `docs/daily/` (there are no files in `docs/adr/`).
- Kept headings, numbers, file paths, commands, command output, issue and PR numbers, run IDs, and dates unchanged.
- Quoted server response messages (for example in `47-request-body-errors.md` and `68-zod4-syntax.md`) and seeded data values ('목표 재설정', reset goals) were kept in Korean with an English gloss.
- UI labels and menu names that the records quote were translated to English words (the records describe the state at that time).

## Verification

- `prettier --check` on the changed files: pass.
- Hangul search over `docs/changes/` and `docs/daily/`: only the kept items above remain.
