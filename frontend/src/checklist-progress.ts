export function progressText(items: { checked: boolean }[]) {
  return `${items.filter((item) => item.checked).length}/${items.length}`;
}
