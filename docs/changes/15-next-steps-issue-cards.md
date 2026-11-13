# #15 Reflect the registered issue cards and labels in the next-steps document

- Issue: https://github.com/sirloinbh/plan-routine/issues/15
- Date: 2026-10-22 (Asia/Seoul)

## Purpose

At the user's request, the basic feature requirements were broken into issue cards #3 to #13 and the roadmap #14, registered, and given priority and characteristic labels. Update the next-steps document, which was still "waiting for the user to register", to the real order of work.

## Changes

- `docs/next-steps/README.md`: recorded the order of work, priorities, prerequisite relations, and the label scheme of the 11 cards. The earlier "design of DB migration 002 for the first feature" was replaced by #3.
- Added `docs/daily/2026-10-22.md` and updated the `docs/daily/README.md` list.
- Remote (GitHub) work: created 14 labels (`P0` to `P3`, `기능: *` (feature), `작업: *` (kind of work), `추적` (tracking)) and attached them to #3 to #14, and also attached `documentation`, `P1 높음` (P1 high), and `작업: 설계` (work: design) to this work issue #15. There is no code change.

## Verification

- Prettier 3.9.10 (the same as the version pinned in the repository; local `node_modules` was not installed, so workout-memo's installed copy was used) `--check` on the changed files → `All matched files use Prettier code style!` (table alignment fixed with `--write`)
- Only documents changed, so no app tests were added. The full check is confirmed by GitHub Actions `verify` and `docker-build`.

## Limits

- The prerequisite relations are based on the body of roadmap #14. When starting each card, check again the prerequisite and needs-confirmation items in the issue body.

## Automated code review

- First: no blocking defect. 2 follow-ups (a missing limits item, and #15 missing from the scope of label attachment) were reflected in this record. The finding about the missing 2026-10-21 daily record was left out of scope because it is the state before this PR.
- Second: nothing to improve. Confirmed the 2 first-review follow-ups were applied. The review ends at 2 rounds.
