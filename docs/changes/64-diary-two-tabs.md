# #64 Do not lose the draft when writing the diary in two tabs

- Issue: [#64](https://github.com/sirloinbh/plan-routine/issues/64)
- Branch: `fix/64-diary-two-tabs`
- Date: 2026-11-01 (Asia/Seoul)

## Purpose

There is only one draft, so when writing in two tabs, the later input overwrote the earlier tab's text without a warning.

## Decision

The user said to proceed with the recommendations for the choices, so I chose the method of detecting with the `storage` event. A draft per date would also have to change the rule that "the screen opens on the draft's date", and it is large for a rare case. It was recorded in the issue comment.

## Changes

`frontend/src/diary.tsx`, `diary-draft.ts`.

- In a tab that has unsaved text, if another tab overwrites the draft, it says "It is not saved as a draft, so it will be lost if you leave" and turns on the tab-close warning. If you type again in this tab, the draft is taken back and the warning turns off, and then if the other tab is on the diary screen, it gets the same warning.
- If another tab deletes the draft (by saving or discarding, or by clearing the storage), this tab keeps its text again. The first basis is kept, so the notice that the content saved elsewhere changed does not disappear.
- A tab with the warning on does not delete the draft, because that draft is the other tab's text.
- The tab-close warning does not appear on menu navigation, so only the notice that the text may be lost stays on the screen.

## Tests

`frontend/src/diary.test.tsx`: the overwrite warning and taking it back, restoring a deleted draft, a tab with no text to save, and a different storage key.

## Verification

- Local: `env -u TEST_DATABASE_URL npm run check` passed. Backend 142 pass, 0 fail, 19 skip (DB tests) out of 161, frontend 279 pass, 0 fail, 2 skip out of 281, and `test:skills` 4 pass.
- Browser: checked with two real tabs of headless Chrome and a temporary API at 1440×900 and 390×844. When B types, the warning appears in A and the draft becomes B's. When A types again, A's warning turns off and the warning appears in B. When B deletes the draft, A keeps it again. There was no horizontal scroll. Discarding and saving after the warning were checked only by screen tests. The real tab-close warning dialog was not checked. The warning turning on and off is checked by `beforeunload` screen tests.

## Limits and follow-up

- If the tab that overwrote is closed first, the text of the tab with the warning on remains only while that tab is open. A warning appears when that tab is closed.
- Detection works only in a tab where the diary screen is open. If the tab where the text was written is closed or on another menu, the input of another tab overwrites that draft without a warning. It is left within the scope of the decision "the later input wins".

## Automated code review

- First: no defect blocking the merge. 5 applied.
  - (Medium) Saving or discarding in a tab with the warning on deleted the draft that held the other tab's text. It now remembers the taken-away state separately and does not delete. Added a test.
  - (Low) The limit in the record missed the case of a tab that left the diary screen. Wrote it.
  - (Low) It ignored clearing the whole storage. It now treats the draft as deleted. Added a test.
  - (Low) When keeping again, it lost the first basis. It is kept. Added a test.
  - (Low) Fixed a weak test and a missing screen check.
- Second: found 3. The PR was merged before the fixes, so they were applied in [#85](https://github.com/sirloinbh/plan-routine/issues/85). (Medium) Even after keeping again, the taken-away state stayed, so discarded text came back to life. This is a regression made by the first follow-up. Fixed it and added a test. (Low) When taken away and taken back, it lost the first basis. Fixed it and added a test. (Low) Made the verification sentence clear. The review ends at 2 rounds.
