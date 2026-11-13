# #27 Switch the screens to the shared design system

- Issue: [#27](https://github.com/sirloinbh/plan-routine/issues/27) (central tracking issue sirloinbh/project-standards#126)
- Branch: `feat/27-design-system`

## Purpose

The 8 apps decided to use the same tokens, components, layout, and PWA settings (central ADR-0007, ADR-0008). The method followed "Converting an existing app" in the central `docs/design-system.md` (workout-memo#160 applied it first).

## Changes — 2026-10-26

### Packages

The user installed them directly. They are the packages in the central ADR-0007 table (pre-approved 2026-10-22) and react-router, vitest, jsdom, and Testing Library (approved 2026-10-26). All are pinned versions, published at least 14 days ago, and installed with `--ignore-scripts`.

- dependencies: `@sirloinbh/design-tokens` 1.0.0, `class-variance-authority` 0.7.1, `clsx` 2.1.1, `radix-ui` 1.7.0, `react-router` 8.4.0, `sonner` 2.0.8, `tailwind-merge` 3.7.0, `tw-animate-css` 1.4.0, `vaul` 1.1.2, `lucide-react` 0.468.0 → 1.52.0
- devDependencies: `tailwindcss` and `@tailwindcss/vite` 4.3.3, `vitest` 5.0.3, `jsdom` 30.1.2, `@testing-library/react` 16.3.3, `@testing-library/dom` 10.4.2, `@testing-library/jest-dom` 7.0.1
- Two lock files (root and `frontend/`): no package was removed, and only `lucide-react` changed version. All new entries have the official registry, an integrity value, and no install script. `ioc-scan`: no suspicious entries

### Shared files (centrally managed)

They are exactly as taken from a sync preview with this app's `features.ui` and `features.vitest` turned on centrally: 15 files in `frontend/src/components/ui/` with tests, `components/layout/`, `lib/utils.ts` and `theme.ts`, `public/theme-init.js`, and `frontend/vitest.config.ts`.

### App code

- **Screens:** replaced the own shell with `AppShell` and attached page addresses (`/`, `/routines`, `/settings`). Deleted the own `style.css`.
- **Daily routines:** kept the state logic as it is and moved the rendering to the shared `Card`, `Button`, `Input`, `Badge` and token utilities. All accessible names (`aria-label`) are the same. The screen test (`routines.test.tsx`) moves the routine checks of the deleted `backend/test/app-ui.test.ts` (the 7 categories and the empty state, adding, keeping the input on an empty name or a server error, reordering, renaming and archive confirmation, and a 404 for a routine changed elsewhere and refetching the list) to a fake API that holds state.
- **Entry points:** `app.tsx` (screens), `main.tsx` (rendering, and registering the service worker only in a production build), and `index.css` (Tailwind, `tw-animate-css`, and the shared tokens).
- **PWA:** 4 icons (central `scripts/pwa-icons.mjs`), and in `index.html` the manifest, icons, light and dark `theme-color`, `viewport-fit=cover`, and the flash-prevention script.
- **Tests and build:** added a `test` (vitest) script and `src/test/setup.ts` to `frontend`, and the root `npm test` also runs the frontend tests. The production build leaves out test files with `tsconfig.build.json`. Added the Tailwind plugin to `vite.config.ts`.
- **Deleting the backend screen test:** `backend/test/app-ui.test.ts` was a temporary test that ran `main.tsx` with a fake React when there was no Vitest. The frontend Vitest tests check the same content (the title, the server state, the error notice, and menu navigation) with a real React, so it was deleted.
- **Screen test (`app.test.tsx`):** showing the server date, the server error notice, navigating pages by the menu and showing the current page, and handling an unknown address.

## Verification

- Prettier, ESLint, `tsc` (all), 46 frontend tests passed, `vite build`, and `ioc-scan`
- Backend tests need a DB, so they are confirmed in CI.
