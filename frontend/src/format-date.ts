import { formatDate } from './lib/format';

// Date text that the shared `formatDate` (lib/format) has no style for. Dates arrive from the API as YYYY-MM-DD
// calendar dates and are formatted in UTC so the day never shifts with the device's time zone.
const styles = {
  weekday: { weekday: 'short', month: 'short', day: 'numeric' },
  month: { year: 'numeric', month: 'long' },
} as const;

function format(date: string, style: keyof typeof styles): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('en-US', { ...styles[style], timeZone: 'UTC' }).format(parsed);
}

/** "Thu, Oct 22". */
export const weekdayDate = (date: string) => format(date, 'weekday');

/** "October 2026", for a day in that month. */
export const monthYear = (date: string) => format(date, 'month');

/** "Oct 22, 2026", with "Today" in front when it is today. */
export const dateHeading = (date: string, today: string) =>
  date === today ? `Today (${formatDate(date)})` : formatDate(date);
