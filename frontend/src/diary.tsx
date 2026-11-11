import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { Button } from './components/ui/button';
import { Card, CardContent } from './components/ui/card';
import { Notice } from './components/ui/notice';
import { Spinner } from './components/ui/spinner';
import {
  clearDraft,
  type DiaryForm,
  draftKey,
  readDraft,
  sameForm,
  sameText,
  writeDraft,
} from './diary-draft';
import { isFocusFree, useDateHeading } from './focus-moves';
import { dateHeading, formatDate } from './format-date';
import { LabeledTextarea } from './labeled-textarea';
import { RequestError, requestJson } from './lib/api';
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
  // What this tab last stored. Only that may be cleared: a draft may be another tab's by now.
  const lastWritten = useRef<DiaryForm | null>(null);
  const draftBase = useRef<DiaryForm | null>(null);
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
        // A draft saying what is already saved has nothing left to keep.
        if (stored?.date === loaded.date && !draft) clearDraft(loaded.date);
        // Read only here: a stored draft may by now be another tab's, with a base of its own.
        draftBase.current = draft?.base ?? null;
        // A restored draft is this tab's now, even if storing it again is refused.
        lastWritten.current = draft?.form ?? null;
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
          error(`${formatDate(date)} cannot be opened, so its draft was discarded`);
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
      const base = draftBase.current ?? savedForm;
      draftBase.current = base;
      const written = writeDraft({ date: data.date, form, base });
      if (written) lastWritten.current = form;
      setDraftFailed(!written);
      return;
    }
    if (lastWritten.current) clearDraft(data.date, lastWritten.current);
    lastWritten.current = null;
    draftBase.current = null;
    setDraftFailed(false);
  }, [data, loading, form, savedForm]);

  // Another tab shares the one draft. If it took the draft, this tab's text is no longer kept, so
  // say so until the next keystroke takes it back. If it cleared the draft, put this tab's back.
  useEffect(() => {
    if (!data || loading || sameText(form, savedForm)) return;
    const othersChanged = (event: StorageEvent) => {
      // A null key is the whole storage being cleared.
      if (event.key !== null && event.key !== draftKey) return;
      if (event.newValue !== null) {
        // This event can be older than this tab's own write, when tabs write at nearly the same time.
        const stored = readDraft();
        setDraftFailed(!(stored?.date === data.date && sameForm(stored.form, form)));
        return;
      }
      const base = draftBase.current ?? savedForm;
      const written = writeDraft({ date: data.date, form, base });
      if (written) lastWritten.current = form;
      setDraftFailed(!written);
    };
    window.addEventListener('storage', othersChanged);
    return () => window.removeEventListener('storage', othersChanged);
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
      error('You have unsaved changes. Save or discard them before changing the date');
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
      status(`Saved the diary entry for ${formatDate(target)}`);
    } catch (cause) {
      error(cause);
      // What the server refuses is the body when it is empty or too long, so take the user there.
      const body = form.body.trim();
      if (cause instanceof RequestError && cause.status === 400 && (!body || body.length > 5000)) {
        // Drawn first, so the field is read out as editable and invalid when focus reaches it.
        const free = isFocusFree(origin);
        flushSync(() => {
          setSaving(false);
          setBodyInvalid(true);
        });
        if (free) document.getElementById('diary-body')?.focus();
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
              limit={5000}
              readOnly={readOnly}
              invalid={bodyInvalid}
              onChange={setField('body')}
            />
            <LabeledTextarea
              id="diary-good"
              label="What went well (optional)"
              value={form.goodNote}
              rows={2}
              limit={1000}
              readOnly={readOnly}
              onChange={setField('goodNote')}
            />
            <LabeledTextarea
              id="diary-regret"
              label="What could be better (optional)"
              value={form.regretNote}
              rows={2}
              limit={1000}
              readOnly={readOnly}
              onChange={setField('regretNote')}
            />
            <LabeledTextarea
              id="diary-tomorrow"
              label="To do tomorrow (optional)"
              value={form.tomorrowNote}
              rows={2}
              limit={1000}
              readOnly={readOnly}
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
