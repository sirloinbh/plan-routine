import { type RefObject, useCallback, useEffect, useRef } from 'react';

import { RequestError } from './lib/api';
import { serviceDate } from './service-date';

// How often an open page looks at the clock. A request follows only if the date has changed, the
// last load failed for a passing reason, or the server is on another date than this device.
const dateCheckMs = 60_000;

/**
 * True for a failed load worth trying again: the server could not be reached, timed out, answered 5xx, or asked to
 * slow down (408, 429). Other 4xx would only fail the same way again, and a broken (non-HTTP) answer is not retried
 * every minute forever.
 */
export function isPassingFailure(cause: unknown) {
  if (!(cause instanceof RequestError)) return false;
  if (cause.kind === 'network' || cause.kind === 'timeout') return true;
  const status = cause.status;
  return status !== undefined && (status >= 500 || status === 408 || status === 429);
}

// A window left open may never fire visibilitychange, so also look at the clock while it is open.
// `requestedOn` holds the device's date when the latest load started; empty it to ask again.
export function useReloadOnDateChange(requestedOn: RefObject<string>, reload: () => void) {
  useEffect(() => {
    const reloadIfDateChanged = () => {
      if (serviceDate() !== requestedOn.current) reload();
    };
    const timer = setInterval(reloadIfDateChanged, dateCheckMs);
    window.addEventListener('focus', reloadIfDateChanged);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', reloadIfDateChanged);
    };
  }, [requestedOn, reload]);
}

/**
 * Keeps a query on screen current: it loads again when the service date changes while the page is open, when the last
 * load failed for a passing reason (at the next check), when the server is on another date than this device, and when
 * the page is shown again. `serverToday` is the `today` of the loaded data.
 */
export function useReloadWhenCurrent(
  query: { isFetching: boolean; error: unknown; refetch: () => unknown },
  serverToday: string | undefined,
) {
  const { isFetching, error, refetch } = query;
  // The device's date when the latest load started; emptied to ask again at the next check.
  const requestedOn = useRef('');
  useEffect(() => {
    if (isFetching) requestedOn.current = serviceDate();
  }, [isFetching]);
  useEffect(() => {
    if (isFetching) return;
    if (error) {
      if (isPassingFailure(error)) requestedOn.current = '';
    } else if (serverToday && serverToday !== requestedOn.current) {
      // The server is not on this device's date yet (a fast clock), so ask again at the next check.
      requestedOn.current = '';
    }
  }, [isFetching, error, serverToday]);

  const reload = useCallback(() => void refetch(), [refetch]);
  useReloadOnDateChange(requestedOn, reload);

  // Changes made on other pages or devices show up when the page is shown again.
  useEffect(() => {
    const reloadWhenShown = () => {
      if (document.visibilityState === 'visible') reload();
    };
    document.addEventListener('visibilitychange', reloadWhenShown);
    return () => document.removeEventListener('visibilitychange', reloadWhenShown);
  }, [reload]);
}
