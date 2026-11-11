import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { routineInput } from '../src/routines.js';
import { withApi } from './helpers.js';

// Fake pool that answers the anchor query with a stored first-use date and records the call.
function anchorPool(stored: string) {
  const calls: unknown[][] = [];
  const pool = {
    query: async (_sql: string, params: unknown[]) => {
      calls.push(params);
      return { rows: [{ value: stored }] };
    },
  } as unknown as Pool;
  return { pool, calls };
}

test('periods use the stored first-use date and default to the service date', async () => {
  const { pool, calls } = anchorPool('2026-10-22');
  await withApi(
    pool,
    async (call) => {
      const { status, data } = await call('/api/periods');
      assert.equal(status, 200);
      assert.equal(data.date, '2026-11-20');
      assert.equal(data.anchorDate, '2026-10-22');
      assert.deepEqual(data.periods, {
        daily: { start: '2026-11-20', end: '2026-11-20' },
        weekly: { start: '2026-11-15', end: '2026-11-21' },
        four_week: { start: '2026-11-15', end: '2026-12-12' },
        twelve_week: { start: '2026-10-18', end: '2027-01-09' },
      });
    },
    { today: () => '2026-11-20' },
  );
  // Today is offered as the first-use date; the DB keeps the earlier one if already set.
  assert.deepEqual(calls, [['routine_anchor_date', '2026-11-20']]);
});

test('periods for a requested date', async () => {
  await withApi(
    anchorPool('2026-10-22').pool,
    async (call) => {
      const { status, data } = await call('/api/periods?date=2026-10-24');
      assert.equal(status, 200);
      assert.deepEqual((data.periods as Record<string, unknown>).weekly, {
        start: '2026-10-18',
        end: '2026-10-24',
      });
    },
    { today: () => '2026-11-20' },
  );
});

test('an invalid date is rejected with an English 400', async () => {
  await withApi(anchorPool('2026-10-22').pool, async (call) => {
    const { status, data } = await call('/api/periods?date=2026-02-30');
    assert.equal(status, 400);
    assert.equal(data.error, 'Date must be a real date in YYYY-MM-DD format');
  });
});

test('routine input trims names and requires a category only for daily routines', () => {
  assert.deepEqual(
    routineInput.parse({ name: '  Wake at 6 ', cadence: 'daily', category: 'wake' }),
    {
      name: 'Wake at 6',
      cadence: 'daily',
      category: 'wake',
    },
  );
  assert.deepEqual(routineInput.parse({ name: 'Wash bedding', cadence: 'four_week' }), {
    name: 'Wash bedding',
    cadence: 'four_week',
  });
});

test('invalid routine input fails with English messages', () => {
  const messages = (input: unknown) => {
    const result = routineInput.safeParse(input);
    assert.equal(result.success, false);
    return result.error?.issues.map((issue) => issue.message);
  };
  assert.deepEqual(messages({ name: '   ', cadence: 'daily', category: 'wake' }), [
    'Enter a routine name',
  ]);
  assert.deepEqual(messages({ name: 'x'.repeat(101), cadence: 'weekly' }), [
    'The routine name must be 100 characters or fewer',
  ]);
  assert.deepEqual(messages({ name: 'Exercise', cadence: 'monthly' }), [
    'Routine cadence must be daily, weekly, four-week, or twelve-week',
  ]);
  assert.deepEqual(messages({ name: 'Exercise', cadence: 'daily' }), [
    'Choose a category for a daily routine',
  ]);
  assert.deepEqual(messages({ name: 'Clean', cadence: 'weekly', category: 'housework' }), [
    'Only daily routines can have a category',
  ]);
  assert.deepEqual(messages({ name: 'Exercise', cadence: 'daily', category: 'sleep' }), [
    'Invalid daily routine category',
  ]);
});

test('a repeated date query parameter is rejected with an English 400', async () => {
  await withApi(anchorPool('2026-10-22').pool, async (call) => {
    const { status, data } = await call('/api/periods?date=2026-10-22&date=2026-10-23');
    assert.equal(status, 400);
    assert.equal(data.error, 'Invalid date format');
  });
});

test('a missing routine name and a name of the wrong type have different messages', () => {
  const message = (name: unknown) =>
    routineInput.safeParse({ name, cadence: 'weekly' }).error?.issues[0].message;
  assert.equal(message(undefined), 'Enter a routine name');
  assert.equal(message(1), 'The routine name must be text');
});

test('a routine name that is not text answers with one message, even if it has a length', () => {
  const messages = (name: unknown) =>
    routineInput.safeParse({ name, cadence: 'weekly' }).error?.issues.map((issue) => issue.message);
  assert.deepEqual(messages([]), ['The routine name must be text']);
  assert.deepEqual(messages(Array.from({ length: 101 }, () => 'a')), [
    'The routine name must be text',
  ]);
});
