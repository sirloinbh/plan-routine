# #45 Saving an unsaved diary as a draft

- Issue: [#45](https://github.com/sirloinbh/plan-routine/issues/45)
- Branch: `feat/45-diary-draft`
- Date: 2026-11-01 (Asia/Seoul)

## Purpose

If you went to another menu or closed the tab without saving the diary, the text written was lost. Following the user's decision, menu navigation is not blocked, and the text is saved temporarily in the browser and restored when you come back. The router structure is not changed.

## Changes

`frontend/src/diary-draft.ts` (new file), `frontend/src/diary.tsx`.

- If there is unsaved text, it is kept in `localStorage` on every input. It is deleted when saving succeeds or when it becomes the same as the saved content.
- When the diary screen is opened, the draft is restored and a notice says "Loaded your unsaved text". It is not saved to the server automatically.
- Only one draft is kept, because date navigation is blocked when there is unsaved text. So the text does not hide even if you come back days later, the screen opens on the draft's date.
- If the saved content of that day changed after the draft was written, the user is told to check.
- Since the date cannot be moved while a draft remains, a "Discard" button was added. To avoid pressing it by mistake, it asks for "Confirm discard" once more.
- The tab-close warning is shown only when saving the draft failed, because if the draft was saved, the text remains even if the tab is closed. This narrowed the "warn when the tab is closed" item of the issue, and it was recorded in the issue.
- A text that differs only in leading and trailing whitespace is not saved as a draft. The server trims it anyway.
- A draft of a date the server rejects is deleted and today is opened. This happens only when the storage is corrupted, and if left as it is the screen cannot be used.

## Tests

`frontend/src/diary.test.tsx`: restoring when you left and came back, deleting after saving, keeping it when saving fails, leaving during a save, a draft of an earlier date, content changed elsewhere, a draft equal to the saved content, a text differing only in whitespace, a corrupted draft, a date the server rejects, a late save response, discarding and focus, and the tab-close warning.

## Verification

- Local (`TEST_DATABASE_URL` removed): format, lint, type checks, and build passed. Frontend tests were 216 pass / 0 fail / 2 skip out of 218 with `--testTimeout=60000` (the skips are dark-mode-only shared tests). The backend did not change.
- Browser: with a temporary API and headless Chrome at PC 1440×900 and mobile 390×844, I checked restoring after a menu move and a refresh, the notice text, discarding, and deleting the draft after saving. There was no horizontal scroll or console error. On PC I pressed the real menu link, and on mobile, because the menu is inside a drawer when you come back, I substituted an address navigation. It was not checked with a real DB, a real phone, or a real tab close.

## Limits and follow-up

- The draft stays in this browser without encryption and is not visible on other devices. This is the method the user accepted.
- There is only one draft, so if you write in two tabs, only the text of the tab entered later remains and there is no warning. This is true even if the dates differ. Split off as [#64](https://github.com/sirloinbh/plan-routine/issues/64).
- Unsaved input of the 12-week retrospective is not in the scope of this card.

## Automated code review

- First: of 7, 6 applied and 1 split off.
  - (Medium) Right after restoring, it overwrote the basis of the draft, so the warning "the saved content changed" appeared only once. It now keeps the first basis. Added a test.
  - (Medium) A save response that arrived late after leaving deleted a draft written afterwards. It now deletes only when it equals what was sent. Added a test.
  - (Low) With two tabs open on different dates, the draft is overwritten. Fixed the record, and split the code fix off to [#64](https://github.com/sirloinbh/plan-routine/issues/64).
  - (Low) The decision to narrow the tab-close warning was not recorded. Wrote it in the issue and the PR.
  - (Low) If there was a draft of a date the server rejects, the screen could not be used. It is deleted and today is opened. Added a test.
  - (Low) "Confirm discard" stayed after input. It is reverted when typing. Added a test.
  - (Low) A draft differing only in whitespace opened the screen on a past date. A text differing only in whitespace is not saved as a draft. Added a test.
  - The delete-after-save test did not check the deletion directly, so a check was added.
- Second: no defect blocking the merge. Confirmed the first-review follow-ups were applied. 2 low findings applied (a draft with nothing to restore opening a past date, and the #64 row of the next-steps table). The review ends at 2 rounds.
