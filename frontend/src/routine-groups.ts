import type { Routine } from './routines';

// Same codes and order as the backend's routineCategories.
const dailyCategories = [
  { key: 'wake', label: 'Wake-up', addLabel: 'Add a wake-up routine' },
  { key: 'exercise', label: 'Exercise', addLabel: 'Add an exercise routine' },
  { key: 'diet', label: 'Diet', addLabel: 'Add a diet routine' },
  { key: 'housework', label: 'Housework', addLabel: 'Add a housework routine' },
  { key: 'care', label: 'Self-care', addLabel: 'Add a self-care routine' },
  { key: 'study', label: 'Study', addLabel: 'Add a study routine' },
  { key: 'reading', label: 'Reading', addLabel: 'Add a reading routine' },
];

export function groupByCategory<T extends Routine>(routines: T[]) {
  return dailyCategories.map((category) => ({
    ...category,
    routines: routines
      .filter((routine) => routine.category === category.key)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
  }));
}
