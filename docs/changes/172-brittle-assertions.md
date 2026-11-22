# #172 Fix vacuous and brittle assertions in diary, records and stats tests

Issue: https://github.com/sirloinbh/plan-routine/issues/172

## Purpose

Three frontend tests could not fail for the behavior they name, or failed for the wrong reason.

## Changes

Only assertions changed; no source file was edited.

- `frontend/src/diary.test.tsx`: the "no routine progress" test asserted `/Daily routines .* Done/` is absent, but the screen renders lowercase `done`, so it could never fail. It now uses `/Daily routines/i`. A new test checks the positive case (`Daily routines 1/3 done`).
- `frontend/src/records.test.tsx`: "a page shown again loads the records once more" asserted `before + 2` fetch calls. It now changes the server's answer for the selected day through a new `setDay` helper on the fake API and asserts that the new progress (`1/1 done`) appears and the old one (`0/1 done`) is gone.
- `frontend/src/stats.test.tsx`: the bar test selected `span.bg-primary` with `arrayContaining`. It now reads every rate row in page order (label and bar width, or `No records`) and asserts the whole list. An array is used because a daily week and a weekly period share the label `Oct 18 – Oct 24`.

## Verification

Each fixed test was checked by temporarily breaking the behavior it names (then restoring the file): showing progress when `total` is 0 fails the diary test; adding 1 to every bar width fails the stats test; removing the `visibilitychange` listener fails the records test. `npm run check` passed locally (frontend 431 pass, 3 skipped).

## Limits

Lane-3 is moving records and stats to react-query (#178); only assertions were touched here to keep the merge small. The `setDay` helper is a small addition to the fake API in `records.test.tsx`.
