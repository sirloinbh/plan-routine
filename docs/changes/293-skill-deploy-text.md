# 293: Fix the skill text that says merging to main does not deploy

Issue: [#293](https://github.com/sirloinbh/plan-routine/issues/293).

## Why

`skills/plan-routine-implementation/SKILL.md` section 6 said no deployment is connected. `deploy/autodeploy.sh` deploys origin/main after CI passes, so a merge is a production deploy (AGENTS.md says so too).

## Changes

- The skill now says a merge deploys through autodeploy, tells the agent to confirm the `ci` run on the merge commit passed, and not to deploy by hand.
- `.claude/skills/` copy regenerated with `npm run skills:sync`.

## Not changed

`AGENTS.project.md` has the same stale sentence (line 8). It is not in this lane's owned paths; reported to the coordinator.

## Verification

See the PR.
