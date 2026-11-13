# #87 Keep a clean diary tab from deleting another tab's draft

- Issue: [#87](https://github.com/sirloinbh/plan-routine/issues/87)
- Branch: `fix/87-diary-clean-tab`
- Date: 2026-11-01 (Asia/Seoul)

## Purpose

A clean tab deleted the draft without knowing whether it was another tab's. Text written and left in another tab was lost when this tab saved without changing anything.

## Changes

`frontend/src/diary.tsx`.

- This tab remembers the text it last kept or restored, and deletes the text in the storage only when it is the same. If there is no such text, it does not delete.
- If a draft that was loaded is the same as the saved content, it is deleted when loading. This is the same behavior as before.
- With this, there is no need to remember the "taken away" state separately, so it was removed (#64, #85).

## Tests

`frontend/src/diary.test.tsx`: saving in a tab with no text to save, and typing whitespace, leave another tab's draft. Reverting to the saved content deletes this tab's draft. A restored text whose re-keeping was rejected is also deleted when discarded. Moving to a day that has a draft equal to the saved content deletes it. The #64 and #85 tests pass as they are.

## Verification

- Local: `env -u TEST_DATABASE_URL npm run check` passed. Backend 144 pass / 0 fail / 19 skip (DB tests) out of 163, frontend 296 pass / 0 fail / 2 skip out of 298, and `test:skills` 4 pass.
- Browser: with a temporary API and two real tabs at 1440×900, I confirmed that the overwrite warning, taking it back, and restoring a deleted draft stay as they were. The case fixed this time was checked only by screen tests.

## Limits and follow-up

None.

## Automated code review

- First: 2 applied. (Low) If re-keeping was rejected after restoring, the discarded text came back to life. This is a regression made by this change. I fixed it so it also remembers the restored text, and added a test. (Low) No test passed through the line that deletes when loading. Added one. What was fixed is one line and a test, so the second review is not done.
