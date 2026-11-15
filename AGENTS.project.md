# Plan, Practice, Routine, and Feedback Project Instructions

This file holds rules that apply only to plan-routine. The common instructions are in [AGENTS.md](AGENTS.md), which becomes a centrally managed file after the central standards (`sirloinbh/project-standards`) are synced. If the two files differ, this file wins.

## Work procedure (in addition to the common procedure)

- **After you open a PR, review it yourself 1 or 2 times (more only while blocking findings remain, per std-code-review section 8).** Fix findings on the same branch in additional commits between rounds, and post each round as a PR comment. If there are no findings, go straight to the next step. File a new issue card for a big problem outside this PR's scope instead of growing the PR. The detailed procedure is step 5 of [plan-routine-implementation](skills/plan-routine-implementation/SKILL.md).
- **Then, when all required CI checks on the final head pass, the agent (main agent or local worker) merges without asking.** Use `scripts/gh-project.ps1 pr merge <url> --merge --match-head-commit <verified head SHA>` (merge commit) and confirm that the linked issue (`Closes #N`) is closed. Merge consecutive PRs in order. After the earlier PR is merged, merge `origin/main` into the next PR branch, resolve conflicts, rerun the related tests, push normally (no force), and merge after CI passes. Do not merge with failing or running checks, bypass branch protection with `--admin` or similar, replace review by approving your own PR, commit or push directly to `main`, or force push. A merge to `main` does not trigger a deploy yet (no deploy is connected). When automatic deploys are connected, add a step to this item for checking the deploy result after merging.
- **Merge guards (project-standards ADR-0016):** if the PR's "Check before merging" lists an item that needs the user's own decision, ask the user and do not merge. Merging is not applying: real production or AWS changes (for example `terraform apply` or a manual deploy action) still need the user's OK.

## Project skills

- [plan-routine-implementation](skills/plan-routine-implementation/SKILL.md), [plan-routine-testing](skills/plan-routine-testing/SKILL.md), [plan-routine-foundation](skills/plan-routine-foundation/SKILL.md): these hold this project's review and merge procedure, so keep them even after the common skills (std-\*) arrive.

## Service rules

- None yet. When a domain rule that applies only to this project appears, write it here.
