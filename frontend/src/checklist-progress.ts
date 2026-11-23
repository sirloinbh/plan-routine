type Progressing = {
  checked: boolean;
  skipped?: boolean;
  timesPerWeek?: number | null;
  weekChecks?: number | null;
};

// An N-per-week routine is done at N checks in the week; its own box only records today's check (#245).
export const isDone = (item: Progressing) =>
  item.timesPerWeek ? (item.weekChecks ?? 0) >= item.timesPerWeek : item.checked;

// Skipped routines are left out of the total, as they are in the stats.
export function progressText(items: Progressing[]) {
  const counted = items.filter((item) => !item.skipped);
  return `${counted.filter(isDone).length}/${counted.length}`;
}
