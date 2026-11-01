import { type RefObject, useEffect } from 'react';

import { RequestError } from './lib/api';
import { serviceDate } from './service-date';

// How often an open page looks at the clock. A request follows only if the date has changed, the
// last load failed for a passing reason, or the server is on another date than this device.
const dateCheckMs = 60_000;

/** True for a failed load worth trying again; a 4xx would only fail the same way again. */
export function isPassingFailure(cause: unknown) {
  const status = cause instanceof RequestError ? cause.status : undefined;
  return status === undefined || status >= 500;
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
