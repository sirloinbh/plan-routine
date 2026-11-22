# Make frontend test fakes fail loudly on unexpected requests (#171)

## Purpose

The checklist, routines and records fakes answered requests they did not know, so a stray request or a reordered test passed or hung without a clear message.

## Changes

| File                                      | Change                                                                                                                                                            |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/test/unexpected-request.ts` | New helper. An unknown request throws and is also remembered, so the test fails in `afterEach` even when the screen swallows the error                            |
| `frontend/src/daily-checklist.test.tsx`   | The fake routes by method and `new URL(url).pathname` (`GET /api/checklist`, `PUT`/`DELETE /api/routines/:id/checks/:date`) and no longer parses ids with `split` |
| `frontend/src/routines.test.tsx`          | Routes by pathname; answers `/api/project-links` with an empty list; unknown endpoints and writes fail the test                                                   |
| `frontend/src/records.test.tsx`           | Routes by pathname; `release()` throws a clear message when nothing is held or the held request has not arrived; two tests cover the fake itself                  |

## Verification

- `npm test -w frontend -- records routines daily-checklist`: 96 passed.
- A temporary stray `requestJson('/api/unknown')` in `use-routine-list.ts` made the routines tests fail with "Unexpected requests in this test: GET /api/unknown" (reverted).
- `npm run check`: see the PR.
