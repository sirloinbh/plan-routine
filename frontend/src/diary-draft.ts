// Unsaved diary text kept in this browser, so leaving the page does not lose it (confirmed on issue
// #45). One draft is enough for one tab: moving to another day is blocked while text is unsaved.
// Two tabs share it, so the later one wins; the other tab then warns that its text is not kept (#64).

import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';

export type DiaryForm = {
  body: string;
  goodNote: string;
  regretNote: string;
  tomorrowNote: string;
  mood: number | null;
  energy: number | null;
};

// `base` is what the server held when the draft was written, to notice a later save elsewhere.
export type DiaryDraft = { date: string; form: DiaryForm; base: DiaryForm };

export const draftKey = 'plan-routine.diary-draft';

export const sameForm = (a: DiaryForm, b: DiaryForm) =>
  a.body === b.body &&
  a.goodNote === b.goodNote &&
  a.regretNote === b.regretNote &&
  a.tomorrowNote === b.tomorrowNote &&
  a.mood === b.mood &&
  a.energy === b.energy;

// The server trims what it stores, so a difference in surrounding spaces is not unsaved text.
export const sameText = (a: DiaryForm, b: DiaryForm) =>
  a.body.trim() === b.body.trim() &&
  a.goodNote.trim() === b.goodNote.trim() &&
  a.regretNote.trim() === b.regretNote.trim() &&
  a.tomorrowNote.trim() === b.tomorrowNote.trim() &&
  a.mood === b.mood &&
  a.energy === b.energy;

// A draft stored before the scores existed has none: that reads as no score.
const isScore = (value: unknown) =>
  value === undefined ||
  value === null ||
  (Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 5);

const isForm = (value: unknown): value is DiaryForm => {
  if (typeof value !== 'object' || value === null) return false;
  const form = value as Record<string, unknown>;
  return (
    (['body', 'goodNote', 'regretNote', 'tomorrowNote'] as const).every(
      (field) => typeof form[field] === 'string',
    ) &&
    isScore(form.mood) &&
    isScore(form.energy)
  );
};

const withScores = (form: DiaryForm): DiaryForm => ({
  ...form,
  mood: form.mood ?? null,
  energy: form.energy ?? null,
});

export function readDraft(): DiaryDraft | null {
  try {
    const stored = JSON.parse(
      localStorage.getItem(draftKey) ?? 'null',
    ) as Partial<DiaryDraft> | null;
    if (!stored || !/^\d{4}-\d{2}-\d{2}$/.test(String(stored.date))) return null;
    return isForm(stored.form) && isForm(stored.base)
      ? {
          date: stored.date as string,
          form: withScores(stored.form),
          base: withScores(stored.base),
        }
      : null;
  } catch {
    return null;
  }
}

/** False when the browser refuses, for example when its storage is full or blocked. */
export function writeDraft(draft: DiaryDraft) {
  try {
    localStorage.setItem(draftKey, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

/**
 * Leaves a draft of another day alone: a second tab may be writing it. With `sent`, also leaves
 * text written after that save began.
 */
export function clearDraft(date: string, sent?: DiaryForm) {
  try {
    const stored = readDraft();
    if (stored?.date === date && (!sent || sameForm(stored.form, sent)))
      localStorage.removeItem(draftKey);
  } catch {
    // Blocked storage holds no draft to clear.
  }
}

/**
 * Keeps the form's unsaved text as a draft while a day is open. `date` is the open day, or null
 * while none is open or one is loading (the form then still holds the previous day's text).
 */
export function useDiaryDraft({
  date,
  form,
  savedForm,
}: {
  date: string | null;
  form: DiaryForm;
  savedForm: DiaryForm;
}) {
  // False when the draft could not be kept: the browser refused it, or another tab took it.
  const [draftFailed, setDraftFailed] = useState(false);
  // What this tab last stored. Only that may be cleared: a draft may be another tab's by now.
  const lastWritten = useRef<DiaryForm | null>(null);
  // What the server held when the draft began, kept across keystrokes.
  const draftBase = useRef<DiaryForm | null>(null);

  // A loaded day starts from `draft` (restored from storage) or from nothing. Read only at load: a
  // stored draft may by now be another tab's, with a base of its own. A restored draft is this
  // tab's now, even if storing it again is refused.
  const adopt = useCallback((draft: DiaryDraft | null) => {
    draftBase.current = draft?.base ?? null;
    lastWritten.current = draft?.form ?? null;
  }, []);

  // Stores the text, keeping the first base, or a save made elsewhere would be forgotten on the
  // next visit.
  const store = useEffectEvent((day: string) => {
    const base = draftBase.current ?? savedForm;
    draftBase.current = base;
    const written = writeDraft({ date: day, form, base });
    if (written) lastWritten.current = form;
    setDraftFailed(!written);
  });

  useEffect(() => {
    if (date === null) return;
    if (!sameText(form, savedForm)) {
      store(date);
      return;
    }
    if (lastWritten.current) clearDraft(date, lastWritten.current);
    lastWritten.current = null;
    draftBase.current = null;
    setDraftFailed(false);
  }, [date, form, savedForm]);

  // Another tab shares the one draft. If it took the draft, this tab's text is no longer kept, so
  // say so until the next keystroke takes it back. If it cleared the draft, put this tab's back.
  useEffect(() => {
    if (date === null || sameText(form, savedForm)) return;
    const othersChanged = (event: StorageEvent) => {
      // A null key is the whole storage being cleared.
      if (event.key !== null && event.key !== draftKey) return;
      if (event.newValue !== null) {
        // This event can be older than this tab's own write, when tabs write at nearly the same time.
        const stored = readDraft();
        setDraftFailed(!(stored?.date === date && sameForm(stored.form, form)));
        return;
      }
      store(date);
    };
    window.addEventListener('storage', othersChanged);
    return () => window.removeEventListener('storage', othersChanged);
  }, [date, form, savedForm]);

  // A draft survives closing the tab. Only when it could not be kept does leaving need a warning.
  const leavingLosesText = draftFailed && !sameForm(form, savedForm);
  useEffect(() => {
    if (!leavingLosesText) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [leavingLosesText]);

  return { draftFailed, adopt };
}
