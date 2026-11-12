# #66 Keep keyboard focus after a retry

- Issue: [#66](https://github.com/sirloinbh/plan-routine/issues/66)
- Branch: `fix/66-retry-focus`
- Date: 2026-11-01 (Asia/Seoul)

## Purpose

The "Retry" button disappears when the fetch succeeds, so the focus fell to `body`.

## Changes

`frontend/src/retry-button.tsx` (new file). The issue named three screens, but the same button exists in 11 places, so all were changed to one shared button: today's check, the diary, the period checklist, the period routine list, the 4-week notice, records, achievement rate, 12-week goals, and the project list.

If the button disappears while it has focus, the focus goes to the nearest named region. If inside a card, that card; otherwise the page region named by the page heading. This generalized the issue's "to the date heading or the card heading", and it was recorded in the issue comment. The screen reader reads the name of the region, that is, the heading. It does not draw an outline around the whole region (same as `main`), and it does not scroll, so the screen does not jump. If the user is already elsewhere, the focus is not moved.

## Tests

`frontend/src/retry-button.test.tsx`: moving to the region, the card taking priority, and staying as it is when elsewhere. The issue's three screens are checked in `diary.test.tsx`, `daily-checklist.test.tsx`, and `twelve-week.test.tsx`. `app.test.tsx` checks the real page region.

## Verification

- Local: `env -u TEST_DATABASE_URL npm run check` passed. Backend 142 pass / 0 fail / 19 skip (DB tests) out of 161, frontend 292 pass / 0 fail / 2 skip (dark-mode-only shared tests) out of 294, and `test:skills` 4 pass.
- Browser: with a temporary API whose first fetch fails and headless Chrome at 1440×900 and 390×844, I pressed the real Enter key on the retry buttons of today's check, the diary, 12-week, and settings. The focus goes to the page region or the card, there is no outline or scroll movement, and the next Tab goes to the first control of that region. There were no console errors. The other screens and a real screen reader were not checked.

## Limits and follow-up

- When the retry fails again: in places that clear the failed state right away (the checklist, the diary, and the project list), the button turns into a loading indicator and then comes back, so the focus stays on the region. In the others (records, achievement rate, 12-week goals, and the routine list) the button stays as it is, so the focus also stays on the button.
- Going to the page region makes the next Tab start from the very front of the page. For "Reload 4-week routines", which has many controls before it, "Retry" of the period checklist, and "Reload this day's records", you have to pass them again. I left it as it is rare.

## Automated code review

- First: no code defect. 4 applied.
  - (Medium) The tests for the issue's three screens and a check on the real page were missing. Added them. Recorded in the issue the decision that changed the move target.
  - (Medium) The browser check was missing for the focus change, and an outline could appear around the whole region. I removed the outline and blocked scrolling, and checked with a real keyboard.
  - (Low) Wrote the case where the Tab position returns to the very front of the page in the limits.
  - (Low) Fixed the explanation for failing again and the replacement list.
- Second: no defect to fix. The outline and scroll behavior has no automated test and rests only on the browser check. The review ends at 2 rounds.
