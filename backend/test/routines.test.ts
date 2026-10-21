import { test } from 'node:test';
import assert from 'node:assert/strict';
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

test('an invalid date is rejected with a Korean 400', async () => {
  await withApi(anchorPool('2026-10-22').pool, async (call) => {
    const { status, data } = await call('/api/periods?date=2026-02-30');
    assert.equal(status, 400);
    assert.equal(data.error, '날짜는 YYYY-MM-DD 형식의 실제 날짜여야 합니다');
  });
});

test('routine input trims names and requires a category only for daily routines', () => {
  assert.deepEqual(
    routineInput.parse({ name: '  6시 기상 ', cadence: 'daily', category: 'wake' }),
    {
      name: '6시 기상',
      cadence: 'daily',
      category: 'wake',
    },
  );
  assert.deepEqual(routineInput.parse({ name: '이불빨래', cadence: 'four_week' }), {
    name: '이불빨래',
    cadence: 'four_week',
  });
});

test('invalid routine input fails with Korean messages', () => {
  const messages = (input: unknown) => {
    const result = routineInput.safeParse(input);
    assert.equal(result.success, false);
    return result.error?.issues.map((issue) => issue.message);
  };
  assert.deepEqual(messages({ name: '   ', cadence: 'daily', category: 'wake' }), [
    '루틴 이름을 입력해 주세요',
  ]);
  assert.deepEqual(messages({ name: 'x'.repeat(101), cadence: 'weekly' }), [
    '루틴 이름은 100자 이하로 입력해 주세요',
  ]);
  assert.deepEqual(messages({ name: '운동', cadence: 'monthly' }), [
    '루틴 주기는 매일, 매주, 4주, 12주 중 하나여야 합니다',
  ]);
  assert.deepEqual(messages({ name: '운동', cadence: 'daily' }), [
    '하루 루틴은 카테고리를 선택해 주세요',
  ]);
  assert.deepEqual(messages({ name: '청소', cadence: 'weekly', category: 'housework' }), [
    '카테고리는 하루 루틴에만 지정할 수 있습니다',
  ]);
  assert.deepEqual(messages({ name: '운동', cadence: 'daily', category: 'sleep' }), [
    '하루 루틴 카테고리가 올바르지 않습니다',
  ]);
});

test('a repeated date query parameter is rejected with a Korean 400', async () => {
  await withApi(anchorPool('2026-10-22').pool, async (call) => {
    const { status, data } = await call('/api/periods?date=2026-10-22&date=2026-10-23');
    assert.equal(status, 400);
    assert.equal(data.error, '날짜 형식이 올바르지 않습니다');
  });
});
