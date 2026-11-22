# Make /today the landing page and remove placeholder text (#167)

## Purpose

Opening the app showed an empty "Dashboard" with developer text about GitHub issue cards. The real first screen is the Today checklist.

## Changes

| File                        | Change                                                                                                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/app.tsx`      | `/` and unknown addresses redirect to `/today`; the Dashboard menu item, its page and the default empty state are removed; Settings description now says what the page does |
| `frontend/src/app.test.tsx` | Visiting `/` lands on the Today heading and checklist; no Dashboard link or "GitHub issue" text; unknown address falls back to Today                                        |
| `e2e/smoke.spec.ts`         | The smoke test expects the Today heading and the `/today` address after opening `/`                                                                                         |

## Verification

- `npm test -w frontend`: 431 passed, 3 skipped
- Browser check (Vite dev server, no API behind it) at 390×844 and 1440×900: `/` redirects to `/today`, no Dashboard in the menu
- The Playwright e2e test needs the database and runs in CI.
- `npm run check`
