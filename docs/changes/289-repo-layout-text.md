# 289: Fix the repository layout text that still describes subtree sync

Issue: [#289](https://github.com/sirloinbh/plan-routine/issues/289).

## Why

This repository is the only source and deploy repository (ADR-0022), but README and the `backend/` and `frontend/` READMEs still described `git subtree split` to deployment repositories through `scripts/push-repositories.ps1`, which does not exist.

## Changes

- README "Repository layout" now describes one repository with workspaces and no subtree sync.
- `backend/README.md` and `frontend/README.md` say they are workspaces of this repository.
- `docs/project-setup.md` (a handoff document written from workout-memo) gets a note at the top that its subtree sub-repository parts are historical for this project. The rest of the text is kept as the template it is.

## Verification

See the PR.
