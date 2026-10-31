import { useCallback, useEffect, useRef, useState } from 'react';

import { requestJson } from './api';
import type { Routine } from './routines';

export type RoutineNotice = { kind: 'status' | 'alert'; text: string } | null;

// Loads one cadence's routines and changes them. All state lives here (not in child components)
// so per-item editing survives re-renders. `version` changes after every change made here;
// `refresh` only loads again, so it does not tell other lists on the page that something changed.
export function useRoutineList(cadence: string) {
  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const [version, setVersion] = useState(0);
  const [refreshes, setRefreshes] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<RoutineNotice>(null);
  const loadErrorShown = useRef(false);

  useEffect(() => {
    // A newer reload supersedes this one, so a slow older response cannot overwrite it.
    let ignore = false;
    requestJson<{ routines: Routine[] }>(`/api/routines?cadence=${cadence}`)
      .then((data) => {
        if (ignore) return;
        setRoutines(data.routines);
        setLoadFailed(false);
        // Only a load's own error: the message of a failed change must survive the reload after it.
        if (loadErrorShown.current) setNotice(null);
        loadErrorShown.current = false;
      })
      .catch((error: Error) => {
        if (ignore) return;
        setRoutines((current) => current ?? []);
        setLoadFailed(true);
        loadErrorShown.current = true;
        setNotice({ kind: 'alert', text: error.message });
      });
    return () => {
      ignore = true;
    };
  }, [cadence, version, refreshes]);

  const refresh = useCallback(() => setRefreshes((value) => value + 1), []);

  // Picks up changes made elsewhere when the page is shown again.
  useEffect(() => {
    const reloadWhenShown = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', reloadWhenShown);
    return () => document.removeEventListener('visibilitychange', reloadWhenShown);
  }, [refresh]);

  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    loadErrorShown.current = false;
    try {
      await action();
      setNotice({ kind: 'status', text: done });
      return true;
    } catch (error) {
      setNotice({ kind: 'alert', text: (error as Error).message });
      return false;
    } finally {
      // A load that failed during this change must not make the next load clear its message.
      loadErrorShown.current = false;
      // Reload after failures too: a 404 usually means the list is stale (changed elsewhere).
      setVersion((value) => value + 1);
      setBusy(false);
    }
  };

  const add = async (draftKey: string, label: string, category?: string) => {
    const name = (drafts[draftKey] ?? '').trim();
    if (!name) {
      setNotice({ kind: 'alert', text: '루틴 이름을 입력해 주세요' });
      return;
    }
    const ok = await run(
      () =>
        requestJson('/api/routines', {
          method: 'POST',
          body: { name, cadence, category },
        }),
      `${label}에 '${name}' 루틴을 추가했습니다`,
    );
    if (ok) setDrafts((current) => ({ ...current, [draftKey]: '' }));
  };

  const rename = async () => {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) {
      setNotice({ kind: 'alert', text: '루틴 이름을 입력해 주세요' });
      return;
    }
    const ok = await run(
      () => requestJson(`/api/routines/${editing.id}`, { method: 'PATCH', body: { name } }),
      `루틴 이름을 '${name}'(으)로 바꿨습니다`,
    );
    if (ok) setEditing(null);
  };

  const move = (routine: Routine, direction: 'up' | 'down') =>
    run(
      () =>
        requestJson(`/api/routines/${routine.id}/move`, { method: 'POST', body: { direction } }),
      `'${routine.name}' 루틴을 ${direction === 'up' ? '위로' : '아래로'} 옮겼습니다`,
    );

  const archive = async (routine: Routine) => {
    await run(
      () => requestJson(`/api/routines/${routine.id}/archive`, { method: 'POST' }),
      `'${routine.name}' 루틴을 보관했습니다. 지난 기록은 남아 있습니다`,
    );
    setConfirmArchive(null);
  };

  const setDraft = (draftKey: string, value: string) =>
    setDrafts((current) => ({ ...current, [draftKey]: value }));

  return {
    routines,
    version,
    loadFailed,
    refresh,
    drafts,
    editing,
    confirmArchive,
    busy,
    notice,
    add,
    rename,
    move,
    archive,
    setDraft,
    setEditing,
    setConfirmArchive,
  };
}

export type RoutineList = ReturnType<typeof useRoutineList>;
