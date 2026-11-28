# #373 Remove explanatory, example and motivational text

- Issue: [#373](https://github.com/sirloinbh/plan-routine/issues/373) (tracking: sirloinbh/project-standards#1216; rule: design-system `docs/guidelines.md`, "Screen text rule")

## Changes — 2026-11-29

Search used: `description=`, `e\.g\.`, `placeholder=`, `aria-describedby`, `-hint` ids and `text-muted-foreground` paragraphs in `frontend/src` (not tests, not the UI kit).

Removed:

- Page descriptions on all 13 pages in `app.tsx` (`Page` description is now optional), including "A 9x9 goal chart", and the Mandalarts empty-state explanation "A Mandalart is a 9x9 chart ...".
- Every input placeholder: the `e.g.` examples of weekly, 4-week and 12-week routines (the `examples` prop is gone), "Unit, e.g. pages", "Target", "Reason (optional)", project link name and URL examples, the 12-week goal prompt, the default routine name prompt.

Kept: labels, errors, empty-state hints that name the next step, status text, dialog consequence text.

Tests: two assertions on the removed placeholders are gone.
