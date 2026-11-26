# #328 Open on the day log and use the shared menu order

- Issue: [#328](https://github.com/sirloinbh/plan-routine/issues/328)
- Branch: `feat/328-day-log-first`
- Related: sirloinbh/project-standards#1128

## Purpose

The app already opens on the day log: `/` redirects to Today (`/today`), and an unknown address does too. The Weekly routines and 12-week routines pages are this app's Week and 12-week views of the same records, so no new view is needed. Only the menu order changed.

## Change — 2026-11-27

- `frontend/src/app.tsx`: the menu order is Today, Weekly routines, 12-week routines, Diary, Daily routines, 4-week routines, Records, Weekly review, Search, Completion rates (the dashboard of the app), Settings.
- `frontend/src/app.test.tsx`: a test of the whole order.
- No route, API or e2e start page changed, so no redirect is needed.
