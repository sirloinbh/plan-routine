# #99 Resolve the minimatch vulnerability alert (development tools)

- Issue: [#99](https://github.com/sirloinbh/plan-routine/issues/99)
- Branch: `fix/99-minimatch-override`
- Date: 2026-11-03 (Asia/Seoul)

## Purpose

Resolve Dependabot alert #7. The target is `minimatch` 10.2.6, which can be made to use excessive CPU and memory with a glob pattern (GHSA-g3hv-75wg-m249, medium severity, `< 11.0.1`). Only the development tools (`eslint`, `@eslint/config-array`, `@typescript-eslint/typescript-estree`, `eslint-plugin-jsx-a11y-x`) use it, and it does not go into the deployed app.

## Decision

- There is no fixed version in 10.x. Even the latest ESLint 10.14.0 requires `^10.2.6`, so it cannot be solved by raising ESLint.
- The ESLint family versions are a centrally managed field (`.standards/manifest.json`), so they are not changed. Specify 11.0.4 with `overrides`, which is not managed.
- Apply it to the whole repository without splitting by package. Right now the packages that use `minimatch` are only the four above, and the aim is that packages that come in later also do not get the vulnerable version. If a package that needs another major version comes in and breaks, I will split it by package then.
- To follow the repository rule (`save-exact=true`), write the exact version, not a range.

## Changes

- `package.json`: `"overrides": { "minimatch": "11.0.4" }`.
- `package-lock.json`: the user updated it with `npm install`. `minimatch` 11.0.4 and a new dependency `@isaacs/nonrecursive-glob-match` 1.0.3 (same author) came in. As a result of `npm run lockfiles:sync`, there was nothing to change in the sub lock files.

## Verification

- `npm ls minimatch --all`: 11.0.4 in all four places.
- Local: `env -u TEST_DATABASE_URL npm run check` passed. Backend 145 pass / 0 fail / 19 skip (DB tests) out of 164, frontend 304 pass / 0 fail / 2 skip out of 306, and `test:skills` 4 pass. `npm run standards:check` passed.
- I confirmed that lint did not pass because it was empty. ESLint checked 127 files, and the 8 of the 135 tracked source files that were left out are all `.standards/**`, which is excluded in the settings.

## Limits and follow-up

- When ESLint accepts `minimatch` 11, delete `overrides`: [#101](https://github.com/sirloinbh/plan-routine/issues/101).
- Other repositories that use the same ESLint version may have the same alert. I did not check.

## Automated code review

- First: 1 of 6 applied. (Low) There was no card to remove the temporary measure. Registered it as #101. The reasons for applying it to the whole repository and for the exact version were written in the decision. For lint, I confirmed not only the file count but that the left-out files equal the exclusion list. The status in the next-steps document is based on after the merge, and sub-packages do not use `minimatch`, so it was not applied. Only documents were fixed, so the second review is not done.
