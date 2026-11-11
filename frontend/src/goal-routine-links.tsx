import { useRef, useState } from 'react';

import { Button } from './components/ui/button';
import { Checkbox } from './components/ui/checkbox';
import { Label } from './components/ui/label';
import { Spinner } from './components/ui/spinner';
import { useFocusRequest } from './focus-moves';
import { requestJson } from './lib/api';
import { LoadingRegion } from './loading-region';
import type { Routine } from './routines';

export type LinkedRoutine = { id: string; name: string };

const groups = [
  { cadence: 'daily', label: 'Daily routines' },
  { cadence: 'weekly', label: 'Weekly routines' },
];

// Shows and changes which daily and weekly routines serve a goal of the current period.
export function GoalRoutineLinks({
  goal,
  disabled,
  onBegin,
  onSaved,
  onFailed,
  onOpenChange,
}: {
  goal: { id: string; title: string; routines?: LinkedRoutine[] };
  disabled: boolean;
  onBegin: () => void;
  onSaved: (message: string, routines: LinkedRoutine[]) => void;
  onFailed: (cause: unknown) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  // A slow list must not reopen a panel the user has closed since.
  const opening = useRef(0);
  const { beginChange, requestFocus } = useFocusRequest(() => !saving);
  const linked = goal.routines ?? [];
  const keys = {
    toggle: `goal-links-${goal.id}`,
    first: `goal-links-first-${goal.id}`,
    save: `goal-links-save-${goal.id}`,
  };

  const close = () => {
    opening.current += 1;
    requestFocus([keys.toggle]);
    setOpen(false);
    onOpenChange(false);
  };

  // A routine archived elsewhere has no box here, so it could never be unticked: drop it.
  const loadOptions = async () => {
    const data = await requestJson<{ routines: Routine[] }>('/api/routines');
    const options = data.routines.filter(({ cadence }) =>
      groups.some((group) => group.cadence === cadence),
    );
    setRoutines(options);
    setSelected((current) => current.filter((id) => options.some((option) => option.id === id)));
  };

  const start = async () => {
    const attempt = ++opening.current;
    beginChange();
    onBegin();
    setSelected(linked.map((routine) => routine.id));
    setRoutines(null);
    setOpen(true);
    onOpenChange(true);
    try {
      await loadOptions();
      if (attempt !== opening.current) return;
      requestFocus([keys.first, keys.save]);
    } catch (cause) {
      if (attempt !== opening.current) return;
      onFailed(cause);
      close();
    }
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    beginChange();
    onBegin();
    try {
      const saved = await requestJson<{ routines: LinkedRoutine[] }>(
        `/api/goals/${goal.id}/routines`,
        {
          method: 'PUT',
          body: { routineIds: selected },
        },
      );
      onSaved(
        selected.length > 0
          ? `Linked ${selected.length} ${selected.length === 1 ? 'routine' : 'routines'} to the goal '${goal.title}'`
          : `Unlinked all routines from the goal '${goal.title}'`,
        saved.routines,
      );
      setOpen(false);
      onOpenChange(false);
      requestFocus([keys.toggle]);
    } catch (cause) {
      // What was ticked stays, ready to save again, less any routine that can no longer be linked.
      onFailed(cause);
      await loadOptions().catch(() => {});
      requestFocus([keys.save]);
    } finally {
      setSaving(false);
    }
  };

  const toggle = (id: string, checked: boolean) => {
    if (saving) return;
    setSelected((current) =>
      checked ? [...current, id] : current.filter((value) => value !== id),
    );
  };

  const firstId = routines?.find((routine) =>
    groups.some((group) => group.cadence === routine.cadence),
  )?.id;

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 basis-48 text-body-sm wrap-anywhere text-muted-foreground">
          {linked.length > 0
            ? `Linked routines: ${linked.map((routine) => routine.name).join(', ')}`
            : 'No linked routines'}
        </p>
        {!open && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Link routines to ${goal.title}`}
            data-focus-key={keys.toggle}
            disabled={disabled}
            onClick={() => void start()}
          >
            Link routines
          </Button>
        )}
      </div>
      {open && (
        <form
          className="flex flex-col gap-3 rounded-md border p-3"
          aria-label={`Link routines to ${goal.title}`}
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          {routines === null ? (
            <LoadingRegion label="Loading routines" rows={2} />
          ) : routines.length === 0 ? (
            <p className="text-body-sm text-muted-foreground">
              There are no daily or weekly routines to link. Add a routine first.
            </p>
          ) : (
            groups.map(({ cadence, label }) => {
              const items = routines.filter((routine) => routine.cadence === cadence);
              if (items.length === 0) return null;
              return (
                <fieldset key={cadence} className="flex min-w-0 flex-col gap-2">
                  <legend className="text-body-sm font-medium">{label}</legend>
                  {items.map((routine) => {
                    const id = `goal-${goal.id}-routine-${routine.id}`;
                    return (
                      <div key={routine.id} className="flex min-h-11 items-center gap-2">
                        <Checkbox
                          id={id}
                          data-focus-key={routine.id === firstId ? keys.first : undefined}
                          checked={selected.includes(routine.id)}
                          onCheckedChange={(checked) => toggle(routine.id, checked === true)}
                        />
                        <Label
                          htmlFor={id}
                          className="min-w-0 leading-normal font-normal wrap-anywhere"
                        >
                          {routine.name}
                        </Label>
                      </div>
                    );
                  })}
                </fieldset>
              );
            })
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              size="sm"
              data-focus-key={keys.save}
              disabled={routines === null}
              aria-busy={saving || undefined}
            >
              {saving && <Spinner size="sm" label="Saving" />}
              Save links
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                // Ignored while saving, so an answer cannot arrive for a panel already gone.
                if (saving) return;
                beginChange();
                close();
              }}
            >
              Close
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
