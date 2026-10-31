// Today in the service time zone, by this device's clock. Only used to notice that the date has
// changed; which date is "today" is always the server's call.
export function serviceDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
