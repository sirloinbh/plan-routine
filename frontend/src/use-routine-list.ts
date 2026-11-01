import { useCallback, useEffect, useRef, useState } from 'react';

import { requestJson } from './api';
import { useFocusRequest } from './focus-moves';
import type { ProjectLink } from './project-links';
import type { Routine } from './routines';

export type RoutineNotice = { kind: 'status' | 'alert'; text: string } | null;

/** Which control to focus: the first of these that exists and is enabled. */
const focusKeys = {
  up: (id: string) => `up-${id}`,
  down: (id: string) => `down-${id}`,
  edit: (id: string) => `edit-${id}`,
  renameInput: 'rename-input',
  add: (draftKey: string) => `add-${draftKey}`,
};

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
  const [projects, setProjects] = useState<ProjectLink[]>([]);
  const loadErrorShown = useRef(false);
  // Focus waits for the reload after a change, because moving a row also moves its buttons.
  const changesMade = useRef(0);
  const [loadedVersion, setLoadedVersion] = useState(0);
  const { beginChange, requestFocus } = useFocusRequest(
    () => !busy && loadedVersion >= changesMade.current,
  );

  useEffect(() => {
    // A newer reload supersedes this one, so a slow older response cannot overwrite it.
    let ignore = false;
    requestJson<{ routines: Routine[] }>(`/api/routines?cadence=${cadence}`)
      .then((data) => {
        if (ignore) return;
        setRoutines(data.routines);
        setLoadedVersion(version);
        setLoadFailed(false);
        // Only a load's own error: the message of a failed change must survive the reload after it.
        if (loadErrorShown.current) setNotice(null);
        loadErrorShown.current = false;
      })
      .catch((error: Error) => {
        if (ignore) return;
        setRoutines((current) => current ?? []);
        setLoadedVersion(version);
        setLoadFailed(true);
        loadErrorShown.current = true;
        setNotice({ kind: 'alert', text: error.message });
      });
    return () => {
      ignore = true;
    };
  }, [cadence, version, refreshes]);

  // Only offers a choice, so without it a routine simply has nothing to link to.
  useEffect(() => {
    let ignore = false;
    requestJson<{ projects?: ProjectLink[] }>('/api/project-links')
      .then((data) => {
        if (!ignore) setProjects(data.projects ?? []);
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, []);

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
    beginChange();
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
      changesMade.current += 1;
      setVersion(changesMade.current);
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
    requestFocus([focusKeys.add(draftKey)]);
    if (ok) setDrafts((current) => ({ ...current, [draftKey]: '' }));
  };

  const rename = async (draftKey: string) => {
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
    // A failure keeps the form, unless the routine has gone or the edit was cancelled meanwhile.
    requestFocus([
      ...(ok ? [] : [focusKeys.renameInput]),
      focusKeys.edit(editing.id),
      focusKeys.add(draftKey),
    ]);
    if (ok) setEditing(null);
  };

  const cancelEditing = () => {
    beginChange();
    if (editing) requestFocus([focusKeys.edit(editing.id)]);
    setEditing(null);
  };

  const move = async (routine: Routine, direction: 'up' | 'down', draftKey: string) => {
    await run(
      () =>
        requestJson(`/api/routines/${routine.id}/move`, { method: 'POST', body: { direction } }),
      `'${routine.name}' 루틴을 ${direction === 'up' ? '위로' : '아래로'} 옮겼습니다`,
    );
    // The same button again, or the other one once the row has reached the end of its group.
    const [same, other] =
      direction === 'up'
        ? [focusKeys.up(routine.id), focusKeys.down(routine.id)]
        : [focusKeys.down(routine.id), focusKeys.up(routine.id)];
    requestFocus([same, other, focusKeys.edit(routine.id), focusKeys.add(draftKey)]);
  };

  // `neighbours` are the next places to land, because the routine's own row is about to go.
  const archive = async (routine: Routine, neighbours: string[], draftKey: string) => {
    const ok = await run(
      () => requestJson(`/api/routines/${routine.id}/archive`, { method: 'POST' }),
      `'${routine.name}' 루틴을 보관했습니다. 지난 기록은 남아 있습니다`,
    );
    // If it failed the row is still there, so stay on it.
    requestFocus([
      ...(ok ? [] : [focusKeys.edit(routine.id)]),
      ...neighbours.map(focusKeys.edit),
      focusKeys.add(draftKey),
    ]);
    setConfirmArchive(null);
  };

  const setDraft = (draftKey: string, value: string) =>
    setDrafts((current) => ({ ...current, [draftKey]: value }));

  const setProjectLink = async (routine: Routine, projectLinkId: string | null) => {
    if (busy) return;
    await run(
      () =>
        requestJson(`/api/routines/${routine.id}/project-link`, {
          method: 'PUT',
          body: { projectLinkId },
        }),
      projectLinkId
        ? `'${routine.name}' 루틴에 프로젝트를 연결했습니다`
        : `'${routine.name}' 루틴의 연결을 해제했습니다`,
    );
  };

  return {
    routines,
    projects,
    setProjectLink,
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
    cancelEditing,
    setConfirmArchive,
  };
}

export type RoutineList = ReturnType<typeof useRoutineList>;
