import { useEffect, useRef, useState } from 'react';

import type { ChecklistItem } from './checklist';
import { requestJson } from './lib/api';
import { useNotice } from './lib/use-notice';
import { serviceDate } from './service-date';

// How often an open page looks at the clock. No request is sent unless the date has changed.
const dateCheckMs = 60_000;

export type ChecklistData<T> = {
  date: string;
  today: string;
  previousDate: string | null;
  nextDate: string | null;
  period: { start: string; end: string };
  remainingDays: number;
  endsSoon: boolean;
  items: T[];
};

// Loads a cadence's checklist and saves checks, showing them at once. Changing `reloadKey` loads
// again, for pages that also change the routines themselves; `onSaveFailed` tells them a save failed.
export function useChecklist<T extends ChecklistItem>(
  cadence: string,
  reloadKey = 0,
  onSaveFailed?: () => void,
) {
  // null follows the server's today: the next load after midnight shows the new day.
  const [date, setDate] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [data, setData] = useState<ChecklistData<T> | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const { notice, status, error, clear } = useNotice();
  // Ignoring repeat clicks (instead of disabling the box) keeps keyboard focus on the box.
  const saving = useRef(new Set<string>());
  // Counts every save's start and end, so a load overlapping either one can be recognised.
  const saveEvents = useRef(0);
  const loadErrorShown = useRef(false);
  const reloadAfterSaves = useRef(false);
  // The device's date when the latest load started, and when what is on screen was loaded. Comparing
  // with these rather than with the server's today keeps a wrong device clock from causing trouble.
  const requestedOn = useRef('');
  const shownOn = useRef('');

  useEffect(() => {
    // A newer load supersedes this one, so a slow older response cannot overwrite it.
    let ignore = false;
    const eventsAtStart = saveEvents.current;
    const startedOn = serviceDate();
    requestedOn.current = startedOn;
    requestJson<ChecklistData<T>>(`/api/checklist?cadence=${cadence}${date ? `&date=${date}` : ''}`)
      .then((loaded) => {
        if (ignore) return;
        // This response may predate a save, so showing it could undo a checked box on screen.
        if (saving.current.size > 0) {
          reloadAfterSaves.current = true;
          return;
        }
        if (saveEvents.current !== eventsAtStart) {
          setVersion((value) => value + 1);
          return;
        }
        setData(loaded);
        shownOn.current = startedOn;
        // The server is not on this device's date yet (a fast clock), so ask again at the next check.
        if (loaded.today !== startedOn) requestedOn.current = '';
        setLoadFailed(false);
        // Only a load's own error: a failed save's message must survive the reload after it.
        if (loadErrorShown.current) clear();
        loadErrorShown.current = false;
      })
      .catch((cause: unknown) => {
        if (ignore) return;
        setLoadFailed(true);
        loadErrorShown.current = true;
        // Try again at the next check: the network may just not be back yet after sleep.
        requestedOn.current = '';
        error(cause);
      });
    return () => {
      ignore = true;
    };
  }, [cadence, date, version, reloadKey, error, clear]);

  // A page left open (an installed app, a phone tab) must not keep saving to an earlier period.
  useEffect(() => {
    const reloadWhenShown = () => {
      if (document.visibilityState === 'visible') setVersion((value) => value + 1);
    };
    document.addEventListener('visibilitychange', reloadWhenShown);
    return () => document.removeEventListener('visibilitychange', reloadWhenShown);
  }, []);

  // A window left open may never fire visibilitychange, so also look at the clock while it is open.
  useEffect(() => {
    const reloadIfDateChanged = () => {
      if (serviceDate() !== requestedOn.current) setVersion((value) => value + 1);
    };
    const timer = setInterval(reloadIfDateChanged, dateCheckMs);
    window.addEventListener('focus', reloadIfDateChanged);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', reloadIfDateChanged);
    };
  }, []);

  const setChecked = (itemDate: string, id: string, checked: boolean) =>
    // The user may have moved to another day while this request was running.
    setData((current) =>
      current?.date === itemDate
        ? {
            ...current,
            items: current.items.map((item) => (item.id === id ? { ...item, checked } : item)),
          }
        : current,
    );

  const toggle = async (itemDate: string, item: ChecklistItem) => {
    // Following today on a screen from an earlier period: this check would land in that period.
    const current = serviceDate();
    if (date === null && data && current !== shownOn.current && current > data.period.end) {
      loadErrorShown.current = false;
      status('날짜가 바뀌어 새 기간을 불러왔습니다. 다시 체크해 주세요');
      setVersion((value) => value + 1);
      return;
    }
    const saveKey = `${itemDate}/${item.id}`;
    if (saving.current.has(saveKey)) return;
    saving.current.add(saveKey);
    saveEvents.current += 1;
    loadErrorShown.current = false;
    clear();
    const checked = !item.checked;
    setChecked(itemDate, item.id, checked);
    try {
      await requestJson(`/api/routines/${item.id}/checks/${itemDate}`, {
        method: checked ? 'PUT' : 'DELETE',
      });
    } catch (cause) {
      setChecked(itemDate, item.id, item.checked);
      error(cause);
      // A 404 usually means the list is stale (the routine was archived elsewhere).
      setVersion((value) => value + 1);
      onSaveFailed?.();
    } finally {
      saving.current.delete(saveKey);
      saveEvents.current += 1;
      // A load that failed during this save must not make the next load clear its message.
      loadErrorShown.current = false;
      if (saving.current.size === 0 && reloadAfterSaves.current) {
        reloadAfterSaves.current = false;
        setVersion((value) => value + 1);
      }
    }
  };

  // Also bumps the version so pressing the same button again retries a failed load.
  const moveTo = (target: string | null) => {
    clear();
    setDate(target);
    setVersion((value) => value + 1);
  };

  const retry = () => {
    setLoadFailed(false);
    moveTo(date);
  };

  return { data, loadFailed, notice, toggle, moveTo, retry };
}
