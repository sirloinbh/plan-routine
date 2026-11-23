import { expect, test } from 'vitest';

import { isDone, progressText } from './checklist-progress';
import { scheduleText } from './routine-schedule';

test('a schedule reads as weekdays or times a week, and nothing for a plain routine', () => {
  expect(scheduleText({ weekdays: [1, 3, 5] })).toBe('Mon, Wed, Fri');
  expect(scheduleText({ timesPerWeek: 3 })).toBe('3 times a week');
  expect(scheduleText({ weekdays: null, timesPerWeek: null })).toBe('');
  expect(scheduleText({})).toBe('');
});

test('an N-per-week routine is done at N checks in the week, not by its own box', () => {
  const read = { checked: true, timesPerWeek: 3, weekChecks: 2 };
  expect(isDone(read)).toBe(false);
  expect(isDone({ ...read, weekChecks: 3 })).toBe(true);
  expect(isDone({ checked: true })).toBe(true);
  expect(
    progressText([read, { checked: true }, { checked: false, skipped: true, timesPerWeek: 2 }]),
  ).toBe('1/2');
});
