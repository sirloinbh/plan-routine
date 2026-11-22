# Extract the diary draft logic and share its text limits (#170)

## Purpose

`diary.tsx` held the whole draft state machine (two effects that both wrote drafts and set `draftFailed`, plus the unload warning), hard-coded the server's 5000/1000 limits, and assumed any 400 meant the body was wrong.

## Changes

| File                               | Change                                                                                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/diary-draft.ts`      | New `useDiaryDraft` hook: writes and clears the draft, handles the other-tab `storage` event, owns `draftFailed`, `lastWritten`, `draftBase` and the unload warning |
| `frontend/src/diary-limits.ts`     | One exported `diaryLimits` constant (body 5000, notes 1000)                                                                                                         |
| `frontend/src/diary.tsx`           | Uses the hook and the constant; a 400 marks and focuses only the field named in `error.fields`; with no named field it shows the message and marks nothing          |
| `frontend/src/diary-draft.test.ts` | Unit tests for the hook                                                                                                                                             |
| `frontend/src/diary.test.tsx`      | Fake server names the field in its 400; tests for a refused note and for a 400 naming no field                                                                      |

## Verification

- `npm test -w frontend -- diary`: 63 passed
- `grep -n "5000" frontend/src/diary.tsx`: no match
- `npm run check`
- Behaviour is unchanged apart from the 400 handling; the draft flows are covered by the existing diary tests. No browser check: there is no API in this environment.
