# Keep the search when going back from a result (#280)

## Purpose

The Search page kept its form, submitted search and page number in component state. Since #257 each result links to its day on Records, and Back from there returned to an empty Search page.

## Changes

| File                           | Change                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/search.tsx`      | The submitted search is the address (`?q=&from=&to=&routineId=&result=&offset=`): it is read when the page opens (and runs), submitting and paging write a new address (a history entry), and Back or Forward show that search's filters in the form again. Values that cannot be right (a bad date or routine, a negative offset) are left out; with no word and no routine nothing runs |
| `frontend/src/search.test.tsx` | An address with a search fills the form and loads it; unusable values are ignored; submitting and paging write the address; Back restores the earlier search and its form                                                                                                                                                                                                                 |

## Notes

- Submitting the same search again (same address) refetches instead of adding a history entry.
- The address holds the search text. The app has no sign-in on localhost and one user; the text is no more exposed than the page itself.

## Verification

- `npm test -w frontend -- search app.test`: 33 passed
- Browser, 390x844, Vite with a mock `/api`: search "knee", open a result's day, Back: the address is `/search?q=knee`, the form shows "knee" and the 3 results are back; no horizontal scroll
- `npm run check`: see the PR
