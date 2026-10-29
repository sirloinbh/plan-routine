import type { Routine } from './routines';

// Same codes and order as the backend's routineCategories.
const dailyCategories = [
  { key: 'wake', label: '기상' },
  { key: 'exercise', label: '운동' },
  { key: 'diet', label: '식단' },
  { key: 'housework', label: '가사' },
  { key: 'care', label: '관리' },
  { key: 'study', label: '공부' },
  { key: 'reading', label: '독서' },
];

export function groupByCategory(routines: Routine[]) {
  return dailyCategories.map((category) => ({
    ...category,
    routines: routines
      .filter((routine) => routine.category === category.key)
      .sort((a, b) => a.sortOrder - b.sortOrder || Number(a.id) - Number(b.id)),
  }));
}
