import { useQueryClient } from '@tanstack/react-query';
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
 * load failed for a passing reason (at the next check), when the server is on another date than this device (its
 * answer has a `today`), and when the page is shown again. `path` is the first part of the query key
 * (`apiKey(path, ...)`), so the device's date is noted when a load of this screen starts and ends.
 */
export function useReloadWhenCurrent(query: { refetch: () => unknown }, path: string) {
  const client = useQueryClient();
  const { refetch } = query;
  // The device's date when the latest load started; emptied to ask again at the next check.
  const requestedOn = useRef(serviceDate());
  useEffect(
    () =>
      client.getQueryCache().subscribe((event) => {
        if (event.type !== 'updated' || event.query.queryKey[0] !== path) return;
        const { action } = event;
        if (action.type === 'fetch') requestedOn.current = serviceDate();
        else if (action.type === 'error' && isPassingFailure(action.error))
          requestedOn.current = '';
        else if (action.type === 'success' && !action.manual) {
          const today = (event.query.state.data as { today?: string } | undefined)?.today;
          // The server is not on this device's date yet (a fast clock), so ask again at the next check.
          if (today && today !== requestedOn.current) requestedOn.current = '';
        }
      }),
    [client, path],
  );

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
