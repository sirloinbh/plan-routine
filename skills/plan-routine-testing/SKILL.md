---
name: plan-routine-testing
description: Write or update behavior-focused tests with plan-routine implementations and fixes, run them before commits and PR creation or updates, and record actual results. Use with plan-routine-implementation; for documentation-only changes validate the changed artifacts instead of adding unrelated app tests.
---

# Plan, Practice, Routine, Feedback: writing and running tests

Follow the project's AGENTS.md and the plan-routine-implementation procedure together. This skill is the standard for writing and running tests, and it keeps the issue, branch, docs, and PR procedure and the policy of automated code review after the PR (up to 2 rounds) → merge after CI passes.

## Write with the implementation or fix

- When you implement a feature or fix behavior, add or update test code that verifies that requirement, and include the implementation and the tests in the same work commit. Do not let running existing tests stand in for verifying the new feature.
- For a bug fix, add a regression test that catches the bug coming back. If possible, confirm it fails before the fix and passes after, and if you cannot reproduce it, record that limit.
- For a refactor, verify that the existing behavior is kept. If the related tests are enough you can keep them as they are, but strengthen the scenarios that fall short.
- Rather than tests that repeat the internal implementation, verify results the user can see and domain rules. Choose the normal path and the input errors, boundaries, and failure paths that relate to the change.
- Choose unit tests for business logic, integration tests for API, DB saves, and transactions, and component or browser tests for screen input and save flows. Do not add every kind to every change.
- Check the installed test tools and commands in `package.json`. The frontend uses Vitest and Testing Library (`*.test.tsx` next to the target), and the backend uses `node:test` (`backend/test/*.test.ts`). Do not report as if you used a tool that is not installed, such as Playwright.
- Keep test data separate from production and user data. Write checks that depend on time, dates, or random values so they verify the same meaning when the run environment changes.

## Before a commit

- Check the changes and tests that will be in the final commit, and actually run the related tests. Include the implementation, tests, and docs record in the same commit.
- Leave the test code path, the verified behavior, and the run command and result in the matching issue record under docs/changes.
- Do not make a failing test pass by skipping or deleting it or by weakening an assertion. Resolve the failure and then commit.
- If you cannot prepare the needed run environment, record that you did not run it. Do not report an unverified implementation as complete, and hand over a PR with remaining verification as a draft.

## Before creating or updating a PR

- Run the related tests and the project's required checks on the final diff and confirm they pass. If nothing changed after the commit and the result for the same target is still valid, you do not need to repeat the same check.
- Record in the PR the tests you added or changed, the run commands, pass/fail/skip, and the reason for anything not run. Do not count an integration test skipped because the DB environment variable was not set as a success.
- If you fix code or tests after the PR, run the affected checks again and update the docs and PR results. Resolve CI failures too.
- If only documents, skills, or formatting changed and app behavior did not change, verify with the validator, formatter, and link check for those artifacts and write why you did not add app tests. A behavior change in executable code or a check script includes the related tests or a run verification.
- Include the related tests in the follow-up commits of the automated code review too, and run the related tests again on the last commit. Do not merge before all required CI checks on the final head pass. For the review and merge procedure, follow plan-routine-implementation.
