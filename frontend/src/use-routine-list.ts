import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';

import { useFocusRequest } from './focus-moves';
import { requestJson } from './lib/api';
import { apiKey, useApiQuery } from './lib/query';
import { errorText } from './lib/use-notice';
import type { ProjectLink } from './project-links';
import type { Routine } from './routines';
import { useReloadWhenShown } from './use-date-change';

// What the add form can set besides the name: weekdays, times per week (#245), unit and target amount (#246).
export type Schedule = {
  weekdays: number[];
  timesPerWeek: number | null;
  unit: string;
  target: string;
};
export const noSchedule: Schedule = { weekdays: [], timesPerWeek: null, unit: '', target: '' };

export type RoutineNotice = { kind: 'status' | 'alert'; text: string } | null;

/** Which control to focus: the first of these that exists and is enabled. */
const focusKeys = {
  up: (id: number) => `up-${id}`,
  down: (id: number) => `down-${id}`,
  edit: (id: number) => `edit-${id}`,
  renameInput: 'rename-input',
  add: (draftKey: string) => `add-${draftKey}`,
};

// Loads one cadence's routines and changes them. All state lives here (not in child components)
// so per-item editing survives re-renders. After every change made here the lists and checklists
// on the page load again; `refresh` only loads this list again.
export function useRoutineList(cadence: string) {
  const client = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // The schedule chosen in each add form (#245): weekdays of a daily routine, times per week of a weekly one.
  const [schedules, setSchedules] = useState<Record<string, Schedule>>({});
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  // Which button started the change: busy disables them all, only this one shows it is working.
  const [pending, setPending] = useState<string | null>(null);
  // The message of a change made here. A failed load shows its own message when there is none.
  const [changeNotice, setNotice] = useState<RoutineNotice>(null);
  // Focus waits for the reload after a change, because moving a row also moves its buttons.
  const changesMade = useRef(0);
  const [loadedVersion, setLoadedVersion] = useState(0);
  const { beginChange, requestFocus } = useFocusRequest(
    () => !busy && loadedVersion >= changesMade.current,
  );

  const routinesKey = apiKey('/api/routines', cadence);
  const routinesQuery = useApiQuery<{ routines: Routine[] }>(
    routinesKey,
    `/api/routines?cadence=${cadence}`,
    { staleTime: 0 },
  );
  // Only offers a choice, so without it a routine simply has nothing to link to. Every list on a page
  // shares this one load, and a failed load is said so rather than looking like "no projects".
  const projectsQuery = useApiQuery<{ projects?: ProjectLink[] }>(
    apiKey('/api/project-links'),
    '/api/project-links',
  );
  const routines = routinesQuery.data?.routines ?? (routinesQuery.isError ? [] : null);
  const projects = projectsQuery.data?.projects ?? [];
  const loadFailed = routinesQuery.isError;
  const loadNotice: RoutineNotice = routinesQuery.error
    ? { kind: 'alert', text: errorText(routinesQuery.error) }
    : projectsQuery.error
      ? {
          kind: 'alert',
          text: `Could not load the projects a routine can link to. ${errorText(projectsQuery.error)}`,
        }
      : null;
  const notice = changeNotice ?? loadNotice;

  const { refetch: refetchRoutines } = routinesQuery;
  const { refetch: refetchProjects } = projectsQuery;
  const refresh = useCallback(() => {
    void refetchRoutines();
    void refetchProjects();
  }, [refetchRoutines, refetchProjects]);
  // Picks up changes made elsewhere when the page is shown again.
  useReloadWhenShown(refresh);

  const run = async (
    action: () => Promise<unknown>,
    done: string,
    started: string | null = null,
  ) => {
    setBusy(true);
    setPending(started);
    beginChange();
    setNotice(null);
    try {
      await action();
      setNotice({ kind: 'status', text: done });
      return true;
    } catch (error) {
      setNotice({ kind: 'alert', text: (error as Error).message });
      return false;
    } finally {
      // Reload after failures too: a 404 usually means the list is stale (changed elsewhere). The
      // checklist of this cadence on the same page changes with the routines.
      changesMade.current += 1;
      const change = changesMade.current;
      setBusy(false);
      setPending(null);
      void Promise.all([
        client.invalidateQueries({ queryKey: routinesKey }),
        client.invalidateQueries({ queryKey: apiKey('/api/project-links') }),
        client.invalidateQueries({ queryKey: apiKey('/api/checklist') }),
      ]).then(() => setLoadedVersion(change));
    }
  };

  const add = async (draftKey: string, addedTo: string, category?: string) => {
    const name = (drafts[draftKey] ?? '').trim();
    const schedule = schedules[draftKey] ?? noSchedule;
    if (!name) {
      setNotice({ kind: 'alert', text: 'Enter a routine name' });
      return;
    }
    const ok = await run(
      () =>
        requestJson('/api/routines', {
          method: 'POST',
          body: {
            name,
            cadence,
            category,
            ...(schedule.weekdays.length > 0 ? { weekdays: schedule.weekdays } : {}),
            ...(schedule.timesPerWeek ? { timesPerWeek: schedule.timesPerWeek } : {}),
            ...(schedule.unit.trim() ? { unit: schedule.unit.trim() } : {}),
            ...(schedule.unit.trim() && Number(schedule.target) > 0
              ? { targetAmount: Number(schedule.target) }
              : {}),
          },
        }),
      `Added the routine '${name}' to ${addedTo}`,
      `add:${draftKey}`,
    );
    requestFocus([focusKeys.add(draftKey)]);
    if (ok) {
      setDrafts((current) => ({ ...current, [draftKey]: '' }));
      setSchedules((current) => ({ ...current, [draftKey]: noSchedule }));
    }
  };

  const rename = async (draftKey: string) => {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) {
      setNotice({ kind: 'alert', text: 'Enter a routine name' });
      return;
    }
    const ok = await run(
      () => requestJson(`/api/routines/${editing.id}`, { method: 'PATCH', body: { name } }),
      `Renamed the routine to '${name}'`,
      'rename',
    );
    // A failure keeps the form, unless the routine has gone or the edit was cancelled meanwhile.
    requestFocus([
      ...(ok ? [] : [focusKeys.renameInput]),
      focusKeys.edit(editing.id),
      focusKeys.add(draftKey),
    ]);
    // The routine may have gone, or another one been opened for editing, while this was saving.
    if (ok) setEditing((current) => (current?.id === editing.id ? null : current));
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
      `Moved the routine '${routine.name}' ${direction === 'up' ? 'up' : 'down'}`,
    );
    // The same button again, or the other one once the row has reached the end of its group.
    const [same, other] =
      direction === 'up'
        ? [focusKeys.up(routine.id), focusKeys.down(routine.id)]
        : [focusKeys.down(routine.id), focusKeys.up(routine.id)];
    requestFocus([same, other, focusKeys.edit(routine.id), focusKeys.add(draftKey)]);
  };

  // `neighbours` are the next places to land, because the routine's own row is about to go.
  const archive = async (routine: Routine, neighbours: number[], draftKey: string) => {
    const ok = await run(
      () => requestJson(`/api/routines/${routine.id}/archive`, { method: 'POST' }),
      `Archived the routine '${routine.name}'. Past records are kept`,
      `archive:${routine.id}`,
    );
    // If it failed the row is still there, so stay on it.
    requestFocus([
      ...(ok ? [] : [focusKeys.edit(routine.id)]),
      ...neighbours.map(focusKeys.edit),
      focusKeys.add(draftKey),
    ]);
    setConfirmArchive(null);
  };

  const setSchedule = (draftKey: string, schedule: Schedule) =>
    setSchedules((current) => ({ ...current, [draftKey]: schedule }));
  const setDraft = (draftKey: string, value: string) =>
    setDrafts((current) => ({ ...current, [draftKey]: value }));

  const setProjectLink = async (routine: Routine, projectLinkId: number | null) => {
    if (busy) return;
    await run(
      () =>
        requestJson(`/api/routines/${routine.id}/project-link`, {
          method: 'PUT',
          body: { projectLinkId },
        }),
      projectLinkId
        ? `Linked a project to the routine '${routine.name}'`
        : `Unlinked the routine '${routine.name}'`,
    );
    // Disabled while saving, which drops focus.
    requestFocus([`link-${routine.id}`, focusKeys.edit(routine.id)]);
  };

  return {
    routines,
    pending,
    projects,
    setProjectLink,
    loadFailed,
    refresh,
    drafts,
    schedules,
    setSchedule,
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
