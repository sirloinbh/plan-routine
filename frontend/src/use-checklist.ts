import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { ChecklistItem } from './checklist';
import { requestJson } from './lib/api';
import { serviceToday } from './lib/format';
import { apiKey, useApiQuery } from './lib/query';
import { errorText, useNotice } from './lib/use-notice';
import { useReloadWhenCurrent } from './use-date-change';

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

// An N-per-week routine counts today's check in its week total too, so the box and "2/3 this week" agree.
function withChecked<T extends ChecklistItem>(item: T, checked: boolean): T {
  if (item.checked === checked) return item;
  const weekChecks =
    item.timesPerWeek && item.weekChecks != null
      ? Math.max(item.weekChecks + (checked ? 1 : -1), 0)
      : item.weekChecks;
  // An amount belongs to a check, so unchecking drops it.
  return { ...item, checked, weekChecks, amount: checked ? item.amount : null };
}

// Loads a cadence's checklist and saves checks, showing them at once. `onSaveFailed` tells pages that
// also list the routines that a save failed. Changes to the routines invalidate this checklist's query.
export function useChecklist<T extends ChecklistItem>(cadence: string, onSaveFailed?: () => void) {
  const client = useQueryClient();
  // null follows the server's today: the next load after midnight shows the new day.
  const [date, setDate] = useState<string | null>(null);
  const { notice: savedNotice, status, error, clear } = useNotice();
  // Ignoring repeat clicks (instead of disabling the box) keeps keyboard focus on the box.
  const saving = useRef(new Set<string>());
  const reloadAfterSaves = useRef(false);

  const listKey = apiKey('/api/checklist', cadence);
  const query = useApiQuery<ChecklistData<T>>(
    apiKey('/api/checklist', cadence, date),
    `/api/checklist?cadence=${cadence}${date ? `&date=${date}` : ''}`,
    { staleTime: 0 },
  );
  const { refetch, isFetching } = query;
  // Saves in flight show their box as saved over whatever a load says, so a load that read the server
  // before a save committed cannot undo the box on screen.
  const [pending, setPending] = useState<Record<string, boolean>>({});
  // The day on screen stays while the next one loads or fails to load.
  const lastData = useRef<ChecklistData<T> | null>(null);
  if (query.data) lastData.current = query.data;
  const loaded = query.data ?? lastData.current;
  const data = useMemo(
    () =>
      loaded && Object.keys(pending).length > 0
        ? {
            ...loaded,
            items: loaded.items.map((item) => {
              const key = `${loaded.date}/${item.id}`;
              return key in pending ? withChecked(item, pending[key]) : item;
            }),
          }
        : loaded,
    [loaded, pending],
  );
  const loadFailed = query.isError;

  // The day when what is on screen was loaded. Comparing with this rather than with the server's today
  // keeps a wrong device clock from causing trouble.
  const shownOn = useRef('');
  useEffect(() => {
    if (query.data) shownOn.current = serviceToday();
  }, [query.data]);

  // A load that read the server around a save may not show it. Counts every save's start and end, so a
  // load overlapping either one is loaded again once the saves are done.
  const saveEvents = useRef(0);
  const eventsAtLoadStart = useRef(0);
  const wasFetching = useRef(false);
  useEffect(() => {
    if (isFetching && !wasFetching.current) eventsAtLoadStart.current = saveEvents.current;
    if (!isFetching && wasFetching.current) {
      if (saving.current.size > 0) reloadAfterSaves.current = true;
      else if (saveEvents.current !== eventsAtLoadStart.current) void refetch();
    }
    wasFetching.current = isFetching;
  }, [isFetching, refetch]);

  // A page left open (an installed app, a phone tab) must not keep saving to an earlier period.
  useReloadWhenCurrent(query, '/api/checklist');

  // Show the load's own failure unless a save or a date message is on screen.
  const notice =
    savedNotice ??
    (query.error ? { kind: 'error' as const, text: errorText(query.error) } : undefined);

  const setChecked = (itemDate: string, id: number, checked: boolean) =>
    // The user may have moved to another day while this request was running.
    client.setQueriesData<ChecklistData<T>>({ queryKey: listKey }, (current) =>
      current?.date === itemDate
        ? {
            ...current,
            items: current.items.map((item) =>
              item.id === id ? withChecked(item, checked) : item,
            ),
          }
        : current,
    );

  const toggle = async (itemDate: string, item: ChecklistItem) => {
    // Following today on a screen from an earlier period: this check would land in that period.
    const current = serviceToday();
    if (date === null && data && current !== shownOn.current && current > data.period.end) {
      status('The date changed and a new period was loaded. Please check again');
      void refetch();
      return;
    }
    const saveKey = `${itemDate}/${item.id}`;
    if (saving.current.has(saveKey)) return;
    saving.current.add(saveKey);
    saveEvents.current += 1;
    clear();
    const checked = !item.checked;
    setPending((now) => ({ ...now, [saveKey]: checked }));
    try {
      await requestJson(`/api/routines/${item.id}/checks/${itemDate}`, {
        method: checked ? 'PUT' : 'DELETE',
      });
      setChecked(itemDate, item.id, checked);
    } catch (cause) {
      error(cause);
      // A 404 usually means the list is stale (the routine was archived elsewhere).
      void refetch();
      onSaveFailed?.();
    } finally {
      saving.current.delete(saveKey);
      saveEvents.current += 1;
      setPending(({ [saveKey]: _done, ...rest }) => rest);
      if (saving.current.size === 0 && reloadAfterSaves.current) {
        reloadAfterSaves.current = false;
        void refetch();
      }
    }
  };

  const setSkip = (itemDate: string, id: number, skipped: boolean, skipReason: string | null) =>
    client.setQueriesData<ChecklistData<T>>({ queryKey: listKey }, (current) =>
      current?.date === itemDate
        ? {
            ...current,
            items: current.items.map((item) =>
              item.id === id ? { ...item, skipped, skipReason } : item,
            ),
          }
        : current,
    );

  // Skipping or removing a skip. Shown once the server has answered: a refused skip (409, the item was
  // checked elsewhere) must not flash as saved.
  const changeSkip = async (itemDate: string, item: ChecklistItem, reason: string | null) => {
    const saveKey = `${itemDate}/${item.id}`;
    if (saving.current.has(saveKey)) return;
    saving.current.add(saveKey);
    saveEvents.current += 1;
    clear();
    try {
      const skipped = reason !== null;
      await requestJson(`/api/routines/${item.id}/skips/${itemDate}`, {
        method: skipped ? 'PUT' : 'DELETE',
        ...(skipped ? { body: { reason } } : {}),
      });
      setSkip(itemDate, item.id, skipped, reason || null);
    } catch (cause) {
      error(cause);
      void refetch();
      onSaveFailed?.();
    } finally {
      saving.current.delete(saveKey);
      saveEvents.current += 1;
      if (saving.current.size === 0 && reloadAfterSaves.current) {
        reloadAfterSaves.current = false;
        void refetch();
      }
    }
  };
  const skip = (itemDate: string, item: ChecklistItem, reason: string) =>
    changeSkip(itemDate, item, reason);
  const unskip = (itemDate: string, item: ChecklistItem) => changeSkip(itemDate, item, null);

  // Saves the amount of a checked routine. Shown once the server has answered, like a skip.
  const saveAmount = async (itemDate: string, item: ChecklistItem, amount: number | null) => {
    const saveKey = `${itemDate}/${item.id}`;
    if (saving.current.has(saveKey)) return;
    saving.current.add(saveKey);
    saveEvents.current += 1;
    clear();
    try {
      await requestJson(`/api/routines/${item.id}/checks/${itemDate}`, {
        method: 'PUT',
        body: { amount },
      });
      client.setQueriesData<ChecklistData<T>>({ queryKey: listKey }, (current) =>
        current?.date === itemDate
          ? {
              ...current,
              items: current.items.map((entry) =>
                entry.id === item.id ? { ...entry, amount } : entry,
              ),
            }
          : current,
      );
      status(
        amount === null ? `Cleared the amount of ${item.name}` : `Saved the amount of ${item.name}`,
      );
    } catch (cause) {
      error(cause);
      void refetch();
      onSaveFailed?.();
    } finally {
      saving.current.delete(saveKey);
      saveEvents.current += 1;
      if (saving.current.size === 0 && reloadAfterSaves.current) {
        reloadAfterSaves.current = false;
        void refetch();
      }
    }
  };

  // Moving to the same day again retries a failed load.
  const moveTo = (target: string | null) => {
    clear();
    setDate(target);
    if (target === date) void refetch();
  };

  const retry = () => moveTo(date);

  return { data, loadFailed, notice, toggle, skip, unskip, saveAmount, moveTo, retry };
}
