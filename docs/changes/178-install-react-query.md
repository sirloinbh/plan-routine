# Install @tanstack/react-query (refs #178)

## Purpose

First step of #178 (move the screens' data loading onto the shared query layer, ADR-0027). This change only adds the dependency, so the central `query` feature can be switched on for this app next. No screen uses it yet.

## Changes

| File                    | Change                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| `frontend/package.json` | Adds `@tanstack/react-query` `5.104.1` (exact version) to `dependencies`                   |
| `package-lock.json`     | Adds `@tanstack/react-query` and its one dependency `@tanstack/query-core`, both `5.104.1` |

Installed with `npm install --ignore-scripts --save-exact @tanstack/react-query@5.104.1 -w frontend`, as the user approved on #178 (comment of 2026-11-22).

## Package review

| Check           | Result                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| License         | MIT                                                                                                    |
| Install scripts | None (`npm view` shows no `preinstall`, `install` or `postinstall`)                                    |
| Dependencies    | One: `@tanstack/query-core` 5.104.1 (also exact in the lockfile)                                       |
| Provenance      | SLSA provenance published (`https://slsa.dev/provenance/v1`)                                           |
| Audit           | `npm install` reported 0 vulnerabilities                                                               |
| `ioc-scan`      | Not run: this repo has no `ioc-scan` or `lockfiles:sync` script (`package.json`). Recorded as skipped. |

## Verification

- `npm run check`: see the PR.
