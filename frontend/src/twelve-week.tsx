import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useEffectEvent, useRef, useState } from 'react';

import { LoadingRegion, RetryButton } from './components/load-state/load-state';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Input } from './components/ui/input';
import { Notice } from './components/ui/notice';
import { Spinner } from './components/ui/spinner';
import { useFocusRequest } from './focus-moves';
import { GoalRoutineLinks, type LinkedRoutine } from './goal-routine-links';
import { LabeledTextarea } from './labeled-textarea';
import { formatDate } from './lib/format';
import { apiKey, type ApiRequest, useApiMutation, useApiQuery } from './lib/query';
import { errorText, type NoticeValue, useNotice } from './lib/use-notice';
import { PeriodRoutines } from './period-routines';
import { useReloadWhenCurrent } from './use-date-change';

type Goal = {
  id: number;
  title: string;
  achieved: boolean | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  // Current period only.
  routines?: LinkedRoutine[];
};
type GoalPeriod = { period: { start: string; end: string }; goals: Goal[] };
type GoalsData = {
  today: string;
  remainingWeeks: number;
  current: GoalPeriod;
  past: GoalPeriod[];
};
type ReviewDraft = { achieved: boolean | null; note: string };

const answers: { value: boolean | null; label: string }[] = [
  { value: true, label: 'Achieved' },
  { value: false, label: 'Not achieved' },
  { value: null, label: 'Undecided' },
];

// A review is complete once a goal is marked Achieved or Not achieved, or has a note.
const reviewMessages = {
  saved: 'Saved the review',
  incomplete:
    'Saved. The review is complete once you choose Achieved or Not achieved, or add a note',
};

const goalsPath = '/api/goals';

// One write to the goals API. The screen loads the list again itself afterwards, so nothing is
// invalidated here.
const useGoalsWrite = <T = unknown,>() => useApiMutation<T, ApiRequest>((request) => request);

const needsReview = ({ goals }: GoalPeriod) => goals.some((goal) => !goal.reviewedAt);

const focusKeys = {
  period: (start: string) => `period-${start}`,
  edit: (id: number) => `goal-edit-${id}`,
  remove: (id: number) => `goal-remove-${id}`,
  renameInput: 'goal-rename-input',
  add: 'add-goal',
};

