import { useEffect, useRef, useState } from 'react';

import type { ChecklistItem } from './checklist';
import { requestJson } from './lib/api';
import { useNotice } from './lib/use-notice';

export type ChecklistData<T> = {
  date: string;
  today: string;
  previousDate: string | null;
  nextDate: string | null;
  period: { start: string; end: string };
  items: T[];
};

// Loads a cadence's checklist and saves checks, showing them at once. Changing `reloadKey` loads
// again, for pages that also change the routines themselves.
export function useChecklist<T extends ChecklistItem>(cadence: string, reloadKey = 0) {
  // null follows the server's today: the next load after midnight shows the new day.
  const [date, setDate] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [data, setData] = useState<ChecklistData<T> | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const { notice, error, clear } = useNotice();
  // Ignoring repeat clicks (instead of disabling the box) keeps keyboard focus on the box.
  const saving = useRef(new Set<string>());
  // Counts every save's start and end, so a load overlapping either one can be recognised.
  const saveEvents = useRef(0);
  const loadErrorShown = useRef(false);
  const reloadAfterSaves = useRef(false);

  useEffect(() => {
    // A newer load supersedes this one, so a slow older response cannot overwrite it.
    let ignore = false;
    const eventsAtStart = saveEvents.current;
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
        setLoadFailed(false);
        // Only a load's own error: a failed save's message must survive the reload after it.
        if (loadErrorShown.current) clear();
        loadErrorShown.current = false;
      })
      .catch((cause: unknown) => {
        if (ignore) return;
        setLoadFailed(true);
        loadErrorShown.current = true;
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
    } finally {
      saving.current.delete(saveKey);
      saveEvents.current += 1;
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
