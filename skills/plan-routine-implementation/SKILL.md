---
name: plan-routine-implementation
description: Follow the user's issue, numbered branch, implementation with docs, tests, and PR workflow for changes to the sirloinbh plan-routine project. Use for code, configuration, documentation, and skill edits; exclude read-only questions and recommendations. After opening the PR, run at most two automated code reviews (review, fix commit, second review, fix commit), split oversized fixes into new issues, then merge with a merge commit once all required CI checks pass on the final head.
---

# Plan, Practice, Routine, Feedback implementation procedure

This skill applies to changes in `sirloinbh/plan-routine`. Do not apply this account, repository, or policy to other projects. Read the project's root `AGENTS.md` and the related documents first. Follow the order below: after the PR, go through the automated code review (up to 2 rounds), and finish the PR through merging once the required CI checks pass.

## 1. Register the issue card

- Check the GitHub remote address and `gh api user --jq .login`. The expected account is `sirloinbh`. If it is another account, do not make remote changes before fixing the authentication.
- Reuse the issue the user named, or an issue already registered for the same request. Check existing results before retrying so you do not create duplicate issues.
- In a new issue, write the problem and purpose, the requested scope, and the done criteria and verification method. In this project, an issue card means a GitHub Issue. Unless a separate Projects board was named, do not create or link a board.
- Write the body to a UTF-8 temporary file and register it with `gh issue create --repo sirloinbh/plan-routine --title ... --body-file ...`. Do not put tokens or secrets in the body.
- Keep the actual issue number and URL that were issued. If the issue registration fails, do not invent a number or start the code change first.

## 2. Create the branch from the issue number

- Check the working tree and the current branch. If there are changes from other work, keep them and avoid mixing work.
- The default target branch is `main`. Do not start new work from an unrelated unmerged work branch. Fetch the remote main in a clean working tree and branch from it. If there are user changes, prepare a workspace that can keep them.
- Branch name: `<type>/<number>-<short-slug>`. Examples: `feat/12-first-feature`, `fix/13-goal-date`, `docs/14-project-skills`, `chore/15-ci`.
- If a branch for the same issue already exists, check its state and keep using it.
- Make changes and commits on this branch. Do not commit or push directly to `main`.

## 3. Implementation and a docs record per commit

- When you implement or fix something, read the project's `skills/plan-routine-testing/SKILL.md` and write or update the related tests together. A bug fix adds a regression test. Implementation, tests, and docs go in the same work commit, and the related tests run before the commit.
- Implement only the requested scope. For development foundation work, read `plan-routine-foundation` too.
- Create `docs/changes/<number>-<slug>.md` and record the issue link, purpose, changes, verification, and limits and follow-up work.
- **Record the changes and verification done in each work commit in docs, in that same commit.** You may accumulate entries in one issue document. A commit that only edits documents also updates the matching work record.
- In the record, write the reason for the change and the observed results. Do not write that a check or deployment was done when it was not run. You do not need to produce the SHA that points to the commit itself in advance. Tell entries apart by commit title or unit of work.
- The commit title includes the type and the issue number, like `feat: ... (#12)`, `fix: ... (#13)`, `docs: ... (#14)`.
- Before staging, check the diff and whether it contains secrets, and stage only the related files by name. Do not include another user's changes.

## 4. Create the PR after testing

- Before you create or update the PR, run the related tests and the required checks on the final change. Leave the test code you added or changed, the behavior you verified, the actual commands you ran, and pass/fail/skip in the docs and the PR. For the required commands and the conditions of the DB integration tests, follow the project `AGENTS.md`. Do not add unneeded app tests to a plain document or skill edit.
- Fix failures, and record in the docs and the PR which checks could not run, which DB tests were skipped, and which browser checks are incomplete. If a required verification is blocked, create the PR as a draft.
- Push only the work branch. The PR target is `main` of `sirloinbh/plan-routine`. The subtree sync script pushes main and the sub-repositories, so do not use it in this step.
- If a PR for the same head branch exists, update it and do not create a duplicate.
- Pass the PR body as a UTF-8 file. Include the problem and the behavior after the change, the main changes, the actual check commands and results, the available evidence for a screen change, and `Closes #<number>`. If there are no images, write why and the limits of the verification.
- Check the GitHub Actions results and fix the related failures. Say that a check is still running if it is. If you changed code after creating the PR, run the affected checks again and update the docs and PR results.

## 5. Automated code review after the PR (up to 2 rounds)

1. **First review**: After you open the PR, run a read-only review that is separate from the authoring context (a separate agent, a review tool, and so on). Look at correctness, regressions, security, missing tests, and the docs record, against the issue's done criteria and the full PR diff.
2. **If there is nothing to improve**, end the review and go on to the CI check and merge.
3. **If there is something to improve**, apply only the findings that can be fixed within this PR's scope. Make an extra commit that carries the related tests and the docs record, and push it.
4. **Second review**: Check that the first findings were applied, and look at the added diff. Also look at the final full PR diff. If there is nothing to improve, go on to CI.
5. **Second follow-up**: Apply the second findings with an extra commit. The review is at most 2 rounds, so do not run a third review; go on to CI.
6. **Split large fixes**: Do not fix findings of the following kinds in this PR. Instead, create a new issue card (with the problem, scope, and done criteria). Leave the issue link in a PR comment and the docs record, and keep going with this PR.
   - A feature outside the requested scope
   - A design or data structure change
   - A fix that spans several modules
   - Work that needs separate verification
7. **Hold the merge**: If the following defects remain, do not merge and tell the user.
   - A defect that would break main if it were split off
   - A defect with a security or data corruption risk
8. **Record**: Leave the result of each review round in a PR comment and the docs work record. Write the findings, the commits that applied them, the issues split off, and whether there was nothing to improve.
9. **Merge after CI**: Run the related tests again on the last commit. When all required CI checks pass on the final head, merge with that SHA (step 6). If a new commit appears during the review, do not merge with the earlier CI result.

## 6. Merge after CI passes

- **When all required CI checks pass on the final head of a PR that finished the automated code review, the agent (the main agent or a local worker) merges without asking.** Right before merging, check the PR head SHA and merge with a merge commit using `scripts/gh-project.ps1 pr merge <url> --merge --match-head-commit <head SHA>`. After merging, check that the linked issue (`Closes #N`) was closed.
- Merge consecutive PRs in order. After the earlier PR is merged, merge `origin/main` into the next PR branch to resolve conflicts, run the related tests again, push normally (no force), wait for CI to pass, and merge. Repeat up to the last PR.
- **If any check failed or is still running, do not merge. Do not bypass branch protection with `--admin` or similar, replace review by approving your own PR, commit or push directly to main, or force push.** If you cannot resolve the CI, leave the PR open and report the reason.
- Merging to main does not currently trigger a deployment (no deployment is connected). If automatic deployment is connected, add a step to check the deployment result after the merge.
- Report the issue URL, the branch name, the PR URL, the verification and CI results, the merge SHA, and the remaining work.

## Authentication and failure handling

Do not recheck the issue, push, and PR permissions that were already given, without need. Follow the execution permissions that the tools require and the GitHub authentication. On failure, resume from the step you completed, and if the result of a remote creation is unclear, look it up before retrying. Do not work around an account or authentication problem by creating things with another account.
