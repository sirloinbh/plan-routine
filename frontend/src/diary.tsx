import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { Button } from './components/ui/button';
import { Card, CardContent } from './components/ui/card';
import { Notice } from './components/ui/notice';
import {
  clearDraft,
  type DiaryForm,
  readDraft,
  sameForm,
  sameText,
  writeDraft,
} from './diary-draft';
import { isFocusFree, useDateHeading } from './focus-moves';
import { LabeledTextarea } from './labeled-textarea';
import { RequestError, requestJson } from './lib/api';
import { useNotice } from './lib/use-notice';

type DiaryEntry = {
  date: string;
  body: string;
  goodNote: string | null;
  regretNote: string | null;
  tomorrowNote: string | null;
};

type DiaryData = {
  date: string;
  today: string;
  previousDate: string | null;
  nextDate: string | null;
  progress: { checked: number; total: number };
  entry: DiaryEntry | null;
};

const formFrom = (entry: DiaryEntry | null): DiaryForm => ({
  body: entry?.body ?? '',
  goodNote: entry?.goodNote ?? '',
  regretNote: entry?.regretNote ?? '',
  tomorrowNote: entry?.tomorrowNote ?? '',
});

export function Diary() {
  // null follows the server's today. A draft reopens its own day, which may be an earlier one.
  const [date, setDate] = useState<string | null>(() => readDraft()?.date ?? null);
  const [version, setVersion] = useState(0);
  const [data, setData] = useState<DiaryData | null>(null);
  const [form, setForm] = useState<DiaryForm>(formFrom(null));
  const [savedForm, setSavedForm] = useState<DiaryForm>(formFrom(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // A notice appears beside what it is about: the save button or the date buttons.
  const [noticeAtSave, setNoticeAtSave] = useState(false);
  const openedForDraft = useRef(date !== null);
  const [draftFailed, setDraftFailed] = useState(false);
  const [bodyInvalid, setBodyInvalid] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const saveButton = useRef<HTMLButtonElement>(null);
  const discardButton = useRef<HTMLButtonElement>(null);
  const confirmDiscardButton = useRef<HTMLButtonElement>(null);
  const { notice, status, error, clear } = useNotice();
  const { heading, expectMove } = useDateHeading(data?.date);

  useEffect(() => {
    // A newer load supersedes this one, so a slow older response cannot overwrite it.
    let ignore = false;
    requestJson<DiaryData>(`/api/diary${date ? `?date=${date}` : ''}`)
      .then((loaded) => {
        if (ignore) return;
        const server = formFrom(loaded.entry);
        const stored = readDraft();
        const draft =
          stored?.date === loaded.date && !sameText(stored.form, server) ? stored : null;
        // The day was opened for a draft with nothing left to restore, so today is what was wanted.
        const nothingToRestore = openedForDraft.current && !draft && date !== null;
        openedForDraft.current = false;
        if (nothingToRestore) {
          clearDraft(date);
          setDate(null);
          return;
        }
        setData(loaded);
        setForm(draft?.form ?? server);
        setSavedForm(server);
        setLoading(false);
        if (draft)
          status(
            sameForm(draft.base, server)
              ? '저장하지 않은 글을 불러왔습니다. 저장해야 기록에 남습니다'
              : '저장하지 않은 글을 불러왔습니다. 그 사이 저장된 내용이 달라졌으니 확인한 뒤 저장해 주세요',
          );
      })
      .catch((cause: unknown) => {
        if (ignore) return;
        // A day the server refuses can never open, so its draft must not keep sending the user there.
        if (
          cause instanceof RequestError &&
          cause.status === 400 &&
          date &&
          readDraft()?.date === date
        ) {
          clearDraft(date);
          setDate(null);
          error(`${date}은 열 수 없는 날짜라 그날의 임시 글을 지웠습니다`);
          return;
        }
        setLoading(false);
        error(cause);
      });
    return () => {
      ignore = true;
    };
  }, [date, version, error, status]);

  const dirty = !sameForm(form, savedForm);

  // While a day is loading, the form still holds the previous day's text.
  useEffect(() => {
    if (!data || loading) return;
    if (!sameText(form, savedForm)) {
      // The draft keeps its first base, or a save made elsewhere would be forgotten on the next visit.
      const kept = readDraft();
      const base = kept?.date === data.date ? kept.base : savedForm;
      setDraftFailed(!writeDraft({ date: data.date, form, base }));
      return;
    }
    clearDraft(data.date);
    setDraftFailed(false);
  }, [data, loading, form, savedForm]);

  // A draft survives closing the tab. Only when it could not be kept does leaving need a warning.
  const leavingLosesText = dirty && draftFailed;
  useEffect(() => {
    if (!leavingLosesText) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [leavingLosesText]);

  const setField = (field: keyof DiaryForm) => (value: string) => {
    setConfirmingDiscard(false);
    if (field === 'body') setBodyInvalid(false);
    setForm((current) => ({ ...current, [field]: value }));
  };

  // Also bumps the version so pressing the same button again retries a failed load.
  const moveTo = (target: string | null) => {
    if (saving) return;
    setNoticeAtSave(false);
    if (dirty) {
      error('저장하지 않은 내용이 있습니다. 저장하거나 버린 뒤 날짜를 옮겨 주세요');
      return;
    }
    clear();
    setBodyInvalid(false);
    expectMove();
    setLoading(true);
    setDate(target);
    setVersion((value) => value + 1);
  };

  const save = async (target: string) => {
    if (saving || loading) return;
    const origin = document.activeElement;
    setSaving(true);
    setBodyInvalid(false);
    setConfirmingDiscard(false);
    setNoticeAtSave(true);
    clear();
    try {
      const { entry } = await requestJson<{ entry: DiaryEntry }>(`/api/diary/${target}`, {
        method: 'PUT',
        body: form,
      });
      // Here as well as in the effect: the user may have left the page while this was saving.
      clearDraft(target, form);
      setForm(formFrom(entry));
      setSavedForm(formFrom(entry));
      status(`${target} 일기를 저장했습니다`);
    } catch (cause) {
      error(cause);
      // What the server refuses is the body when it is empty or too long, so take the user there.
      const body = form.body.trim();
      if (cause instanceof RequestError && cause.status === 400 && (!body || body.length > 5000)) {
        setBodyInvalid(true);
        if (isFocusFree(origin)) document.getElementById('diary-body')?.focus();
      }
    } finally {
      setSaving(false);
    }
  };

  // The pressed button disappears each time, so focus moves by hand once the new one is drawn.
  const askDiscard = (asking: boolean) => {
    flushSync(() => setConfirmingDiscard(asking));
    (asking ? confirmDiscardButton : discardButton).current?.focus();
  };

  const discard = () => {
    flushSync(() => {
      setForm(savedForm);
      setBodyInvalid(false);
      setConfirmingDiscard(false);
      setNoticeAtSave(true);
      status('저장하지 않은 내용을 버렸습니다');
    });
    saveButton.current?.focus();
  };

  if (!data)
    return loading ? (
      <p role="status" className="text-body-sm text-muted-foreground">
        일기를 불러오는 중…
      </p>
    ) : (
      <div className="flex flex-col items-start gap-3">
        <Notice notice={notice} />
        <Button type="button" variant="outline" size="sm" onClick={() => moveTo(date)}>
          다시 시도
        </Button>
      </div>
    );

  const isToday = data.date === data.today;
  const readOnly = loading || saving;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 ref={heading} tabIndex={-1} className="scroll-mt-20 text-body font-semibold">
            {isToday ? `오늘 (${data.date})` : data.date}
          </h2>
          {data.progress.total > 0 && (
            <p className="text-body-sm text-muted-foreground">
              하루 루틴 {data.progress.checked}/{data.progress.total} 완료
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!data.previousDate}
            onClick={() => data.previousDate && moveTo(data.previousDate)}
          >
            이전 날
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!data.nextDate}
            onClick={() =>
              data.nextDate && moveTo(data.nextDate === data.today ? null : data.nextDate)
            }
          >
            다음 날
          </Button>
          {!isToday && (
            <Button type="button" variant="ghost" size="sm" onClick={() => moveTo(null)}>
              오늘로
            </Button>
          )}
        </div>
      </div>
      {!noticeAtSave && <Notice notice={notice} />}
      <Card>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            aria-label={`${data.date} 일기`}
            onSubmit={(event) => {
              event.preventDefault();
              void save(data.date);
            }}
          >
            <LabeledTextarea
              id="diary-body"
              label="하루 돌아보기"
              value={form.body}
              rows={8}
              limit={5000}
              readOnly={readOnly}
              invalid={bodyInvalid}
              onChange={setField('body')}
            />
            <LabeledTextarea
              id="diary-good"
              label="잘한 점 (선택)"
              value={form.goodNote}
              rows={2}
              limit={1000}
              readOnly={readOnly}
              onChange={setField('goodNote')}
            />
            <LabeledTextarea
              id="diary-regret"
              label="아쉬운 점 (선택)"
              value={form.regretNote}
              rows={2}
              limit={1000}
              readOnly={readOnly}
              onChange={setField('regretNote')}
            />
            <LabeledTextarea
              id="diary-tomorrow"
              label="내일 할 일 (선택)"
              value={form.tomorrowNote}
              rows={2}
              limit={1000}
              readOnly={readOnly}
              onChange={setField('tomorrowNote')}
            />
            {noticeAtSave && <Notice notice={notice} />}
            <div className="flex flex-wrap items-center gap-3">
              <Button ref={saveButton} type="submit">
                저장
              </Button>
              {dirty && (
                <span className="text-body-sm text-muted-foreground">
                  {draftFailed
                    ? '저장하지 않은 내용이 있습니다. 이 브라우저에 임시 저장하지 못해, 떠나면 사라집니다'
                    : '저장하지 않은 내용이 있습니다'}
                </span>
              )}
              {dirty &&
                !readOnly &&
                (confirmingDiscard ? (
                  <>
                    <Button
                      ref={confirmDiscardButton}
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={discard}
                    >
                      버리기 확인
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => askDiscard(false)}
                    >
                      취소
                    </Button>
                  </>
                ) : (
                  <Button
                    ref={discardButton}
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => askDiscard(true)}
                  >
                    버리기
                  </Button>
                ))}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
