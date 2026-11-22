# Load the diary screen through the shared query layer (refs #178)

## Purpose

`Diary` loaded days with its own `requestJson` effect, a request-order guard and a version counter, and saved with a direct `requestJson` call. The shared query layer (`lib/query.ts`) covers loading and saving.

## Changes

| File                          | Change                                                                                                                                                                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `frontend/src/diary.tsx`      | A day is loaded with `useApiQuery` (keyed by date, always fresh when opened); an effect seeds the form, draft and notices from that load; saves use `useApiMutation`; the version counter and the screen's own request guard are gone; pressing the same date button refetches |
| `frontend/src/diary.test.tsx` | Query-aware `render` helper and two-tick flush, as in the stats tests; new test that the page being shown again does not overwrite typed text                                                                                                                                  |

The diary does not use `useReloadWhenCurrent`: it had no date-change or visibility reload, and the form is a working copy of the load, so a background refresh must not replace it. Only a load started by opening the screen, moving to a day or retrying seeds the form (answers older than the load's start are ignored).

## Verification

- `npm test -w frontend -- diary`: 65 passed
- `npm run check`
- `frontend/src/app.test.tsx`: the diary retry test now keeps failing until the retry button is pressed, because the app's query client retries a failed load once on its own.
