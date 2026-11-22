# Move twelve-week focus and notice side effects out of render (#166)

## Purpose

`CurrentGoals` reacted to a vanished goal by calling `setEditing`, `requestFocus` and writing a ref during render, and ran a dependency-less effect after every render. The "review is complete" message also left out "Not achieved".

## Changes

| File                                | Change                                                                                                                                                                                                                                                                                  |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/twelve-week.tsx`      | One effect keyed on `goals` and `editing` handles a vanished edit and vanished link panels (through `useEffectEvent`); the render-time branch and `lostEdit` ref are gone; review messages share one `reviewMessages` object, and the incomplete one now names Achieved or Not achieved |
| `frontend/src/twelve-week.test.tsx` | Every test renders under `<StrictMode>` (`configure({ reactStrictMode: true })`); the load-failure helper fails until recovered; new test for "Not achieved"                                                                                                                            |

## Verification

- `npm test -w frontend -- twelve-week`
- `npm run check`
