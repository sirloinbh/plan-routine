import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { NativeSelect } from './components/ui/native-select';
import { Spinner } from './components/ui/spinner';
import { amountText, fullWeekdayNames, scheduleText, weekdayNames } from './routine-schedule';
import type { Routine } from './routines';
import { noSchedule, type RoutineList, type RoutineNotice } from './use-routine-list';

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
              <span className="min-w-0 flex-1 basis-48 text-body break-words">
                {routine.name}
                {[scheduleText(routine), amountText(routine)].filter(Boolean).length > 0 && (
                  <span className="block text-body-sm text-muted-foreground">
                    {[scheduleText(routine), amountText(routine)].filter(Boolean).join(' · ')}
                  </span>
                )}
              </span>
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
                      void list.setProjectLink(
                        routine,
                        event.target.value ? Number(event.target.value) : null,
                      )
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
  addLabel,
  addedTo,
  category,
  cadence,
  placeholder = 'New routine name',
}: {
  list: RoutineList;
  draftKey: string;
  /** The full phrase for the form, such as "Add an exercise routine". */
  addLabel: string;
  /** Where the new routine went, for the confirmation, such as "Exercise". */
  addedTo: string;
  category?: string;
  /** `weekly` adds the times-per-week choice. */
  cadence?: string;
  placeholder?: string;
}) {
  const schedule = list.schedules[draftKey] ?? noSchedule;
  const toggleDay = (day: number) =>
    list.setSchedule(draftKey, {
      ...schedule,
      weekdays: schedule.weekdays.includes(day)
        ? schedule.weekdays.filter((value) => value !== day)
        : [...schedule.weekdays, day].sort((a, b) => a - b),
    });
  return (
    <form
      className="flex flex-wrap gap-2"
      aria-label={addLabel}
      onSubmit={(event) => {
        event.preventDefault();
        void list.add(draftKey, addedTo, category);
      }}
    >
      <Input
        className="min-w-0 flex-1"
        aria-label={addLabel.replace(/^Add (an?) /, 'New ') + ' name'}
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
      {category && (
        <fieldset className="flex w-full flex-wrap items-center gap-1">
          <legend className="sr-only">{`Days of the week for the new ${addedTo} routine`}</legend>
          <span aria-hidden className="mr-1 text-body-sm text-muted-foreground">
            Days
          </span>
          {weekdayNames.map((day, index) => (
            <Button
              key={day}
              type="button"
              size="sm"
              variant={schedule.weekdays.includes(index) ? 'default' : 'outline'}
              aria-pressed={schedule.weekdays.includes(index)}
              aria-label={fullWeekdayNames[index]}
              onClick={() => toggleDay(index)}
            >
              {day}
            </Button>
          ))}
          <span className="w-full text-caption text-muted-foreground">
            {schedule.weekdays.length === 0 ? 'Every day unless you choose days' : ''}
          </span>
        </fieldset>
      )}
      <fieldset className="flex w-full flex-wrap items-center gap-2">
        <legend className="sr-only">Amount to record (optional)</legend>
        <span aria-hidden className="text-body-sm text-muted-foreground">
          Amount
        </span>
        <Input
          className="w-28"
          aria-label={`Unit for the new ${addedTo} routine (optional)`}
          placeholder="Unit, e.g. pages"
          maxLength={20}
          value={schedule.unit}
          onChange={(event) =>
            list.setSchedule(draftKey, { ...schedule, unit: event.target.value })
          }
        />
        {schedule.unit.trim() && (
          <Input
            className="w-28"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            aria-label={`Target amount for the new ${addedTo} routine (optional)`}
            placeholder="Target"
            value={schedule.target}
            onChange={(event) =>
              list.setSchedule(draftKey, { ...schedule, target: event.target.value })
            }
          />
        )}
      </fieldset>
      {cadence === 'weekly' && (
        <label className="flex w-full items-center gap-2 text-body-sm text-muted-foreground">
          How often
          <NativeSelect
            className="max-w-48"
            aria-label="Times per week for the new weekly routine"
            value={schedule.timesPerWeek ?? ''}
            onChange={(event) =>
              list.setSchedule(draftKey, {
                ...schedule,
                timesPerWeek: event.target.value ? Number(event.target.value) : null,
              })
            }
          >
            <option value="">Once a week</option>
            {[2, 3, 4, 5, 6, 7].map((count) => (
              <option key={count} value={count}>
                {count} times a week
              </option>
            ))}
          </NativeSelect>
        </label>
      )}
    </form>
  );
}
