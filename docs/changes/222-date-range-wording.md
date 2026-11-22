# Use the #157 date-range wording in the help text and test mocks (#222)

Issue: https://github.com/sirloinbh/plan-routine/issues/222

## Purpose

#157 corrected the server messages for the editable date range. The daily page help text and two test mocks still used the old wording.

## Changes

| File                                    | Before                                                          | After                                                |
| --------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------- |
| `frontend/src/app.tsx`                  | You can edit up to the last 7 days                              | You can edit today and the 7 days before it          |
| `frontend/src/daily-checklist.test.tsx` | You can only check the last 7 days (mock and assertion)         | You can only check today and the 7 days before it    |
| `frontend/src/diary.test.tsx`           | Diary entries can only be written for dates after the year 2000 | Diary entries can only be written from 2000-01-01 on |

Only these strings changed; other lanes are editing `diary.test.tsx`.

## Verification

- `npm test -w frontend -- daily-checklist diary app`: 100 passed, 2 skipped.
- `grep -rn "last 7 days\|after the year 2000"` on the three files finds nothing.
