import { useCallback, useEffect, useRef, useState } from 'react';

import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Input } from './components/ui/input';
import { Notice } from './components/ui/notice';
import { Spinner } from './components/ui/spinner';
import { useFocusRequest } from './focus-moves';
import { GoalRoutineLinks, type LinkedRoutine } from './goal-routine-links';
import { LabeledTextarea } from './labeled-textarea';
import { requestJson } from './lib/api';
import { type NoticeValue, useNotice } from './lib/use-notice';
import { LoadingRegion } from './loading-region';
import { PeriodRoutines } from './period-routines';
import { serviceDate } from './service-date';
import { isPassingFailure, useReloadOnDateChange } from './use-date-change';

type Goal = {
  id: string;
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
  { value: true, label: '달성' },
  { value: false, label: '미달성' },
  { value: null, label: '미정' },
];

const needsReview = ({ goals }: GoalPeriod) => goals.some((goal) => !goal.reviewedAt);

const focusKeys = {
  period: (start: string) => `period-${start}`,
  edit: (id: string) => `goal-edit-${id}`,
  remove: (id: string) => `goal-remove-${id}`,
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
  const [drafts, setDrafts] = useState<Record<string, ReviewDraft>>({});
  const [saving, setSaving] = useState(false);
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
      const { goals } = await requestJson<{ goals: Goal[] }>('/api/goals/reviews', {
        method: 'PUT',
        body: { reviews },
      });
      setDrafts({});
      const answered = reviews.some(({ achieved, note }) => achieved !== null || note.trim());
      status(
        answered
          ? '회고를 저장했습니다'
          : '저장했습니다. 달성 여부나 메모를 남기면 회고가 끝납니다',
      );
      // The saved answers show at once, even if the reload that follows fails.
      onSaved(goals);
    } catch (cause) {
      // The typing stays in the drafts, ready to save again.
      error(cause);
    } finally {
      setSaving(false);
    }
  };

  const label = `${past.period.start} ~ ${past.period.end}`;
  return (
    <Card role="region" aria-label={`${label} 회고`}>
      <CardHeader>
        <CardTitle
          asHeading="h2"
          tabIndex={-1}
          data-focus-key={focusKeys.period(past.period.start)}
          // Keeps the focused heading clear of the fixed bar at the top of the page.
          className="flex scroll-mt-[calc(env(safe-area-inset-top)+5rem)] flex-wrap items-center gap-2"
        >
          {label}
          {needsReview(past) && <Badge variant="secondary">회고 필요</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Notice notice={movedNotice} />
        <form
          className="flex flex-col gap-4"
          aria-label={`${label} 회고 저장`}
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
                  label="메모"
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
            {saving && <Spinner size="sm" label="저장하는 중" />}
            회고 저장
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
  onLinked: (goalId: string, routines: LinkedRoutine[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { notice, status, error, clear } = useNotice();
  const { goals } = data.current;
  const { beginChange, requestFocus } = useFocusRequest(() => !busy);

  // The goal being edited has gone: the period moved on, or it was removed elsewhere.
  if (editing && !goals.some((goal) => goal.id === editing.id)) {
    setEditing(null);
    requestFocus([focusKeys.add]);
    error(`'${editing.title}' 수정을 저장하지 못했습니다. 이번 기간의 목표가 아닙니다`);
  }

  // Reloads after failures too: a 404 usually means the list changed elsewhere, and a past-goal
  // refusal means the period has moved on.
  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
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
      reload();
    }
  };

  const add = async () => {
    const title = draft.trim();
    if (!title) {
      error('목표를 입력해 주세요');
      beginChange();
      requestFocus([focusKeys.add]);
      return;
    }
    const ok = await run(
      () => requestJson('/api/goals', { method: 'POST', body: { title } }),
      `'${title}' 목표를 추가했습니다`,
    );
    requestFocus([focusKeys.add]);
    // Anything typed while this was saving is the next goal; keep it.
    if (ok) setDraft((current) => (current.trim() === title ? '' : current));
  };

  const rename = async () => {
    if (!editing) return;
    const title = editing.title.trim();
    if (!title) {
      error('목표를 입력해 주세요');
      beginChange();
      requestFocus([focusKeys.renameInput]);
      return;
    }
    const ok = await run(
      () => requestJson(`/api/goals/${editing.id}`, { method: 'PATCH', body: { title } }),
      `목표를 '${title}'(으)로 바꿨습니다`,
    );
    if (ok) setEditing(null);
    requestFocus([
      ...(ok ? [] : [focusKeys.renameInput]),
      focusKeys.edit(editing.id),
      focusKeys.add,
    ]);
  };

  const cancelEditing = (id: string) => {
    beginChange();
    requestFocus([focusKeys.edit(id)]);
    setEditing(null);
  };

  const remove = async (goal: Goal) => {
    const index = goals.indexOf(goal);
    // The next goal, then the previous one. If this fails the row is still there, so stay on it.
    const neighbours = [goals[index + 1], goals[index - 1]].filter(Boolean);
    const ok = await run(
      () => requestJson(`/api/goals/${goal.id}`, { method: 'DELETE' }),
      `'${goal.title}' 목표를 지웠습니다`,
    );
    setConfirmDelete(null);
    requestFocus([
      ...(ok ? [] : [focusKeys.remove(goal.id)]),
      ...neighbours.map((neighbour) => focusKeys.edit(neighbour.id)),
      focusKeys.add,
    ]);
  };

  return (
    <Card role="region" aria-label="이번 12주 목표">
      <CardHeader>
        <CardTitle asHeading="h2" className="flex items-center gap-2">
          이번 12주 목표
          <Badge variant="secondary">{goals.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-body-sm text-muted-foreground">
          {data.current.period.start} ~ {data.current.period.end} · {data.remainingWeeks}주
          남았습니다
        </p>
        <Notice notice={notice} className="wrap-anywhere" />
        {goals.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">아직 목표가 없습니다</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {goals.map((goal) => (
              <li key={goal.id} className="flex flex-wrap items-center gap-2 py-2">
                {editing?.id === goal.id ? (
                  <form
                    className="flex w-full flex-wrap gap-2"
                    aria-label={`${goal.title} 수정`}
                    onSubmit={(event) => {
                      event.preventDefault();
                      void rename();
                    }}
                  >
                    <Input
                      className="min-w-0 flex-1"
                      aria-label={`${goal.title} 새 이름`}
                      data-focus-key={focusKeys.renameInput}
                      // eslint-disable-next-line jsx-a11y-x/no-autofocus -- the field opens on a click, so focus follows that action.
                      autoFocus
                      value={editing.title}
                      maxLength={200}
                      onChange={(event) => setEditing({ id: goal.id, title: event.target.value })}
                    />
                    <Button type="submit" disabled={busy}>
                      {busy && <Spinner size="sm" label="저장하는 중" />}
                      저장
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => cancelEditing(goal.id)}>
                      취소
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
                        aria-label={`${goal.title} 수정`}
                        data-focus-key={focusKeys.edit(goal.id)}
                        disabled={busy}
                        onClick={() => {
                          setConfirmDelete(null);
                          setEditing({ id: goal.id, title: goal.title });
                        }}
                      >
                        수정
                      </Button>
                      {confirmDelete === goal.id ? (
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          aria-label={`${goal.title} 삭제 확인`}
                          disabled={busy}
                          onClick={() => void remove(goal)}
                        >
                          {busy && <Spinner size="sm" label="처리하는 중" />}
                          삭제 확인
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`${goal.title} 삭제`}
                          data-focus-key={focusKeys.remove(goal.id)}
                          disabled={busy}
                          onClick={() => setConfirmDelete(goal.id)}
                        >
                          삭제
                        </Button>
                      )}
                    </span>
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
                      onFailed={(cause) => {
                        error(cause);
                        reload();
                      }}
                    />
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex gap-2"
          aria-label="새 목표 추가"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <Input
            className="min-w-0 flex-1"
            aria-label="새 목표"
            data-focus-key={focusKeys.add}
            placeholder="이번 12주에 이룰 일"
            value={draft}
            maxLength={200}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button type="submit" disabled={busy}>
            {busy && <Spinner size="sm" label="저장하는 중" />}
            추가
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function TwelveWeek() {
  const [version, setVersion] = useState(0);
  const [data, setData] = useState<GoalsData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const { notice, error, clear } = useNotice();
  // Kept here: a finished review's card moves down the page and mounts anew.
  const reviewNotice = useNotice();
  const [movedCard, setMovedCard] = useState<string | null>(null);
  const { beginChange, requestFocus } = useFocusRequest(() => true);
  const requestedOn = useRef('');

  useEffect(() => {
    // A newer load supersedes this one, so a slow older response cannot overwrite it.
    let ignore = false;
    const startedOn = serviceDate();
    requestedOn.current = startedOn;
    requestJson<GoalsData>('/api/goals')
      .then((loaded) => {
        if (ignore) return;
        setData(loaded);
        setLoadFailed(false);
        clear();
        // The server is not on this device's date yet (a fast clock), so ask again at the next check.
        if (loaded.today !== startedOn) requestedOn.current = '';
      })
      .catch((cause: unknown) => {
        if (ignore) return;
        setLoadFailed(true);
        error(cause);
        if (isPassingFailure(cause)) requestedOn.current = '';
      });
    return () => {
      ignore = true;
    };
  }, [version, error, clear]);

  // A new period turns this period's goals into goals to review.
  useEffect(() => {
    const reloadWhenShown = () => {
      if (document.visibilityState === 'visible') setVersion((value) => value + 1);
    };
    document.addEventListener('visibilitychange', reloadWhenShown);
    return () => document.removeEventListener('visibilitychange', reloadWhenShown);
  }, []);

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  useReloadOnDateChange(requestedOn, reload);

  const reviewSaved = (past: GoalPeriod, saved: Goal[]) => {
    const savedById = new Map(saved.map((goal) => [goal.id, goal]));
    setData(
      (current) =>
        current && {
          ...current,
          past: current.past.map((entry) => ({
            ...entry,
            goals: entry.goals.map((goal) => savedById.get(goal.id) ?? goal),
          })),
        },
    );
    // A card that changes lists mounts anew: its message and keyboard focus go with it from here.
    const stillOpen = saved.some((goal) => !goal.reviewedAt);
    if (needsReview(past) !== stillOpen) {
      reviewNotice.status(
        stillOpen
          ? '저장했습니다. 달성 여부나 메모를 남기면 회고가 끝납니다'
          : '회고를 저장했습니다',
      );
      setMovedCard(past.period.start);
      requestFocus([focusKeys.period(past.period.start)]);
    }
    reload();
  };
  const routinesLinked = (goalId: string, routines: LinkedRoutine[]) =>
    setData(
      (current) =>
        current && {
          ...current,
          current: {
            ...current.current,
            goals: current.current.goals.map((goal) =>
              goal.id === goalId ? { ...goal, routines } : goal,
            ),
          },
        },
    );
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
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={reload}>
          목표 다시 불러오기
        </Button>
      )}
      {!data && !loadFailed && <LoadingRegion label="목표 불러오는 중" />}
      {toReview.length > 0 && (
        <p className="text-body font-semibold">지난 기간의 목표를 돌아보고 새 목표를 세워 보세요</p>
      )}
      {toReview.map(pastCard)}
      {data && <CurrentGoals data={data} reload={reload} onLinked={routinesLinked} />}
      <PeriodRoutines
        cadence="twelve_week"
        name="12주"
        periodName="이번 기간"
        examples="예: 목표 재설정"
        emptyHint="아래에서 12주에 한 번 할 일을 추가해 주세요."
      />
      {reviewed.map(pastCard)}
    </div>
  );
}
