# Let users cancel a project delete and fix its notices (#164)

## Purpose

The project delete confirmation had no way out, the delete notice was wrong about linked routines, and empty names or addresses were sent to the server.

## Changes

| File                                  | Change                                                                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `frontend/src/project-links.tsx`      | Cancel button and Escape leave the confirm state and focus Delete; reworded the delete notice; name and URL are `required` and an empty add sends no request |
| `frontend/src/project-links.test.tsx` | Tests for Cancel, Escape, the new notice text, and the empty add                                                                                             |

## Verification

- `npm test -w frontend -- project-links`
