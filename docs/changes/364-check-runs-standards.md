# Run standards:check as part of npm run check (#364)

## Purpose

`npm run check` did not run `npm run standards:check`, so a problem the CI standards check finds (for example text under 12px) passed locally and failed in CI.

## Changes

| File           | Change                                                            |
| -------------- | ----------------------------------------------------------------- |
| `package.json` | `scripts.check` runs `npm run standards:check` right after `lint` |

## Notes

- `package.json` is managed by field; `scripts.check` is not a managed field, so this repo owns it.
- `standards:check` passes on main today (one existing warning about an array schema without `.max`, not an error).
