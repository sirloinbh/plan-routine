---
name: plan-routine-foundation
description: Establish or improve the repeatable development foundation of the plan-routine app, covering stack, structure, conventions, API contracts, design, tests, AI guidance, and deployment. Use for project foundation requests; apply only the requested scope through the plan-routine-implementation issue-to-PR workflow.
---

# Plan, Practice, Routine, Feedback development foundation

Make the development, verification, and operation of this app repeatable. First read the project root `AGENTS.md` and `skills/plan-routine-implementation/SKILL.md`, and proceed through: issue → numbered branch → implementation and docs record → tests and PR → automated code review (up to 2 rounds) → merge after CI passes. This skill does not skip the issue and PR procedure or grant deployment permission.

## Standards

- The reference document is `docs/project-setup.md`. Check the current package.json, lock files, API and SQL, Compose, and CI, and separate what is actually implemented from recommendations (not adopted). Do not install the whole recommendation list automatically.
- The user is the owner alone, and a login is not in the current requirements. Dates follow Asia/Seoul.
- When you change or add a tool, first write down the real problem, the data impact, and the verification method, and install packages only after the user reconfirms.

## Steps

1. Decide the current state and the issue's done criteria, and record the reason for the choice, the structure, and the contracts in the documents.
2. Align the tool settings, run commands, CI, and documents in the same change. Do not create unused settings, scripts, or empty modules.
3. For API and DB changes, keep the meaning of existing data and of dates and units, and verify how migrations are applied and how a failure is recovered. Keep a single source for DB migrations.
4. For screen changes, use the design tokens (`@sirloinbh/design-tokens`) and the shared UI components (`frontend/src/components/ui/`), and handle loading, empty results, errors, and keyboard access within the scope.
5. Apply `skills/plan-routine-testing/SKILL.md` together. Write the implementation and the tests together, add a regression test for a bug, and record the actual results in the docs and the PR.
6. Deploy only within the scope the user requested. Prepare the image version, the health check, secret management, backup and restore, and recovery to the previous version.
7. Include a docs record in each work commit and create a verified PR. After the PR, go through the automated code review up to 2 rounds and apply follow-up commits (split large fixes into new issues), and once all required CI checks on the final head pass, merge with a merge commit as the plan-routine-implementation procedure says.

## Done criteria

Installing, running, and verifying must be reproducible in a new environment as the documents say, and the chosen tools must be reflected in the actual code, commands, and CI. State tools that are not installed, checks that were skipped, and deployments that were not actually done as follow-up work.
