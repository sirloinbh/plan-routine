# 304: Fix the deploy wording in AGENTS.project.md

Issue: [#304](https://github.com/sirloinbh/plan-routine/issues/304).

## Why

Work procedure item 2 said no deploy is connected. `deploy/autodeploy.sh` deploys origin/main after CI passes. User decision 2026-11-24 (issue comment): "not sure, treat as live" about whether the server timer is installed.

## Changes

- `AGENTS.project.md` item 2: a merge may deploy through the pull-based autodeploy (not confirmed on the server, treat as live); never deploy manually; if a CI run on main fails after the merge, stop and report.
- A search of project-owned docs found no other "no deploy is connected" text (the skill was fixed in #293).

## Verification

See the PR.
