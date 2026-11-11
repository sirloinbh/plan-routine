import type { Routine } from './routines';

// Same codes and order as the backend's routineCategories.
const dailyCategories = [
  { key: 'wake', label: 'Wake-up' },
  { key: 'exercise', label: 'Exercise' },
  { key: 'diet', label: 'Diet' },
  { key: 'housework', label: 'Housework' },
  { key: 'care', label: 'Self-care' },
  { key: 'study', label: 'Study' },
  { key: 'reading', label: 'Reading' },
];

export function groupByCategory<T extends Routine>(routines: T[]) {
  return dailyCategories.map((category) => ({
    ...category,
    routines: routines
      .filter((routine) => routine.category === category.key)
      .sort((a, b) => a.sortOrder - b.sortOrder || Number(a.id) - Number(b.id)),
  }));
}
