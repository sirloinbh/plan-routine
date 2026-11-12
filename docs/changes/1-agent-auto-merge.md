# #1 Change to the agent PR auto-merge policy

- Issue: https://github.com/sirloinbh/plan-routine/issues/1
- Date: 2026-10-21 (Asia/Seoul)

## Purpose

The repository owner explicitly instructed a merge policy change on 2026-10-21. Change the rule "only the user merges PRs" to a policy where the agent merges after CI passes, so that merges do not have to be requested again for every project.

## Changes

- New policy: when all required CI checks pass, the agent (the main agent or a local worker) merges without asking, with a merge commit using `scripts/gh-project.ps1 pr merge <url> --merge --match-head-commit <head SHA>`, and checks that the linked issue was closed.
- Consecutive PRs: merge them in order. After the earlier PR is merged, merge `origin/main` into the next PR branch to resolve conflicts, run the related tests again, push normally (no force), and merge after CI passes.
- Still forbidden: merging with a failed or running check, bypassing branch protection with `--admin` or similar, replacing review by approving your own PR, committing or pushing directly to `main`, and force push.
- Deployment: merging to `main` currently does not trigger a deployment (no deployment is connected), so checking the deployment after the merge is not applicable. This is stated in AGENTS.md and the implementation skill.
- Edited files: `AGENTS.md`, `README.md`, `docs/project-setup.md` (absolute rule 2, the order and merge items of the Git strategy, the file role table, the AGENTS.md template), `skills/plan-routine-{implementation,foundation,testing}/SKILL.md` (including the front matter description of the implementation skill), and the `.claude/skills/` copy (`npm run skills:sync`).
- The "squash merge recommended" text in `docs/project-setup.md` was replaced to match the new policy (merge commit).
- Past records (`docs/changes/bootstrap.md`, `docs/daily`) were not edited. There is no script or test in the repository that checks the merge policy, so there was nothing to edit.

## Verification

- `npm run skills:sync` → `Copied skills/ to .claude/skills/.`
- `npm run test:skills` → **4 pass / 0 fail / 0 skip** (including that the copy matches)
- skill-creator `quick_validate.py` (UTF-8 mode `python -X utf8`) on the 3 skills → all `Skill is valid!`
- Prettier 3.9.10 (the same as the version pinned in the repository; local `node_modules` was not installed, so workout-memo's installed copy was used) `--check` on the changed files → passed
- Only documents and skills changed, so no app tests were added. There is no local `node_modules`, and installing packages needs the user's reconfirmation, so the whole local `npm run check` was not run. The full check is confirmed by GitHub Actions `verify` (`npm run check`) and `docker-build`.

## 2026-10-21 — Automated review after the PR (up to 2 rounds)

### Purpose

The repository owner supplemented the merge policy on the same day. Instead of merging right after CI passes, after opening the PR it goes through the automated code review up to 2 rounds, applies the follow-ups, then confirms that CI passes on the final head and merges.

### Changes

- New policy: after opening the PR, go through the automated code review up to 2 rounds (review → follow-up commit → second review → follow-up commit). After the second follow-up commit, do not review further. If there is nothing to improve, go straight to the CI check. Split a fix too large for this PR (a feature outside the requested scope, a design or data structure change, a fix across several modules, or work needing separate verification) into a new issue card. If a defect that would break main if split off, or a defect with a security or data corruption risk, remains, do not merge and tell the user. After that, when all required CI checks on the final head pass, merge with `--merge --match-head-commit <verified SHA>`. If a new commit appears during the review, do not merge with the earlier CI result.
- `skills/plan-routine-implementation/SKILL.md`: added the step "5. Automated code review after the PR (up to 2 rounds)" between "Create the PR after testing" and "Merge after CI passes", and renumbered the merge step to 6. Updated the front matter description and the introduction to the new order.
- `AGENTS.md` procedure: split step 5 into an automated review summary and made the merge step 6. The existing prohibitions (merging with a failed or running check, `--admin`, self-approval, pushing directly to main, force push) and the handling of consecutive PRs were kept.
- One-line mentions updated: `README.md`, `docs/project-setup.md` (absolute rule 2, the order, review, and merge items of the Git strategy, the file role table, the AGENTS.md template), `skills/plan-routine-{foundation,testing}/SKILL.md`, and the `.claude/skills/` copy (`npm run skills:sync`).
- Past records (the earlier section of this file, `docs/changes/bootstrap.md`, `docs/daily`) were not edited.

### Verification

- `npm run skills:sync` → `Copied skills/ to .claude/skills/.`
- `npm run test:skills` → **4 pass / 0 fail / 0 skip** (including that the copy matches)
- skill-creator `quick_validate.py` (`python -X utf8`) on the 3 skills → all `Skill is valid!`
- Prettier 3.9.10 (the same as the version pinned in the repository; local `node_modules` was not installed, so workout-memo's installed copy was used) `--check` on the changed files → one table alignment warning in `docs/project-setup.md` was fixed with `--write`, then it passed
- Only documents and skills changed, so no app tests were added. Installing packages needs the user's confirmation, so the whole local `npm run check` (lint, typecheck, build) was not run. The full check is confirmed by GitHub Actions.
