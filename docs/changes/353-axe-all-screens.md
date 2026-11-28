# Scan every main screen for accessibility problems in the browser test (#353)

## Purpose

`e2e/smoke.spec.ts` ran axe only on `/today` and only failed on critical violations. The other screens and the phone size were never scanned in CI.

## Changes

| File                        | Change                                                                                                                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e2e/accessibility.spec.ts` | Opens each main screen at 390x844 and 1440x900, waits for its level-1 heading, and fails on serious or critical axe violations, naming the rule and the first elements |

## Notes

- The screens are one list (`screens`) at the top of the file. Plans (#338) and Mandalart (#339) are left out for their own issues to append.
- The smoke test stays as it is.
