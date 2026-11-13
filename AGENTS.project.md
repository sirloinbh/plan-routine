# Plan, Practice, Routine, and Feedback Project Instructions

This file holds rules that apply only to plan-routine. The common instructions are in [AGENTS.md](AGENTS.md), which becomes a centrally managed file after the central standards (`sirloinbh/project-standards`) are synced. If the two files differ, this file wins.

## Work procedure (in addition to the common procedure)

- **After opening a PR, run the automatic code review at most twice.** If the review finds something to improve, fix it with an extra commit, and after the first round of fixes get a second review once more. After the second round of fix commits, do not review again. If there is nothing to improve, go straight to the next step. Split a fix that is too big for this PR into a new issue card. The detailed procedure is step 5 of [plan-routine-implementation](skills/plan-routine-implementation/SKILL.md).
- **Then, when all required CI checks on the final head pass, the agent (main agent or local worker) merges without asking.** Use `scripts/gh-project.ps1 pr merge <url> --merge --match-head-commit <verified head SHA>` (merge commit) and confirm that the linked issue (`Closes #N`) is closed. Merge consecutive PRs in order. After the earlier PR is merged, merge `origin/main` into the next PR branch, resolve conflicts, rerun the related tests, push normally (no force), and merge after CI passes. Do not merge with failing or running checks, bypass branch protection with `--admin` or similar, replace review by approving your own PR, commit or push directly to `main`, or force push. A merge to `main` does not trigger a deploy yet (no deploy is connected). When automatic deploys are connected, add a step to this item for checking the deploy result after merging.

## Project skills

- [plan-routine-implementation](skills/plan-routine-implementation/SKILL.md), [plan-routine-testing](skills/plan-routine-testing/SKILL.md), [plan-routine-foundation](skills/plan-routine-foundation/SKILL.md): these hold this project's review and merge procedure, so keep them even after the common skills (std-\*) arrive.

## Service rules

- None yet. When a domain rule that applies only to this project appears, write it here.
