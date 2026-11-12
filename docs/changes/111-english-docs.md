# #111 Translate the current Korean docs to English

- Issue: [#111](https://github.com/sirloinbh/plan-routine/issues/111)
- Branch: `docs/111-english-docs`
- Date: 2026-11-13 (Asia/Seoul)

## Purpose

Part of sirloinbh/project-standards#487. Every markdown file outside `docs/changes/`, `docs/daily/`, and `docs/adr/` is English. The past records are handled in #110.

## Changes

- Translated `README.md`, `backend/README.md`, `frontend/README.md`, `database/README.md`, `docs/next-steps/README.md`, and `docs/project-setup.md`.
- Translated the project skills `skills/plan-routine-{foundation,implementation,testing}/SKILL.md` and copied them to `.claude/skills/` (the copy is kept equal by `npm run skills:check`).
- Commands, paths, identifiers, code blocks, issue numbers, and dates are unchanged.
- Skipped: files in `.standards/manifest.json` and files with the "Managed file" header (`AGENTS.md`, `CLAUDE.md`, `skills/std-*`, `.claude/skills/std-*`, and so on). The central repository translates them.

## Korean kept on purpose

- The GitHub label names `기능: …`, `작업: …`, and `추적` in `docs/next-steps/README.md` (they are real label names; an English gloss is added).
- The routine name '목표 재설정' (reset goals), which is a seeded data value.
- `FORM · 나의 운동 기록` (a display name example), `'기타'` (a data example), and the font name `Noto Sans KR` in `docs/project-setup.md`.
- `docs/project-setup.md` is a copy of a handoff template from another project. Its "write documents in Korean" rule was translated to the current English rule.

## Verification

- `prettier --check` on the changed files: pass (after `--write` on `docs/project-setup.md`).
- `node scripts/claude-skills.mjs`: `.claude/skills` matches `skills/`.
- Hangul search over the scope: only the items listed above remain.
