import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Spinner } from './components/ui/spinner';
import type { Routine } from './routines';
import type { RoutineList, RoutineNotice } from './use-routine-list';

export function RoutineNotices({ notice }: { notice: RoutineNotice }) {
  return (
    <>
      {/* Live regions stay mounted so screen readers announce the first message too. */}
      <div role="status" aria-live="polite">
        {notice?.kind === 'status' && (
          <p className="text-body-sm text-muted-foreground">{notice.text}</p>
        )}
      </div>
      <div role="alert">
        {notice?.kind === 'alert' && <p className="text-body-sm text-destructive">{notice.text}</p>}
      </div>
    </>
  );
}

export function RoutineItems({
  list,
  routines,
  draftKey,
}: {
  list: RoutineList;
  routines: Routine[];
  draftKey: string;
}) {
  const { editing, confirmArchive, busy, projects } = list;
  return (
    <ol className="flex flex-col divide-y">
      {routines.map((routine, index) => (
        <li key={routine.id} className="flex flex-wrap items-center gap-2 py-2">
          {editing?.id === routine.id ? (
            <form
              className="flex w-full flex-wrap gap-2"
              aria-label={`Rename ${routine.name}`}
              onSubmit={(event) => {
                event.preventDefault();
                void list.rename(draftKey);
              }}
            >
              <Input
                className="min-w-0 flex-1"
                aria-label={`New name for ${routine.name}`}
                data-focus-key="rename-input"
                // eslint-disable-next-line jsx-a11y-x/no-autofocus -- the rename field opens on a click, so focus follows that action.
                autoFocus
                value={editing.name}
                maxLength={100}
                onChange={(event) => list.setEditing({ id: routine.id, name: event.target.value })}
              />
              <Button type="submit" disabled={busy}>
                {list.pending === 'rename' && <Spinner size="sm" label="Saving" />}
                Save
              </Button>
              <Button type="button" variant="ghost" onClick={list.cancelEditing}>
                Cancel
              </Button>
            </form>
          ) : (
            <>
              <span className="min-w-0 flex-1 basis-48 text-body break-words">{routine.name}</span>
              <span className="flex flex-wrap gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Move ${routine.name} up`}
                  data-focus-key={`up-${routine.id}`}
                  disabled={busy || index === 0}
                  onClick={() => void list.move(routine, 'up', draftKey)}
                >
                  Up
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Move ${routine.name} down`}
                  data-focus-key={`down-${routine.id}`}
                  disabled={busy || index === routines.length - 1}
                  onClick={() => void list.move(routine, 'down', draftKey)}
                >
                  Down
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Rename ${routine.name}`}
                  data-focus-key={`edit-${routine.id}`}
                  disabled={busy}
                  onClick={() => {
                    list.setConfirmArchive(null);
                    list.setEditing({ id: routine.id, name: routine.name });
                  }}
                >
                  Rename
                </Button>
                {confirmArchive === routine.id ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    aria-label={`Confirm archiving ${routine.name}`}
                    disabled={busy}
                    onClick={() =>
                      void list.archive(
                        routine,
                        [routines[index + 1], routines[index - 1]]
                          .filter(Boolean)
                          .map((neighbour) => neighbour.id),
                        draftKey,
                      )
                    }
                  >
                    {list.pending === `archive:${routine.id}` && (
                      <Spinner size="sm" label="Working" />
                    )}
                    Confirm archive
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Archive ${routine.name}`}
                    disabled={busy}
                    onClick={() => list.setConfirmArchive(routine.id)}
                  >
                    Archive
                  </Button>
                )}
              </span>
              {projects.length > 0 && (
                <label className="flex w-full min-w-0 items-center gap-2 text-body-sm text-muted-foreground">
                  Link
                  <select
                    className="h-9 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-body-sm dark:bg-input/30 pointer-coarse:min-h-11 [&>option]:bg-popover [&>option]:text-popover-foreground"
                    aria-label={`Project to link to ${routine.name}`}
                    data-focus-key={`link-${routine.id}`}
                    disabled={busy}
                    value={routine.projectLinkId ?? ''}
                    onChange={(event) =>
                      void list.setProjectLink(routine, event.target.value || null)
                    }
                  >
                    <option value="">None</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
        </li>
      ))}
    </ol>
  );
}

export function RoutineAddForm({
  list,
  draftKey,
  label,
  category,
  placeholder = 'New routine name',
}: {
  list: RoutineList;
  draftKey: string;
  label: string;
  category?: string;
  placeholder?: string;
}) {
  return (
    <form
      className="flex gap-2"
      aria-label={`Add a ${label} routine`}
      onSubmit={(event) => {
        event.preventDefault();
        void list.add(draftKey, label, category);
      }}
    >
      <Input
        className="min-w-0 flex-1"
        aria-label={`New ${label} routine name`}
        data-focus-key={`add-${draftKey}`}
        placeholder={placeholder}
        value={list.drafts[draftKey] ?? ''}
        maxLength={100}
        onChange={(event) => list.setDraft(draftKey, event.target.value)}
      />
      <Button type="submit" disabled={list.busy}>
        {list.pending === `add:${draftKey}` && <Spinner size="sm" label="Saving" />}
        Add
      </Button>
    </form>
  );
}
