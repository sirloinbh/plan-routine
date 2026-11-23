// Skipped routines are left out of the total, as they are in the stats.
export function progressText(items: { checked: boolean; skipped?: boolean }[]) {
  const counted = items.filter((item) => !item.skipped);
  return `${counted.filter((item) => item.checked).length}/${counted.length}`;
}
