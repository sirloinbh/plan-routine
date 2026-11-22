import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { Button } from './components/ui/button';
import { Card, CardContent } from './components/ui/card';
import { Notice } from './components/ui/notice';
import { Spinner } from './components/ui/spinner';
import {
  clearDraft,
  type DiaryForm,
  readDraft,
  sameForm,
  sameText,
  useDiaryDraft,
} from './diary-draft';
import { diaryLimits } from './diary-limits';
import { isFocusFree, useDateHeading } from './focus-moves';
import { dateHeading, formatDate } from './format-date';
import { LabeledTextarea } from './labeled-textarea';
import { RequestError } from './lib/api';
import { apiKey, useApiMutation, useApiQuery } from './lib/query';
import { useNotice } from './lib/use-notice';
import { LoadingRegion } from './loading-region';
import { RetryButton } from './retry-button';

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

// The textarea of each form field, to focus the one a 400 names.
const fieldIds: Record<keyof DiaryForm, string> = {
  body: 'diary-body',
  goodNote: 'diary-good',
  regretNote: 'diary-regret',
  tomorrowNote: 'diary-tomorrow',
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
  const [data, setData] = useState<DiaryData | null>(null);
  const [form, setForm] = useState<DiaryForm>(formFrom(null));
  const [savedForm, setSavedForm] = useState<DiaryForm>(formFrom(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // A notice appears beside what it is about: the save button or the date buttons.
  const [noticeAtSave, setNoticeAtSave] = useState(false);
  const openedForDraft = useRef(date !== null);
  // When the load being waited for began. Only an answer from then on is the one to show, not a
  // cached or older one.
  const loadStartedAt = useRef(Date.now());
  // The field the server refused in the last save, named in its 400 answer.
  const [invalidField, setInvalidField] = useState<keyof DiaryForm | null>(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const saveButton = useRef<HTMLButtonElement>(null);
  const discardButton = useRef<HTMLButtonElement>(null);
  const confirmDiscardButton = useRef<HTMLButtonElement>(null);
  const { notice, status, error, clear } = useNotice();
  const { heading, expectMove } = useDateHeading(data?.date);
  // While a day is loading, the form still holds the previous day's text.
  const { draftFailed, adopt } = useDiaryDraft({
    date: data && !loading ? data.date : null,
    form,
    savedForm,
  });

  // The working copy of the form is seeded from a load, never from a later background refresh,
  // which would overwrite what is being typed. Always asked for fresh when a day opens.
  const diaryQuery = useApiQuery<DiaryData>(
    apiKey('/api/diary', date ?? 'today'),
    `/api/diary${date ? `?date=${date}` : ''}`,
    { staleTime: 0 },
  );
  const { data: loaded, dataUpdatedAt, error: loadError, errorUpdatedAt } = diaryQuery;
  const settled = !diaryQuery.isFetching;

  useEffect(() => {
    if (!loading || !settled) return;
    if (loadError && errorUpdatedAt >= loadStartedAt.current) {
      // A day the server refuses can never open, so its draft must not keep sending the user there.
      if (loadError.status === 400 && date && readDraft()?.date === date) {
        clearDraft(date);
        loadStartedAt.current = Date.now();
        setDate(null);
        error(`${formatDate(date)} cannot be opened, so its draft was discarded`);
        return;
      }
      setLoading(false);
      error(loadError);
      return;
    }
    if (!loaded || dataUpdatedAt < loadStartedAt.current) return;
    const server = formFrom(loaded.entry);
    const stored = readDraft();
    const draft = stored?.date === loaded.date && !sameText(stored.form, server) ? stored : null;
    // The day was opened for a draft with nothing left to restore, so today is what was wanted.
    const nothingToRestore = openedForDraft.current && !draft && date !== null;
    openedForDraft.current = false;
    if (nothingToRestore) {
      clearDraft(date);
      loadStartedAt.current = Date.now();
      setDate(null);
      return;
    }
    // A draft saying what is already saved has nothing left to keep.
    if (stored?.date === loaded.date && !draft) clearDraft(loaded.date);
    adopt(draft);
    setData(loaded);
    setForm(draft?.form ?? server);
    setSavedForm(server);
    setLoading(false);
    if (draft)
      status(
        sameForm(draft.base, server)
          ? 'Restored an unsaved draft. Save it to keep it in your records'
          : 'Restored an unsaved draft. The saved entry changed in the meantime, so check it before saving',
      );
  }, [
    loading,
    settled,
    loaded,
    dataUpdatedAt,
    loadError,
    errorUpdatedAt,
    date,
    error,
    status,
    adopt,
  ]);

  const write = useApiMutation<{ entry: DiaryEntry }, { target: string; body: DiaryForm }>(
    ({ target, body }) => ({ path: `/api/diary/${target}`, method: 'PUT', body }),
  );

  const dirty = !sameForm(form, savedForm);

  const setField = (field: keyof DiaryForm) => (value: string) => {
    setConfirmingDiscard(false);
    setInvalidField((current) => (current === field ? null : current));
    setForm((current) => ({ ...current, [field]: value }));
  };

  // Pressing the same date button again loads that day again, which retries a failed load.
  const moveTo = (target: string | null) => {
    if (saving) return;
    setNoticeAtSave(false);
    if (dirty) {
      error('You have unsaved changes. Save or discard them before changing the date');
      return;
    }
    clear();
    setInvalidField(null);
    expectMove();
    loadStartedAt.current = Date.now();
    setLoading(true);
    setDate(target);
    if (target === date) void diaryQuery.refetch();
  };

  const save = async (target: string) => {
    if (saving || loading) return;
    const origin = document.activeElement;
    setSaving(true);
    setInvalidField(null);
    setConfirmingDiscard(false);
    setNoticeAtSave(true);
    clear();
    try {
      const { entry } = await write.mutateAsync({ target, body: form });
      // Here as well as in the effect: the user may have left the page while this was saving.
      clearDraft(target, form);
      setForm(formFrom(entry));
      setSavedForm(formFrom(entry));
      status(`Saved the diary entry for ${formatDate(target)}`);
    } catch (cause) {
      error(cause);
      // Take the user to the field the 400 names. Without one, the message alone says what is wrong.
      const named =
        cause instanceof RequestError && cause.status === 400
          ? cause.fields.map(({ path }) => path).find((path) => Object.hasOwn(fieldIds, path))
          : undefined;
      if (named) {
        const field = named as keyof DiaryForm;
        // Drawn first, so the field is read out as editable and invalid when focus reaches it.
        const free = isFocusFree(origin);
        flushSync(() => {
          setSaving(false);
          setInvalidField(field);
        });
        if (free) document.getElementById(fieldIds[field])?.focus();
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
      setInvalidField(null);
      setConfirmingDiscard(false);
      setNoticeAtSave(true);
      status('Discarded the unsaved changes');
    });
    saveButton.current?.focus();
  };

  if (!data)
    return loading ? (
      <LoadingRegion label="Loading diary" shape="card" />
    ) : (
      <div className="flex flex-col items-start gap-3">
        <Notice notice={notice} />
        <RetryButton onClick={() => moveTo(date)}>Try again</RetryButton>
      </div>
    );

  const isToday = data.date === data.today;
  const readOnly = loading || saving;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            ref={heading}
            tabIndex={-1}
            className="scroll-mt-[calc(env(safe-area-inset-top)+5rem)] text-body font-semibold"
          >
            {dateHeading(data.date, data.today)}
          </h2>
          {data.progress.total > 0 && (
            <p className="text-body-sm text-muted-foreground">
              Daily routines {data.progress.checked}/{data.progress.total} done
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
            Previous day
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
            Next day
          </Button>
          {!isToday && (
            <Button type="button" variant="ghost" size="sm" onClick={() => moveTo(null)}>
              Go to today
            </Button>
          )}
        </div>
      </div>
      {!noticeAtSave && <Notice notice={notice} />}
      <Card>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            aria-label={`Diary for ${formatDate(data.date)}`}
            onSubmit={(event) => {
              event.preventDefault();
              void save(data.date);
            }}
          >
            <LabeledTextarea
              id="diary-body"
              label="Looking back on the day"
              value={form.body}
              rows={8}
              limit={diaryLimits.body}
              readOnly={readOnly}
              invalid={invalidField === 'body'}
              onChange={setField('body')}
            />
            <LabeledTextarea
              id="diary-good"
              label="What went well (optional)"
              value={form.goodNote}
              rows={2}
              limit={diaryLimits.note}
              readOnly={readOnly}
              invalid={invalidField === 'goodNote'}
              onChange={setField('goodNote')}
            />
            <LabeledTextarea
              id="diary-regret"
              label="What could be better (optional)"
              value={form.regretNote}
              rows={2}
              limit={diaryLimits.note}
              readOnly={readOnly}
              invalid={invalidField === 'regretNote'}
              onChange={setField('regretNote')}
            />
            <LabeledTextarea
              id="diary-tomorrow"
              label="To do tomorrow (optional)"
              value={form.tomorrowNote}
              rows={2}
              limit={diaryLimits.note}
              readOnly={readOnly}
              invalid={invalidField === 'tomorrowNote'}
              onChange={setField('tomorrowNote')}
            />
            {noticeAtSave && <Notice notice={notice} />}
            <div className="flex flex-wrap items-center gap-3">
              <Button ref={saveButton} type="submit">
                {saving && <Spinner size="sm" label="Saving" />}
                Save
              </Button>
              {dirty && (
                <span className="text-body-sm text-muted-foreground">
                  {draftFailed
                    ? 'You have unsaved changes. They are not saved as a draft, so leaving will lose them'
                    : 'You have unsaved changes'}
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
                      Confirm discard
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => askDiscard(false)}
                    >
                      Cancel
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
                    Discard
                  </Button>
                ))}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
