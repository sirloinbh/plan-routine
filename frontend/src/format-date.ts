// Dates arrive from the API as YYYY-MM-DD calendar dates. They are formatted in UTC so the day never shifts
// with the device's time zone.
const formats = {
  long: { year: 'numeric', month: 'long', day: 'numeric' },
  weekday: { weekday: 'short', month: 'short', day: 'numeric' },
  short: { month: 'short', day: 'numeric' },
} as const;

/** `formatDate('2026-10-22')` is "October 22, 2026"; `'weekday'` gives "Thu, Oct 22" and `'short'` "Oct 22". */
export function formatDate(date: string, style: keyof typeof formats = 'long'): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('en-US', { ...formats[style], timeZone: 'UTC' }).format(parsed);
}

/** "October 22, 2026", with "Today" in front when it is today. */
export const dateHeading = (date: string, today: string) =>
  date === today ? `Today (${formatDate(date)})` : formatDate(date);
