// Unsaved diary text kept in this browser, so leaving the page does not lose it (confirmed on issue
// #45). One draft is enough: moving to another day is blocked while text is unsaved.

export type DiaryForm = {
  body: string;
  goodNote: string;
  regretNote: string;
  tomorrowNote: string;
};

// `base` is what the server held when the draft was written, to notice a later save elsewhere.
export type DiaryDraft = { date: string; form: DiaryForm; base: DiaryForm };

const draftKey = 'plan-routine.diary-draft';

export const sameForm = (a: DiaryForm, b: DiaryForm) =>
  a.body === b.body &&
  a.goodNote === b.goodNote &&
  a.regretNote === b.regretNote &&
  a.tomorrowNote === b.tomorrowNote;

const isForm = (value: unknown): value is DiaryForm => {
  if (typeof value !== 'object' || value === null) return false;
  const form = value as Record<string, unknown>;
  return (['body', 'goodNote', 'regretNote', 'tomorrowNote'] as const).every(
    (field) => typeof form[field] === 'string',
  );
};

export function readDraft(): DiaryDraft | null {
  try {
    const stored = JSON.parse(
      localStorage.getItem(draftKey) ?? 'null',
    ) as Partial<DiaryDraft> | null;
    if (!stored || !/^\d{4}-\d{2}-\d{2}$/.test(String(stored.date))) return null;
    return isForm(stored.form) && isForm(stored.base) ? (stored as DiaryDraft) : null;
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

/** Leaves a draft of another day alone: a second tab may be writing it. */
export function clearDraft(date: string) {
  try {
    if (readDraft()?.date === date) localStorage.removeItem(draftKey);
  } catch {
    // Blocked storage holds no draft to clear.
  }
}
