import type { Routine } from './routines';

// Same codes, labels and order as the backend's routineCategories and routineCategoryLabels
// (`routine-groups.test.ts` fails when they differ).
export const dailyCategories = [
  { key: 'wake', label: 'Wake-up', addLabel: 'Add a wake-up routine' },
  { key: 'exercise', label: 'Exercise', addLabel: 'Add an exercise routine' },
  { key: 'diet', label: 'Diet', addLabel: 'Add a diet routine' },
  { key: 'housework', label: 'Housework', addLabel: 'Add a housework routine' },
  { key: 'care', label: 'Self-care', addLabel: 'Add a self-care routine' },
  { key: 'study', label: 'Study', addLabel: 'Add a study routine' },
  { key: 'reading', label: 'Reading', addLabel: 'Add a reading routine' },
];

// Ids are compared as strings, by length and then by value, so a large id never loses precision.
const compareIds = (a: number | string, b: number | string) => {
  const left = String(a);
  const right = String(b);
  return left.length - right.length || (left < right ? -1 : left > right ? 1 : 0);
};

const otherCategory = { key: 'other', label: 'Other', addLabel: 'Add a routine' };

/** One group per known category, plus an "Other" group (only when it has routines) for unknown ones. */
export function groupByCategory<T extends Routine>(routines: T[]) {
  const known = new Set<string>(dailyCategories.map((category) => category.key));
  const inOrder = (items: T[]) =>
    items.sort((a, b) => a.sortOrder - b.sortOrder || compareIds(a.id, b.id));
  const groups = dailyCategories.map((category) => ({
    ...category,
    known: true,
    routines: inOrder(routines.filter((routine) => routine.category === category.key)),
  }));
  const others = routines.filter((routine) => !known.has(routine.category ?? ''));
  return others.length > 0
    ? [...groups, { ...otherCategory, known: false, routines: inOrder(others) }]
    : groups;
}
