import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from 'vitest';

import { dailyCategories, groupByCategory } from './routine-groups';

const backendSource = readFileSync(
  join(import.meta.dirname, '../../backend/src/routines.ts'),
  'utf8',
);

const backendCodes = () => {
  const list = /routineCategories = \[([^\]]*)\] as const/.exec(backendSource)?.[1] ?? '';
  return [...list.matchAll(/'([^']+)'/g)].map((match) => match[1]);
};

const backendLabels = () => {
  const body = /routineCategoryLabels[^{]*\{([^}]*)\}/.exec(backendSource)?.[1] ?? '';
  return Object.fromEntries([...body.matchAll(/(\w+): '([^']+)'/g)].map((m) => [m[1], m[2]]));
};

test('the screen categories have the backend codes, order and labels', () => {
  const codes = backendCodes();
  expect(codes.length).toBeGreaterThan(0);
  expect(dailyCategories.map((category) => category.key)).toEqual(codes);
  expect(Object.fromEntries(dailyCategories.map((c) => [c.key, c.label]))).toEqual(backendLabels());
});

const routine = (id: number | string, category: string | null, sortOrder = 1) => ({
  id: id as number,
  name: `Routine ${id}`,
  cadence: 'daily',
  category,
  sortOrder,
});

test('routines with an unknown or missing category go to an "Other" group', () => {
  const groups = groupByCategory([routine(1, 'wake'), routine(2, 'sleep'), routine(3, null)]);
  const other = groups.at(-1);
  expect(other).toMatchObject({ key: 'other', label: 'Other', known: false });
  expect(other?.routines.map((r) => r.id)).toEqual([2, 3]);
  expect(groups.slice(0, -1).every((group) => group.known)).toBe(true);
});

test('there is no "Other" group when every category is known', () => {
  expect(groupByCategory([routine(1, 'wake')]).some((group) => group.key === 'other')).toBe(false);
});

test('ids sort by length then value, without losing precision on large ids', () => {
  const big = '9007199254740993';
  const bigger = '9007199254740994';
  const groups = groupByCategory([
    routine(bigger, 'wake'),
    routine(big, 'wake'),
    routine('10', 'wake'),
    routine('9', 'wake'),
  ]);
  expect(groups[0].routines.map((r) => String(r.id))).toEqual(['9', '10', big, bigger]);
});
