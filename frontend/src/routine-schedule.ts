// Weekday numbers follow the server: 0 = Sunday ... 6 = Saturday.
export const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const fullWeekdayNames = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/** "Mon, Wed, Fri" or "3 times a week"; empty for a routine with no schedule. */
export function scheduleText(routine: {
  weekdays?: number[] | null;
  timesPerWeek?: number | null;
}) {
  if (routine.weekdays?.length) return routine.weekdays.map((day) => weekdayNames[day]).join(', ');
  if (routine.timesPerWeek) return `${routine.timesPerWeek} times a week`;
  return '';
}
