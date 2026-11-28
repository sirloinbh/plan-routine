# Time out a push service that never answers (#352)

## Purpose

`web-push` has no default timeout. One push service that accepted the connection and never replied kept `sendToDevices` waiting forever, so the scheduler's `running` flag stayed set and no reminder was sent until a restart. The Settings test button hung the same way.

## Changes

| File                            | Change                                                                                                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/src/reminder.ts`       | `sendTimeoutMs` (10 s) is passed to `sendNotification`; `sendToDevices` also races each send against the same timeout, so any sender is covered. A late device counts as `failed` |
| `backend/test/reminder.test.ts` | A sender that never resolves gives `failed: 1`, and the next device is still sent                                                                                                 |

## Notes

- The log line is the existing one (`a push failed (status none)`); it never includes the endpoint.