function PastPeriod({
  past,
  movedNotice,
  onSaving,
  onSaved,
}: {
  past: GoalPeriod;
  // A card that changed lists mounted anew, so its message comes from above.
  movedNotice: NoticeValue | undefined;
  onSaving: () => void;
  onSaved: (goals: Goal[]) => void;
}) {
  // Only what was edited; the rest shows what the server has, so a reload loses no typing.
  const [drafts, setDrafts] = useState<Record<number, ReviewDraft>>({});
  const [saving, setSaving] = useState(false);
  const write = useGoalsWrite<{ goals: Goal[] }>();
  const { notice, status, error, clear } = useNotice();
  const draftOf = (goal: Goal): ReviewDraft =>
    drafts[goal.id] ?? { achieved: goal.achieved, note: goal.reviewNote ?? '' };
  // Ignored while saving rather than disabled, which keeps keyboard focus on the radio.
  const edit = (goal: Goal, change: Partial<ReviewDraft>) => {
    if (saving) return;
    setDrafts((current) => ({ ...current, [goal.id]: { ...draftOf(goal), ...change } }));
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    clear();
    onSaving();
    const reviews = past.goals.map((goal) => {
      const { achieved, note } = draftOf(goal);
      return { id: goal.id, achieved, note };
    });
    try {
      const { goals } = await write.mutateAsync({
        path: `${goalsPath}/reviews`,
        method: 'PUT',
        body: { reviews },
      });
      setDrafts({});
      const answered = reviews.some(({ achieved, note }) => achieved !== null || note.trim());
      status(answered ? reviewMessages.saved : reviewMessages.incomplete);
      // The saved answers show at once, even if the reload that follows fails.
      onSaved(goals);
    } catch (cause) {
      // The typing stays in the drafts, ready to save again.
      error(cause);
    } finally {
      setSaving(false);
    }
  };

  const label = `${formatDate(past.period.start)} – ${formatDate(past.period.end)}`;
  return (
    <Card role="region" aria-label={`Review for ${label}`}>
      <CardHeader>
        <CardTitle
          asHeading="h2"
          tabIndex={-1}
          data-focus-key={focusKeys.period(past.period.start)}
          // Keeps the focused heading clear of the fixed bar at the top of the page.
          className="flex scroll-mt-[calc(env(safe-area-inset-top)+5rem)] flex-wrap items-center gap-2"
        >
          {label}
          {needsReview(past) && <Badge variant="secondary">Review needed</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Notice notice={movedNotice} />
        <form
          className="flex flex-col gap-4"
          aria-label={`Save the review for ${label}`}
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          {past.goals.map((goal) => {
            const draft = draftOf(goal);
            return (
              <fieldset key={goal.id} className="flex min-w-0 flex-col gap-3 border-t pt-3">
                <legend className="max-w-full text-body font-medium wrap-anywhere">
                  {goal.title}
                </legend>
                <div className="flex flex-wrap gap-4">
                  {answers.map((answer) => (
                    <label key={answer.label} className="flex items-center gap-2 text-body-sm">
                      <input
                        type="radio"
                        name={`achieved-${goal.id}`}
                        checked={draft.achieved === answer.value}
                        onChange={() => edit(goal, { achieved: answer.value })}
                      />
                      {answer.label}
                    </label>
                  ))}
                </div>
                <LabeledTextarea
                  id={`review-${goal.id}`}
                  label="Note"
                  value={draft.note}
                  rows={2}
                  limit={1000}
                  readOnly={saving}
                  onChange={(note) => edit(goal, { note })}
                />
              </fieldset>
            );
          })}
          <Notice notice={notice} />
          <Button type="submit" className="self-start">
            {saving && <Spinner size="sm" label="Saving" />}
            Save review
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function CurrentGoals({
  data,
  reload,
  onLinked,
}: {
  data: GoalsData;
  reload: () => void;
  onLinked: (goalId: number, routines: LinkedRoutine[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: number; title: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  // Which button started the change: busy disables them all, only this one shows it is working.
  const [pending, setPending] = useState<string | null>(null);
  const { notice, status, error, clear } = useNotice();
  const { goals } = data.current;
  const write = useGoalsWrite();
  const { beginChange, requestFocus } = useFocusRequest(() => !busy);
  // Link panels left open, whose ticks go with the goal if it disappears.
  const openPanels = useRef(new Map<number, string>());

  // Reports what became of a goal's edit or link ticks when the goal is gone. Its own change of
  // identity must not re-run the effect, so the effect depends on the data it reacts to only.
  const reportVanished = useEffectEvent((lostEdit: string | null) => {
    const gone: string[] = [];
    for (const [id, title] of openPanels.current) {
      const found = goals.find((goal) => goal.id === id);
      if (found) {
        openPanels.current.set(id, found.title);
        continue;
      }
      openPanels.current.delete(id);
      gone.push(`'${title}'`);
    }
    // One notice holds one message, so what was lost is said together.
    const messages = [
      lostEdit,
      gone.length > 0
        ? `Could not save routine links because ${gone.join(', ')} ${gone.length === 1 ? 'is' : 'are'} no longer in this period's goals`
        : null,
    ].filter((message) => message !== null);
    if (messages.length > 0) error(messages.join('. '));
    if (lostEdit !== null || gone.length > 0) requestFocus([focusKeys.add]);
  });

  // The period moved on, or a goal was removed elsewhere: say what became of its edit and ticks.
  useEffect(() => {
    const lost = editing && !goals.some((goal) => goal.id === editing.id);
    if (lost) setEditing(null);
    reportVanished(
      lost
        ? `Could not save the edit to '${editing.title}'. It is not a goal of this period`
        : null,
    );
  }, [goals, editing]);

  // Reloads after failures too: a 404 usually means the list changed elsewhere, and a past-goal
  // refusal means the period has moved on.
  const run = async (action: () => Promise<unknown>, done: string, started: string) => {
    setBusy(true);
    setPending(started);
    beginChange();
    clear();
    try {
      await action();
      status(done);
      return true;
    } catch (cause) {
      error(cause);
      return false;
    } finally {
      setBusy(false);
      setPending(null);
      reload();
    }
  };

  const add = async () => {
    const title = draft.trim();
    if (!title) {
      error('Enter a goal');
      beginChange();
      requestFocus([focusKeys.add]);
      return;
    }
    const ok = await run(
      () => write.mutateAsync({ path: goalsPath, method: 'POST', body: { title } }),
      `Added the goal '${title}'`,
      'add',
    );
    requestFocus([focusKeys.add]);
    // Anything typed while this was saving is the next goal; keep it.
    if (ok) setDraft((current) => (current.trim() === title ? '' : current));
  };

  const rename = async () => {
    if (!editing) return;
    const title = editing.title.trim();
    if (!title) {
      error('Enter a goal');
      beginChange();
      requestFocus([focusKeys.renameInput]);
      return;
    }
    const ok = await run(
      () =>
        write.mutateAsync({ path: `${goalsPath}/${editing.id}`, method: 'PATCH', body: { title } }),
      `Changed the goal to '${title}'`,
      'rename',
    );
    if (ok) setEditing(null);
    requestFocus([
      ...(ok ? [] : [focusKeys.renameInput]),
      focusKeys.edit(editing.id),
      focusKeys.add,
    ]);
  };

  const cancelEditing = (id: number) => {
    beginChange();
    requestFocus([focusKeys.edit(id)]);
    setEditing(null);
  };

  const remove = async (goal: Goal) => {
    const index = goals.indexOf(goal);
    // The next goal, then the previous one. If this fails the row is still there, so stay on it.
    const neighbours = [goals[index + 1], goals[index - 1]].filter(Boolean);
    const ok = await run(
      () =>
        write.mutateAsync({ path: `${goalsPath}/${goal.id}`, method: 'DELETE' }).then(() =>
          // Removed on purpose, so its open panel is nothing to report once the list reloads.
          openPanels.current.delete(goal.id),
        ),
      `Deleted the goal '${goal.title}'`,
      `remove:${goal.id}`,
    );
    setConfirmDelete(null);
    requestFocus([
      ...(ok ? [] : [focusKeys.remove(goal.id)]),
      ...neighbours.map((neighbour) => focusKeys.edit(neighbour.id)),
      focusKeys.add,
    ]);
  };

  return (
    <Card role="region" aria-label="Goals for these 12 weeks">
      <CardHeader>
        <CardTitle asHeading="h2" className="flex items-center gap-2">
          Goals for these 12 weeks
          <Badge variant="secondary">{goals.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-body-sm text-muted-foreground">
          {formatDate(data.current.period.start)} – {formatDate(data.current.period.end)} ·{' '}
          {data.remainingWeeks} {data.remainingWeeks === 1 ? 'week' : 'weeks'} left
        </p>
        <Notice notice={notice} className="wrap-anywhere" />
        {goals.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">No goals yet</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {goals.map((goal) => (
              <li key={goal.id} className="flex flex-wrap items-center gap-2 py-2">
                {editing?.id === goal.id ? (
                  <form
                    className="flex w-full flex-wrap gap-2"
                    aria-label={`Rename ${goal.title}`}
                    onSubmit={(event) => {
                      event.preventDefault();
                      void rename();
                    }}
                  >
                    <Input
                      className="min-w-0 flex-1"
                      aria-label={`New name for ${goal.title}`}
                      data-focus-key={focusKeys.renameInput}
                      // eslint-disable-next-line jsx-a11y-x/no-autofocus -- the field opens on a click, so focus follows that action.
                      autoFocus
                      value={editing.title}
                      maxLength={200}
                      onChange={(event) => setEditing({ id: goal.id, title: event.target.value })}
                    />
                    <Button type="submit" disabled={busy}>
                      {pending === 'rename' && <Spinner size="sm" label="Saving" />}
                      Save
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => cancelEditing(goal.id)}>
                      Cancel
                    </Button>
                  </form>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 basis-48 text-body break-words">
                      {goal.title}
                    </span>
                    <span className="flex flex-wrap gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Rename ${goal.title}`}
                        data-focus-key={focusKeys.edit(goal.id)}
                        disabled={busy}
                        onClick={() => {
                          setConfirmDelete(null);
                          setEditing({ id: goal.id, title: goal.title });
                        }}
                      >
                        Rename
                      </Button>
                      {confirmDelete === goal.id ? (
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          aria-label={`Confirm deleting ${goal.title}`}
                          disabled={busy}
                          onClick={() => void remove(goal)}
                        >
                          {pending === `remove:${goal.id}` && <Spinner size="sm" label="Working" />}
                          Confirm delete
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Delete ${goal.title}`}
                          data-focus-key={focusKeys.remove(goal.id)}
                          disabled={busy}
                          onClick={() => setConfirmDelete(goal.id)}
                        >
                          Delete
                        </Button>
                      )}
                    </span>
                  </>
                )}
                <GoalRoutineLinks
                  goal={goal}
                  disabled={busy}
                  onBegin={clear}
                  onSaved={(message, routines) => {
                    status(message);
                    // Shows at once, even if the reload that follows fails.
                    onLinked(goal.id, routines);
                    reload();
                  }}
                  onOpenChange={(open) => {
                    if (open) openPanels.current.set(goal.id, goal.title);
                    else openPanels.current.delete(goal.id);
                  }}
                  onFailed={(cause) => {
                    error(cause);
                    reload();
                  }}
                />
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex gap-2"
          aria-label="Add a new goal"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <Input
            className="min-w-0 flex-1"
            aria-label="New goal"
            data-focus-key={focusKeys.add}
            placeholder="What to achieve in these 12 weeks"
            value={draft}
            maxLength={200}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button type="submit" disabled={busy}>
            {pending === 'add' && <Spinner size="sm" label="Saving" />}
            Add
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function TwelveWeek() {
  const queryClient = useQueryClient();
  // Always asked for again when the screen opens: a new period turns this period's goals into
  // goals to review.
  const goalsQuery = useApiQuery<GoalsData>(apiKey(goalsPath), goalsPath, { staleTime: 0 });
  const data = goalsQuery.data ?? null;
  const loadFailed = goalsQuery.isError;
  const notice = goalsQuery.error
    ? { kind: 'error' as const, text: errorText(goalsQuery.error) }
    : undefined;
  // Kept here: a finished review's card moves down the page and mounts anew.
  const reviewNotice = useNotice();
  const [movedCard, setMovedCard] = useState<string | null>(null);
  const { beginChange, requestFocus } = useFocusRequest(() => true);
  useReloadWhenCurrent(goalsQuery, goalsPath);
  const reload = () => void goalsQuery.refetch();
  const patchData = (change: (current: GoalsData) => GoalsData) =>
    queryClient.setQueryData<GoalsData>(apiKey(goalsPath), (current) => current && change(current));

  const reviewSaved = (past: GoalPeriod, saved: Goal[]) => {
    const savedById = new Map(saved.map((goal) => [goal.id, goal]));
    patchData((current) => ({
      ...current,
      past: current.past.map((entry) => ({
        ...entry,
        goals: entry.goals.map((goal) => savedById.get(goal.id) ?? goal),
      })),
    }));
    // A card that changes lists mounts anew: its message and keyboard focus go with it from here.
    const stillOpen = saved.some((goal) => !goal.reviewedAt);
    if (needsReview(past) !== stillOpen) {
      reviewNotice.status(stillOpen ? reviewMessages.incomplete : reviewMessages.saved);
      setMovedCard(past.period.start);
      requestFocus([focusKeys.period(past.period.start)]);
    }
    reload();
  };
  const routinesLinked = (goalId: number, routines: LinkedRoutine[]) =>
    patchData((current) => ({
      ...current,
      current: {
        ...current.current,
        goals: current.current.goals.map((goal) =>
          goal.id === goalId ? { ...goal, routines } : goal,
        ),
      },
    }));
  const pastCard = (past: GoalPeriod) => (
    <PastPeriod
      key={past.period.start}
      past={past}
      movedNotice={movedCard === past.period.start ? reviewNotice.notice : undefined}
      onSaving={() => {
        beginChange();
        reviewNotice.clear();
      }}
      onSaved={(saved) => reviewSaved(past, saved)}
    />
  );
  const toReview = data?.past.filter(needsReview) ?? [];
  const reviewed = data?.past.filter((past) => !needsReview(past)) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Notice notice={notice} />
      {loadFailed && (
        <RetryButton className="self-start" onRetry={reload}>
          Reload goals
        </RetryButton>
      )}
      {!data && !loadFailed && <LoadingRegion label="Loading goals" shape="card" />}
      {toReview.length > 0 && (
        <p className="text-body font-semibold">Review the goals of past periods and set new ones</p>
      )}
      {toReview.map(pastCard)}
      {data && <CurrentGoals data={data} reload={reload} onLinked={routinesLinked} />}
      <PeriodRoutines
        cadence="twelve_week"
        name="12-week"
        periodName="This period"
        examples="e.g. Reset goals"
        emptyHint="Add something to do once every 12 weeks below."
      />
      {reviewed.map(pastCard)}
    </div>
  );
}
