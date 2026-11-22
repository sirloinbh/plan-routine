# Stop period-routines and routines tests depending on timing (#173)

## Purpose

Tests in `period-routines.test.tsx` that did not call `fakeClock` ran on the real clock while the fake server said today is 2026-10-22, so a run crossing midnight could hit the "date changed" branch. The last test in `routines.test.tsx` released its gate and ended without awaiting the archive and reload.

## Changes

| File                                    | Change                                                                                                                                    |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/period-routines.test.tsx` | A `beforeEach` fixes the device clock at 2026-10-22 23:59:59 Seoul time (Date and interval faked only). `fakeClock()` still moves it      |
| `frontend/src/routines.test.tsx`        | The last test awaits the archive and the reload after `again()` and asserts the outcome (row gone, no spinner, other routine still shown) |

## Verification

- `npm test -w frontend -- period-routines routines.test`: all passed, with no act warnings in the output.
- Every `period-routines` test now runs at 23:59:59 Seoul time on the fake server's today, so the tests that did not call `fakeClock` are the "system clock at 23:59:59" case.
- `npm run check`: see the PR.
