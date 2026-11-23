import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dailyRoutineOn } from '../src/day-records.js';

test('the known alias and day expressions build the fragment', () => {
  assert.match(dailyRoutineOn('routines', '$1::date'), /routine_checks\.period_start = \$1::date/);
  assert.match(
    dailyRoutineOn('routines', 'days.date'),
    /routine_checks\.period_start = days\.date/,
  );
});

test('an alias or day expression that is not on the allow list throws', () => {
  assert.throws(
    () => dailyRoutineOn('routines; DROP TABLE routines' as never, '$1::date'),
    /Unexpected routine alias/,
  );
  assert.throws(
    () => dailyRoutineOn('routines', "'2026-01-01' OR true" as never),
    /Unexpected day expression/,
  );
});

test('a caller cannot pass an arbitrary string', () => {
  // @ts-expect-error `day` only accepts the allowed expressions; this line fails typecheck if the union is widened.
  assert.throws(() => dailyRoutineOn('routines', 'now()'));
});

test('a routine on chosen weekdays belongs only to those days, unless it was checked or skipped', () => {
  const sql = dailyRoutineOn('routines', '$1::date');
  assert.match(
    sql,
    /routines\.weekdays IS NULL OR EXTRACT\(DOW FROM \$1::date\)::int = ANY\(routines\.weekdays\)/,
  );
  assert.match(sql, /routine_skips\.period_start = \$1::date/);
});
