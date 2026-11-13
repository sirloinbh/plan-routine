# #12 Link from a routine item to another project's web app

- Issue: [#12](https://github.com/sirloinbh/plan-routine/issues/12)
- Branch: `feat/12-project-links`
- Date: 2026-11-01 (Asia/Seoul)

## Purpose

Open routines handled in another personal web app, such as a household ledger or a reading log, directly from the checklist.

## Decisions

The user said to proceed with the recommendations for the choices, so the following was decided. It was recorded in the issue comment.

- The allowed addresses are, as the card recommended, only `https://` and private access addresses. `http://` is allowed only for private addresses (localhost, 127/8, 10/8, 172.16/12, 192.168/16, 100.64/10, `.local`, `.localhost`, `.internal`, `.home.arpa`, `.ts.net`, `[::1]`, `[fc00::/7]`). Addresses such as `javascript:` and addresses with user information are rejected.
- The project list is added and deleted on the settings screen. A project with the same name is rejected. To fix one, delete it and add it again.
- One project is linked to one routine. Deleting a project only removes the link, and the routine stays as it is.
- The link appears where the checklist part is used (today's check, the weekly and 4-week screens). The 12-week screen does not use this part, so it does not appear there.

## Changes

- `database/migrations/006_project_links.sql`: the `project_links` table and `routines.project_link_id`. **For an existing DB, apply it with `npm run db:migrate`.**
- `backend/src/project-link-routes.ts` (new file): list, add, delete, and address validation.
- `backend/src/routine-routes.ts`: `PUT /api/routines/:id/project-link`, and `projectLinkId` in the routine response.
- `backend/src/check-routes.ts`: `linkName` and `linkUrl` of the checklist item.
- `frontend/src/project-links.tsx` (new file), `app.tsx`: the project list on the settings screen.
- `frontend/src/routine-list.tsx`, `use-routine-list.ts`: choosing the project to link per routine. It is not shown when there is no project.
- `frontend/src/checklist.tsx`: a new-tab link (`rel="noopener noreferrer"`). If the saved address is not http or https, it is not made a link.

## Tests

- `backend/test/project-link-routes.test.ts`: allowed and rejected addresses, input errors, and setting and clearing the link.
- `backend/test/db.integration.test.ts`: delivery up to the checklist, duplicate names, and deleting a project.
- `frontend/src/project-links.test.tsx`, `routines.test.tsx`: list, add, reject, delete and focus, the checklist link, and choosing the link.

## Verification

- Local: `env -u TEST_DATABASE_URL npm run check` passed. Backend 142 pass / 0 fail / 19 skip (DB tests) out of 161, frontend 265 pass / 0 fail / 2 skip (dark-mode-only shared tests) out of 267, and `test:skills` 4 pass.
- Browser: with a temporary API and headless Chrome at PC 1440×900 and mobile 390×844, I checked rejecting a bad address, adding a project, linking a routine, and the new-tab link on today's check (`noopener noreferrer`). A long address also did not overflow, and there were no console errors or horizontal scroll. It was not checked with a real DB, a real phone, or a real link navigation.
- Real DB in CI: written in the PR comment.

## Limits and follow-up

- There is no screen to fix a project's name and address. You must delete it and add it again, and then the link is removed.
- If you link in another tab and only the project list refetch fails in this tab, the select box of that routine briefly shows "None". No value is saved, and it is corrected at the next refetch.

## Automated code review

- First: no defect that breaks security. I verified with about 60 addresses. 8 were applied.
  - (Medium) An address over 2048 characters after normalization became a 500. It is now checked by the length that will be saved. Added a test.
  - (Medium) The project list was read only once, so an old value stayed on a screen kept open. It is read again together with the routines.
  - (Medium) In dark mode, the option text could be invisible. The options got the token color. I could not check the dark mode screen.
  - (Low) The select box did not reflect the saving state. It is disabled and the focus is returned. Added a test.
  - (Low) The touch area was small. Enlarged the select box and the link.
  - (Low) The private address judgment was loose (`10.0.0.1e1`, `[fc::1]`). Fixed it and added more address tests.
  - (Low) It showed "none" even when the list could not be read. Added a reload button. Added a test.
  - (Low) Fixed an assertion that only checked the format, a record error for the 12-week screen, and a missing issue comment.
- Second: no defect blocking the merge. 4 low findings applied (duplicated message for a rejected long address, focus to the address field on rejection, the focus and disabled display of the select box, and the next-steps document). 1 rare display problem was written in the limits. The review ends at 2 rounds.
