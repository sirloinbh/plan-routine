# Fix outdated descriptions in the app skills (sirloinbh/project-standards#313)

## Purpose

Two app skills described things differently from the current state (sirloinbh/project-standards `docs/research/convention-survey.md`, chapter 3).

## Changes

| File                                      | Before                                                      | After                                                                                                    |
| ----------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `skills/plan-routine-testing/SKILL.md`    | "Vitest and Playwright, not yet adopted"                    | Frontend Vitest and Testing Library, and backend `node:test`, are installed. Playwright is not installed |
| `skills/plan-routine-foundation/SKILL.md` | Design tokens are CSS variables in `frontend/src/style.css` | `@sirloinbh/design-tokens` and the shared UI components (`frontend/src/components/ui/`)                  |
| `.claude/skills/`                         | —                                                           | Same content copied with `npm run skills:sync`                                                           |

The review and merge procedure (`plan-routine-implementation`, `AGENTS.project.md`) was not changed.

## Verification

- `node scripts/claude-skills.mjs`: `.claude/skills matches skills/.`
