# Ask before browser back or forward drops unsaved input (#366)

## Purpose

The unsaved-input guard of the Mandalart editor (#347) caught a reload, closing the tab and clicks on links, but not the browser's back and forward buttons. `BrowserRouter` has no route blocker, so back dropped typed input without asking.

## Changes

| File                                    | Change                                                                                                     |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `frontend/src/mandalart-leave.ts`       | `useLeaveGuard` now returns `{ pending, stay, leave }` and also guards back and forward with a guard entry |
| `frontend/src/mandalart-editor.tsx`     | uses the new return value for its "Leave without saving?" dialog                                           |
| `frontend/src/mandalart-leave.test.tsx` | tests on the real browser history (BrowserRouter on jsdom)                                                 |

## How it works

- While input is unsaved, a copy of the current history entry (the guard entry) is pushed on top. Back lands on a copy of the same page, so the page is not unmounted.
- The guard then steps forward again and shows the dialog. "Stay" keeps the page and the input. "Leave" goes two steps back, to the page before this one.
- A link click still asks first; leaving through it now replaces the guard entry, so the history has no extra step.
- When the input is saved or discarded the guard steps back off its entry (it stays as a forward entry), so back goes straight to the previous page without a question.

## Limits

- Forward cannot be pressed on the guard entry (nothing is ahead of it), so only back is asked about in practice. After "Leave", forward returns to the page without asking.
- Pressing back several times very quickly can reach the page before the guard has stepped forward again; the dialog still appears.

## Verification

- `npm run check` and `npm run standards:check`: see the PR.
- Real browser (Vite dev server, mocked API) at 390x844 and 1440x900: with typed input, back asked; "Cancel" kept the page and the input; back then "Leave" returned to the list. No horizontal scroll.
