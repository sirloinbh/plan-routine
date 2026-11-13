# #85 Regression where discarded text comes back to life after the diary draft is kept again

- Issue: [#85](https://github.com/sirloinbh/plan-routine/issues/85)
- Branch: `fix/85-diary-discard-regression`
- Date: 2026-11-01 (Asia/Seoul)

## Background

This is the regression found in the second review of PR #84 of [#64](https://github.com/sirloinbh/plan-routine/issues/64). The fix command and the merge command were run at the same time, and while the fix stopped because of a grammar error in a test title, the merge went ahead first, so it entered `main` without the fix. The merge only checks that CI passes and the commit matches, so it could not stop it. From now on, I run the merge command alone, after looking at the result of the earlier work. Deployment is not connected, so there was no real user impact.

## Changes

`frontend/src/diary.tsx`.

- If keeping again the draft that another tab deleted succeeds, the "taken away" state is released. Otherwise, even discarding in this tab did not delete the draft, so the discarded text was restored the next time it was opened.
- The basis of the draft is read only when restoring. The draft in the storage may be another tab's, so reading it every time you write inherited the other tab's basis. Then the notice "the saved content changed" appeared falsely, or, more dangerously, did not appear.
- Even if a write event from another tab is received, if what is in the storage is this tab's text, it is not treated as taken away. When tabs write almost at the same time, the event may be older than this tab's write.

Clarified the verification sentence of `docs/changes/64-diary-two-tabs.md` and wrote the second review result.

## Tests

`frontend/src/diary.test.tsx`: after the order of overwrite, delete, and discard, no draft remains and it is not restored even when reopened. Keeping the first basis when taking it back. No false notice when continuing to write after saving. Not inheriting the other tab's basis. An event older than this tab's write.

## Verification

- Local: `env -u TEST_DATABASE_URL npm run check` passed. Backend 142 pass / 0 fail / 19 skip (DB tests) out of 161, frontend 284 pass / 0 fail / 2 skip (dark-mode-only shared tests) out of 286, and `test:skills` 4 pass.
- Browser: with a temporary API and two real tabs at 1440×900, I again checked the overwrite warning, taking it back, and restoring a deleted draft. That nothing is restored after discarding was checked by screen tests.

## Limits and follow-up

- If a clean tab saves or types only whitespace, it can delete another tab's draft without a warning. This is an existing problem, so it was split off to [#87](https://github.com/sirloinbh/plan-routine/issues/87).

## Automated code review

- First: I confirmed in a temporary copy that the 2 new tests fail without the fix. I found and applied 2 paths with the same cause and 1 number in the record. I changed it to read the basis only when restoring, which reduced the paths to one.
- Second: no behavior defect. Fixed the comments and the PR body. 1 existing problem was split off. After the fix, I checked again with two real tabs at 1440×900. The review ends at 2 rounds.
