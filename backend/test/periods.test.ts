import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  calendarDate,
  daysBetween,
  isCalendarDate,
  periodFor,
  periodsFor,
  weekStart,
} from '../src/periods.js';

// First use on Thursday 2026-10-22, so four/twelve-week periods count from Sunday 2026-10-18.
const anchor = '2026-10-22';

test('weeks run Sunday to Saturday, across month, year and leap-day boundaries', () => {
  assert.deepEqual(periodFor('weekly', '2026-10-18', anchor), {
    start: '2026-10-18',
    end: '2026-10-24',
  });
  assert.deepEqual(periodFor('weekly', '2026-10-24', anchor), {
    start: '2026-10-18',
    end: '2026-10-24',
  });
  assert.deepEqual(periodFor('weekly', '2026-12-31', anchor), {
    start: '2026-12-27',
    end: '2027-01-02',
  });
  assert.deepEqual(periodFor('weekly', '2028-02-29', anchor), {
    start: '2028-02-27',
    end: '2028-03-04',
  });
  assert.equal(weekStart('2026-03-01'), '2026-03-01');
});

test('a daily period is the day itself', () => {
  assert.deepEqual(periodFor('daily', '2026-10-31', anchor), {
    start: '2026-10-31',
    end: '2026-10-31',
  });
});

test('four-week periods repeat every 28 days from the Sunday of the first-use week', () => {
  assert.deepEqual(periodFor('four_week', '2026-10-22', anchor), {
    start: '2026-10-18',
    end: '2026-11-14',
  });
  assert.deepEqual(periodFor('four_week', '2026-11-14', anchor), {
    start: '2026-10-18',
    end: '2026-11-14',
  });
  assert.deepEqual(periodFor('four_week', '2026-11-15', anchor), {
    start: '2026-11-15',
    end: '2026-12-12',
  });
  assert.deepEqual(periodFor('four_week', '2026-12-31', anchor), {
    start: '2026-12-13',
    end: '2027-01-09',
  });
});

test('twelve-week periods span 84 days and continue across the year boundary', () => {
  assert.deepEqual(periodFor('twelve_week', '2027-01-09', anchor), {
    start: '2026-10-18',
    end: '2027-01-09',
  });
  assert.deepEqual(periodFor('twelve_week', '2027-01-10', anchor), {
    start: '2027-01-10',
    end: '2027-04-03',
  });
});

test('dates before the first-use week fall into earlier periods instead of failing', () => {
  assert.deepEqual(periodFor('four_week', '2026-10-17', anchor), {
    start: '2026-09-20',
    end: '2026-10-17',
  });
});

test('periodsFor returns every cadence for one date', () => {
  assert.deepEqual(Object.keys(periodsFor('2026-10-22', anchor)), [
    'daily',
    'weekly',
    'four_week',
    'twelve_week',
  ]);
});

test('only real YYYY-MM-DD dates pass, with a Korean message otherwise', () => {
  assert.equal(isCalendarDate('2028-02-29'), true);
  assert.equal(isCalendarDate('2026-02-29'), false);
  assert.equal(isCalendarDate('2026-13-01'), false);
  assert.equal(isCalendarDate('2026-1-01'), false);
  const result = calendarDate.safeParse('2026-02-30');
  assert.equal(result.success, false);
  assert.equal(result.error?.issues[0].message, '날짜는 YYYY-MM-DD 형식의 실제 날짜여야 합니다');
});

test('days between counts calendar days across months and years', () => {
  assert.equal(daysBetween('2026-10-22', '2026-10-22'), 0);
  assert.equal(daysBetween('2026-10-22', '2026-11-14'), 23);
  assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1);
  assert.equal(daysBetween('2026-10-23', '2026-10-22'), -1);
});
