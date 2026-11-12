import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { Diary } from './diary';
import { draftKey as storedDraftKey } from './diary-draft';
import { formatDate } from './format-date';

type Entry = {
  date: string;
  body: string;
  goodNote: string | null;
  regretNote: string | null;
  tomorrowNote: string | null;
};

const today = '2026-10-22';

// A fake diary API with state, like the server: one entry per date and an English 400 for an empty
// body. A plain object rather than a Response resolves in microtasks only, so flush() is exact.
function diaryApi(seed: Entry[] = []) {
  const entries = new Map(seed.map((entry) => [entry.date, entry]));
  const writes: { path: string; body: Record<string, string> }[] = [];
  let failNextLoad = false;
  let failNextSave = false;
  let progress = { checked: 2, total: 5 };
  let heldLoad: (() => void) | null = null;
  let holdNextLoad = false;
  let heldSave: (() => void) | null = null;
  let holdNextSave = false;
  const reply = (status: number, body: unknown) =>
    Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
  const shift = (date: string, days: number) =>
    new Date(Date.parse(`${date}T00:00:00Z`) + days * 864e5).toISOString().slice(0, 10);
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'GET') {
        if (failNextLoad) {
          failNextLoad = false;
          return reply(500, { error: 'A server error occurred' });
        }
        const date = new URL(url, 'http://localhost').searchParams.get('date') ?? today;
        if (date < '2000-01-01')
          return reply(400, {
            error: 'Diary entries can only be written for dates after the year 2000',
          });
        const response = reply(200, {
          date,
          today,
          previousDate: shift(date, -1),
          nextDate: date < today ? shift(date, 1) : null,
          progress,
          entry: entries.get(date) ?? null,
        });
        if (!holdNextLoad) return response;
        holdNextLoad = false;
        return new Promise((resolve) => {
          heldLoad = () => resolve(response);
        });
      }
      const body = JSON.parse(String(init?.body)) as Record<string, string>;
      writes.push({ path: url, body });
      if (failNextSave) {
        failNextSave = false;
        return reply(500, { error: 'A server error occurred' });
      }
      if (!body.body.trim()) {
        const refusal = reply(400, { error: 'Enter the diary entry' });
        if (!holdNextSave) return refusal;
        holdNextSave = false;
        return new Promise((resolve) => {
          heldSave = () => resolve(refusal);
        });
      }
      if (body.body.length > 5000)
        return reply(400, { error: 'The diary entry must be 5000 characters or fewer' });
      const date = url.split('/')[3];
      const entry = {
        date,
        body: body.body.trim(),
        goodNote: body.goodNote.trim() || null,
        regretNote: body.regretNote.trim() || null,
        tomorrowNote: body.tomorrowNote.trim() || null,
      };
      entries.set(date, entry);
      const response = reply(200, { entry });
      if (!holdNextSave) return response;
      holdNextSave = false;
      return new Promise((resolve) => {
        heldSave = () => resolve(response);
      });
    }),
  );
  return {
    writes,
    failNextLoad: () => (failNextLoad = true),
    failNextSave: () => (failNextSave = true),
    setProgress: (value: { checked: number; total: number }) => (progress = value),
    holdNextLoad: () => (holdNextLoad = true),
    releaseLoad: () => heldLoad?.(),
    holdNextSave: () => (holdNextSave = true),
    releaseSave: () => heldSave?.(),
  };
}

const flush = () => act(() => new Promise((resolve) => setTimeout(resolve)));
const field = (label: string) => screen.findByRole('textbox', { name: label });
const type = async (label: string, value: string) =>
  fireEvent.change(await field(label), { target: { value } });
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

const saved: Entry = {
  date: today,
  body: 'A good day',
  goodNote: 'Woke up early',
  regretNote: null,
  tomorrowNote: null,
};

test('shows today with its routine progress and an empty form', async () => {
  diaryApi();
  render(<Diary />);
  expect(await field('Looking back on the day')).toHaveValue('');
  expect(
    screen.getByRole('heading', { level: 2, name: `Today (${formatDate(today)})` }),
  ).toBeVisible();
  expect(screen.getByText('Daily routines 2/5 done')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled();
});

test('a day before any routine existed shows no routine progress', async () => {
  const api = diaryApi();
  api.setProgress({ checked: 0, total: 0 });
  render(<Diary />);
  await field('Looking back on the day');
  expect(screen.queryByText(/Daily routines .* Done/)).not.toBeInTheDocument();
});

test('saving sends every field and keeps the text after a reload', async () => {
  const api = diaryApi();
  const { unmount } = render(<Diary />);
  await type('Looking back on the day', '  A good day ');
  await type('What went well (optional)', 'Woke up early');
  expect(screen.getByText('You have unsaved changes')).toBeInTheDocument();
  press('Save');
  await flush();
  expect(api.writes).toEqual([
    {
      path: `/api/diary/${today}`,
      body: { body: '  A good day ', goodNote: 'Woke up early', regretNote: '', tomorrowNote: '' },
    },
  ]);
  expect(screen.getByRole('status')).toHaveTextContent(
    'Saved the diary entry for October 22, 2026',
  );
  // The form shows what the server stored, and nothing is left unsaved.
  expect(await field('Looking back on the day')).toHaveValue('A good day');
  expect(screen.queryByText('You have unsaved changes')).not.toBeInTheDocument();

  unmount();
  render(<Diary />);
  expect(await field('Looking back on the day')).toHaveValue('A good day');
  expect(await field('What went well (optional)')).toHaveValue('Woke up early');
});

test('saving a day that has an entry shows it first and updates it', async () => {
  const api = diaryApi([saved]);
  render(<Diary />);
  expect(await field('Looking back on the day')).toHaveValue('A good day');
  await type('Looking back on the day', 'A rewritten day');
  press('Save');
  await flush();
  expect(api.writes).toHaveLength(1);
  expect(await field('Looking back on the day')).toHaveValue('A rewritten day');
  expect(await field('What went well (optional)')).toHaveValue('Woke up early');
});

test('a rejected or failed save shows the English error and keeps the text', async () => {
  const api = diaryApi();
  render(<Diary />);
  await field('Looking back on the day');
  press('Save');
  await flush();
  expect(screen.getByRole('alert')).toHaveTextContent('Enter the diary entry');

  await type('Looking back on the day', 'Text that must stay');
  api.failNextSave();
  press('Save');
  await flush();
  expect(screen.getByRole('alert')).toHaveTextContent('A server error occurred');
  expect(await field('Looking back on the day')).toHaveValue('Text that must stay');
  expect(screen.getByText('You have unsaved changes')).toBeInTheDocument();
});

test('text over the limit is not cut: the count warns and the server rejects it', async () => {
  const api = diaryApi();
  render(<Diary />);
  const body = await field('Looking back on the day');
  expect(body).not.toHaveAttribute('maxlength');
  const tooLong = 'a'.repeat(5001);
  await type('Looking back on the day', tooLong);
  expect(screen.getByText('5001/5000')).toBeInTheDocument();
  press('Save');
  await flush();
  expect(api.writes).toHaveLength(1);
  expect(screen.getByRole('alert')).toHaveTextContent(
    'The diary entry must be 5000 characters or fewer',
  );
  expect(await field('Looking back on the day')).toHaveValue(tooLong);
});

test('a save result appears beside the save button, a blocked move beside the date buttons', async () => {
  diaryApi();
  render(<Diary />);
  const form = (await field('Looking back on the day')).closest('form')!;
  press('Save');
  await flush();
  expect(form).toContainElement(screen.getByRole('alert'));
  await type('Looking back on the day', 'Not saved yet');
  press('Previous day');
  await flush();
  expect(form).not.toContainElement(screen.getByRole('alert'));
});

test('while a day is loading the form is locked and a slow older answer is ignored', async () => {
  const api = diaryApi([saved]);
  render(<Diary />);
  await field('Looking back on the day');
  press('Previous day');
  await screen.findByRole('heading', { level: 2, name: 'October 21, 2026' });
  api.holdNextLoad();
  press('Previous day');
  await flush();
  expect(await field('Looking back on the day')).toHaveAttribute('readonly');
  press('Save');
  await flush();
  expect(api.writes).toEqual([]);

  press('Go to today');
  await flush();
  expect(await field('Looking back on the day')).not.toHaveAttribute('readonly');
  api.releaseLoad();
  await flush();
  expect(
    screen.getByRole('heading', { level: 2, name: `Today (${formatDate(today)})` }),
  ).toBeVisible();
  expect(await field('Looking back on the day')).toHaveValue('A good day');
});

test('while saving the form is locked and the date stays', async () => {
  const api = diaryApi();
  render(<Diary />);
  await type('Looking back on the day', 'Text being saved');
  api.holdNextSave();
  press('Save');
  await flush();
  expect(await field('Looking back on the day')).toHaveAttribute('readonly');
  press('Previous day');
  await flush();
  expect(
    screen.getByRole('heading', { level: 2, name: `Today (${formatDate(today)})` }),
  ).toBeVisible();
  api.releaseSave();
  await flush();
  expect(api.writes).toHaveLength(1);
  expect(await field('Looking back on the day')).toHaveValue('Text being saved');
  expect(await field('Looking back on the day')).not.toHaveAttribute('readonly');
});

test('a past day can be opened and written, and each day keeps its own entry', async () => {
  const api = diaryApi([saved]);
  render(<Diary />);
  await field('Looking back on the day');
  press('Previous day');
  expect(await screen.findByRole('heading', { level: 2, name: 'October 21, 2026' })).toBeVisible();
  expect(await field('Looking back on the day')).toHaveValue('');
  await type('Looking back on the day', "Yesterday's diary");
  press('Save');
  await flush();
  expect(api.writes.at(-1)?.path).toBe('/api/diary/2026-10-21');

  press('Go to today');
  await screen.findByRole('heading', { level: 2, name: `Today (${formatDate(today)})` });
  expect(await field('Looking back on the day')).toHaveValue('A good day');
  press('Previous day');
  await screen.findByRole('heading', { level: 2, name: 'October 21, 2026' });
  press('Next day');
  await screen.findByRole('heading', { level: 2, name: `Today (${formatDate(today)})` });
  expect(await field('Looking back on the day')).toHaveValue('A good day');
});

test('unsaved text blocks moving to another day until it is saved', async () => {
  diaryApi();
  render(<Diary />);
  await type('Looking back on the day', 'Not saved yet');
  press('Previous day');
  await flush();
  expect(screen.getByRole('alert')).toHaveTextContent('You have unsaved changes');
  expect(
    screen.getByRole('heading', { level: 2, name: `Today (${formatDate(today)})` }),
  ).toBeVisible();
  expect(await field('Looking back on the day')).toHaveValue('Not saved yet');

  press('Save');
  await flush();
  press('Previous day');
  expect(await screen.findByRole('heading', { level: 2, name: 'October 21, 2026' })).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('a failed move can be retried with the same button', async () => {
  const api = diaryApi();
  render(<Diary />);
  await field('Looking back on the day');
  api.failNextLoad();
  press('Previous day');
  await flush();
  expect(screen.getByRole('alert')).toHaveTextContent('A server error occurred');
  press('Previous day');
  expect(await screen.findByRole('heading', { level: 2, name: 'October 21, 2026' })).toBeVisible();
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
});

test('a failed first load offers a retry', async () => {
  const api = diaryApi();
  api.failNextLoad();
  render(<Diary />);
  expect(await screen.findByRole('alert')).toHaveTextContent('A server error occurred');
  press('Try again');
  expect(await field('Looking back on the day')).toBeInTheDocument();
});

const draftKey = storedDraftKey;
const empty = { body: '', goodNote: '', regretNote: '', tomorrowNote: '' };
const seedDraft = (date: string, body: string, base = empty) =>
  localStorage.setItem(draftKey, JSON.stringify({ date, form: { ...empty, body }, base }));

test('text left unsaved comes back with a notice, and is not saved on its own', async () => {
  const api = diaryApi();
  const { unmount } = render(<Diary />);
  await type('Looking back on the day', 'Half-written text');
  await type('What went well (optional)', 'Note');
  unmount();

  render(<Diary />);
  expect(await field('Looking back on the day')).toHaveValue('Half-written text');
  expect(await field('What went well (optional)')).toHaveValue('Note');
  expect(screen.getByRole('status')).toHaveTextContent('Restored an unsaved draft');
  expect(screen.getByText('You have unsaved changes')).toBeInTheDocument();
  expect(api.writes).toEqual([]);

  press('Save');
  await flush();
  expect(api.writes.at(-1)?.body.body).toBe('Half-written text');
  expect(localStorage.getItem(draftKey)).toBeNull();
});

test('a saved diary leaves no draft and no notice behind', async () => {
  diaryApi();
  const { unmount } = render(<Diary />);
  await type('Looking back on the day', 'Text to save');
  press('Save');
  await flush();
  unmount();

  render(<Diary />);
  expect(await field('Looking back on the day')).toHaveValue('Text to save');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(localStorage.getItem(draftKey)).toBeNull();
});

test('a failed save keeps the draft', async () => {
  const api = diaryApi();
  const { unmount } = render(<Diary />);
  await type('Looking back on the day', 'Text to keep');
  api.failNextSave();
  press('Save');
  await flush();
  unmount();

  render(<Diary />);
  expect(await field('Looking back on the day')).toHaveValue('Text to keep');
});

test('leaving while a save is under way does not bring the text back as unsaved', async () => {
  const api = diaryApi();
  const { unmount } = render(<Diary />);
  await type('Looking back on the day', '  Text left while saving ');
  api.holdNextSave();
  press('Save');
  await flush();
  unmount();
  api.releaseSave();
  await flush();

  render(<Diary />);
  expect(await field('Looking back on the day')).toHaveValue('Text left while saving');
  expect(screen.queryByText('You have unsaved changes')).not.toBeInTheDocument();
});

test('a draft from an earlier day opens that day, not an empty today', async () => {
  diaryApi();
  seedDraft('2026-10-20', 'Text from two days ago');
  render(<Diary />);
  expect(await screen.findByRole('heading', { level: 2, name: 'October 20, 2026' })).toBeVisible();
  expect(await field('Looking back on the day')).toHaveValue('Text from two days ago');
  press('Go to today');
  await flush();
  expect(screen.getByRole('alert')).toHaveTextContent('Save or discard them');
  expect(screen.getByRole('heading', { level: 2, name: 'October 20, 2026' })).toBeVisible();
});

test('a draft older than a save made elsewhere keeps saying so on every visit', async () => {
  diaryApi([saved]);
  seedDraft(today, 'Older text', { ...empty, body: 'Even older text' });
  const { unmount } = render(<Diary />);
  expect(await field('Looking back on the day')).toHaveValue('Older text');
  expect(screen.getByRole('status')).toHaveTextContent('The saved entry changed in the meantime');
  await flush();
  unmount();

  render(<Diary />);
  expect(await field('Looking back on the day')).toHaveValue('Older text');
  expect(screen.getByRole('status')).toHaveTextContent('The saved entry changed in the meantime');
});

test('an answer to an earlier save does not erase text written since', async () => {
  const api = diaryApi();
  const { unmount } = render(<Diary />);
  await type('Looking back on the day', 'Text written first');
  api.holdNextSave();
  press('Save');
  await flush();
  unmount();

  render(<Diary />);
  await type('Looking back on the day', 'Text continued');
  await flush();
  api.releaseSave();
  await flush();
  expect(JSON.parse(localStorage.getItem(draftKey)!)).toMatchObject({
    form: { body: 'Text continued' },
  });
});

test('spaces alone leave no draft, so they cannot reopen an old day', async () => {
  diaryApi([saved]);
  const { unmount } = render(<Diary />);
  await type('Looking back on the day', 'A good day ');
  await flush();
  expect(localStorage.getItem(draftKey)).toBeNull();
  unmount();

  seedDraft('2026-10-20', '   ');
  render(<Diary />);
  expect(
    await screen.findByRole('heading', { level: 2, name: `Today (${formatDate(today)})` }),
  ).toBeVisible();
  expect(localStorage.getItem(draftKey)).toBeNull();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

test('a draft for a day the server refuses opens today instead of failing forever', async () => {
  diaryApi();
  seedDraft('1999-01-01', 'Text for a day that cannot be opened');
  render(<Diary />);
  expect(
    await screen.findByRole('heading', { level: 2, name: `Today (${formatDate(today)})` }),
  ).toBeVisible();
  expect(screen.getByRole('alert')).toHaveTextContent('January 1, 1999 cannot be opened');
  expect(localStorage.getItem(draftKey)).toBeNull();
});

test('typing again takes back a discard that was about to be confirmed', async () => {
  diaryApi();
  render(<Diary />);
  await type('Looking back on the day', 'Text to maybe discard');
  press('Discard');
  await type('Looking back on the day', 'Text still being written');
  expect(screen.queryByRole('button', { name: 'Confirm discard' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
});

test('a draft matching what is saved restores nothing', async () => {
  diaryApi([saved]);
  localStorage.setItem(
    draftKey,
    JSON.stringify({
      date: today,
      form: { ...empty, body: saved.body, goodNote: saved.goodNote },
      base: empty,
    }),
  );
  render(<Diary />);
  await field('Looking back on the day');
  await flush();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(localStorage.getItem(draftKey)).toBeNull();
});

test.each([
  ['broken JSON', '{'],
  ['the wrong shape', JSON.stringify({ date: today, form: { body: 1 }, base: empty })],
  ['a bad date', JSON.stringify({ date: '../x', form: empty, base: empty })],
])('a stored draft with %s is ignored', async (_name, stored) => {
  diaryApi();
  localStorage.setItem(draftKey, stored);
  render(<Diary />);
  expect(await field('Looking back on the day')).toHaveValue('');
  expect(
    screen.getByRole('heading', { level: 2, name: `Today (${formatDate(today)})` }),
  ).toBeVisible();
});

test('unsaved text can be discarded after confirming, back to what is saved', async () => {
  diaryApi([saved]);
  const { unmount } = render(<Diary />);
  await field('Looking back on the day');
  expect(screen.queryByRole('button', { name: 'Discard' })).not.toBeInTheDocument();
  await type('Looking back on the day', 'Text to discard');

  press('Discard');
  expect(screen.getByRole('button', { name: 'Confirm discard' })).toHaveFocus();
  press('Cancel');
  expect(screen.getByRole('button', { name: 'Discard' })).toHaveFocus();
  expect(await field('Looking back on the day')).toHaveValue('Text to discard');

  press('Discard');
  press('Confirm discard');
  expect(await field('Looking back on the day')).toHaveValue('A good day');
  expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus();
  expect(screen.getByRole('status')).toHaveTextContent('Discarded the unsaved changes');
  unmount();

  render(<Diary />);
  expect(await field('Looking back on the day')).toHaveValue('A good day');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

const leaving = () => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

test('closing the tab warns only when the draft could not be kept', async () => {
  diaryApi();
  render(<Diary />);
  await type('Looking back on the day', 'Text that is stored');
  await flush();
  expect(leaving()).toBe(false);

  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('full', 'QuotaExceededError');
  });
  await type('Looking back on the day', 'Text that is not stored');
  await flush();
  expect(screen.getByText(/not saved as a draft, so leaving will lose them/)).toBeInTheDocument();
  expect(leaving()).toBe(true);

  vi.mocked(Storage.prototype.setItem).mockRestore();
  press('Discard');
  press('Confirm discard');
  await flush();
  expect(leaving()).toBe(false);
});

test('moving to another day puts focus on its date', async () => {
  diaryApi();
  render(<Diary />);
  await field('Looking back on the day');
  screen.getByRole('button', { name: 'Previous day' }).focus();
  press('Previous day');
  await flush();
  expect(screen.getByRole('heading', { level: 2, name: 'October 21, 2026' })).toHaveFocus();
  screen.getByRole('button', { name: 'Go to today' }).focus();
  press('Go to today');
  await flush();
  expect(
    screen.getByRole('heading', { level: 2, name: `Today (${formatDate(today)})` }),
  ).toHaveFocus();
});

test('a blocked move leaves focus and date where they are', async () => {
  diaryApi();
  render(<Diary />);
  await type('Looking back on the day', 'Not saved yet');
  const previous = screen.getByRole('button', { name: 'Previous day' });
  previous.focus();
  press('Previous day');
  await flush();
  expect(previous).toHaveFocus();
});

test('an empty body is marked and takes focus when saving fails, until it is typed in', async () => {
  diaryApi();
  render(<Diary />);
  const body = await field('Looking back on the day');
  expect(body).not.toHaveAttribute('aria-invalid');
  // What a screen reader finds at the moment focus arrives.
  let onArrival = '';
  body.addEventListener('focus', () => {
    onArrival = `${String(body.hasAttribute('readonly'))} ${String(body.getAttribute('aria-invalid'))}`;
  });
  press('Save');
  await flush();
  expect(screen.getByRole('alert')).toHaveTextContent('Enter the diary entry');
  expect(body).toHaveFocus();
  expect(onArrival).toBe('false true');
  expect(body).toHaveAttribute('aria-invalid', 'true');
  await type('Looking back on the day', 'Just wrote');
  expect(body).not.toHaveAttribute('aria-invalid');
});

test("a body over the limit is marked too, but a server failure is not the body's fault", async () => {
  const api = diaryApi();
  render(<Diary />);
  const body = await field('Looking back on the day');
  await type('Looking back on the day', 'a'.repeat(5001));
  press('Save');
  await flush();
  expect(body).toHaveAttribute('aria-invalid', 'true');

  await type('Looking back on the day', 'Fine text');
  api.failNextSave();
  const save = screen.getByRole('button', { name: 'Save' });
  save.focus();
  press('Save');
  await flush();
  expect(body).not.toHaveAttribute('aria-invalid');
  expect(save).toHaveFocus();
});

test('a refused body is marked but does not take focus once the user has moved on', async () => {
  const api = diaryApi();
  render(<Diary />);
  const body = await field('Looking back on the day');
  screen.getByRole('button', { name: 'Save' }).focus();
  api.holdNextSave();
  press('Save');
  await flush();
  const note = await field('What went well (optional)');
  note.focus();
  api.releaseSave();
  await flush();
  expect(body).toHaveAttribute('aria-invalid', 'true');
  expect(note).toHaveFocus();
});

test('the first load shows a named busy region, and saving shows a spinner on the button', async () => {
  const api = diaryApi();
  api.holdNextLoad();
  render(<Diary />);
  expect(screen.getByRole('region', { name: 'Loading diary' })).toHaveAttribute(
    'aria-busy',
    'true',
  );
  api.releaseLoad();
  await type('Looking back on the day', 'Text being saved');
  api.holdNextSave();
  press('Save');
  await flush();
  expect(
    within(screen.getByRole('button', { name: /Save/ })).getByRole('status', {
      name: 'Saving',
    }),
  ).toBeInTheDocument();
  api.releaseSave();
  await flush();
  expect(screen.queryByRole('status', { name: 'Saving' })).not.toBeInTheDocument();
});

const otherTab = (newValue: string | null) =>
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: draftKey, newValue }));
  });

test('when another tab takes the draft, this tab warns until its next keystroke takes it back', async () => {
  diaryApi();
  render(<Diary />);
  await type('Looking back on the day', "This tab's text");
  await flush();
  expect(leaving()).toBe(false);

  const theirs = JSON.stringify({
    date: '2026-10-20',
    form: { ...empty, body: 'Other tab' },
    base: empty,
  });
  localStorage.setItem(draftKey, theirs);
  otherTab(theirs);
  expect(screen.getByText(/not saved as a draft, so leaving will lose them/)).toBeInTheDocument();
  expect(leaving()).toBe(true);

  await type('Looking back on the day', "This tab's text more");
  await flush();
  expect(screen.queryByText(/not saved as a draft/)).not.toBeInTheDocument();
  expect(leaving()).toBe(false);
  expect(JSON.parse(localStorage.getItem(draftKey)!)).toMatchObject({
    form: { body: "This tab's text more" },
  });
});

test('when another tab clears the draft, this tab puts its own back', async () => {
  diaryApi();
  render(<Diary />);
  await type('Looking back on the day', "This tab's text");
  await flush();
  localStorage.removeItem(draftKey);
  otherTab(null);
  expect(JSON.parse(localStorage.getItem(draftKey)!)).toMatchObject({
    form: { body: "This tab's text" },
  });
  expect(leaving()).toBe(false);
});

test('another tab changing the draft means nothing to a tab with no unsaved text', async () => {
  diaryApi();
  render(<Diary />);
  await field('Looking back on the day');
  otherTab(null);
  await flush();
  expect(localStorage.getItem(draftKey)).toBeNull();
  otherTab(JSON.stringify({ date: today, form: { ...empty, body: 'Other tab' }, base: empty }));
  await flush();
  expect(leaving()).toBe(false);
  expect(screen.queryByText(/not saved as a draft/)).not.toBeInTheDocument();
});

const theirDraft = JSON.stringify({
  date: today,
  form: { ...empty, body: "Other tab's text" },
  base: empty,
});

test("discarding or saving in a warned tab leaves the other tab's draft alone", async () => {
  diaryApi();
  const { unmount } = render(<Diary />);
  await type('Looking back on the day', "This tab's text");
  await flush();
  localStorage.setItem(draftKey, theirDraft);
  otherTab(theirDraft);
  press('Discard');
  press('Confirm discard');
  await flush();
  expect(localStorage.getItem(draftKey)).toBe(theirDraft);

  await type('Looking back on the day', 'Rewritten text');
  await flush();
  localStorage.setItem(draftKey, theirDraft);
  otherTab(theirDraft);
  press('Save');
  await flush();
  expect(localStorage.getItem(draftKey)).toBe(theirDraft);
  unmount();
});

test('after a warning passes, this tab clears its own draft as usual', async () => {
  diaryApi();
  render(<Diary />);
  await type('Looking back on the day', "This tab's text");
  await flush();
  localStorage.setItem(draftKey, theirDraft);
  otherTab(theirDraft);
  await type('Looking back on the day', 'Recovered text');
  await flush();
  press('Save');
  await flush();
  expect(localStorage.getItem(draftKey)).toBeNull();
});

test('clearing all of the storage counts as clearing the draft', async () => {
  diaryApi();
  render(<Diary />);
  await type('Looking back on the day', "This tab's text");
  await flush();
  localStorage.clear();
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: null, newValue: null }));
  });
  expect(JSON.parse(localStorage.getItem(draftKey)!)).toMatchObject({
    form: { body: "This tab's text" },
  });
});

test('putting the draft back keeps its first base, so a save elsewhere still shows', async () => {
  diaryApi([saved]);
  seedDraft(today, 'Older text', { ...empty, body: 'Even older text' });
  render(<Diary />);
  await field('Looking back on the day');
  await flush();
  localStorage.removeItem(draftKey);
  otherTab(null);
  expect(JSON.parse(localStorage.getItem(draftKey)!)).toMatchObject({
    base: { body: 'Even older text' },
  });
});

test('a storage event for something else is ignored', async () => {
  diaryApi();
  render(<Diary />);
  await type('Looking back on the day', "This tab's text");
  await flush();
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: 'theme', newValue: 'dark' }));
  });
  expect(leaving()).toBe(false);
});

test('text discarded after its draft was put back does not return', async () => {
  diaryApi();
  const { unmount } = render(<Diary />);
  await type('Looking back on the day', 'Text to discard');
  await flush();
  localStorage.setItem(draftKey, theirDraft);
  otherTab(theirDraft);
  localStorage.removeItem(draftKey);
  otherTab(null);
  expect(JSON.parse(localStorage.getItem(draftKey)!)).toMatchObject({
    form: { body: 'Text to discard' },
  });
  press('Discard');
  press('Confirm discard');
  await flush();
  expect(localStorage.getItem(draftKey)).toBeNull();
  unmount();
  render(<Diary />);
  expect(await field('Looking back on the day')).toHaveValue('');
});

test('taking the draft back keeps the first base of this text', async () => {
  diaryApi([saved]);
  seedDraft(today, 'Older text', { ...empty, body: 'Even older text' });
  render(<Diary />);
  await field('Looking back on the day');
  await flush();
  const other = JSON.stringify({
    date: '2026-10-20',
    form: { ...empty, body: 'Other day' },
    base: empty,
  });
  localStorage.setItem(draftKey, other);
  otherTab(other);
  await type('Looking back on the day', 'Text continued');
  await flush();
  expect(JSON.parse(localStorage.getItem(draftKey)!)).toMatchObject({
    base: { body: 'Even older text' },
  });
});

test('saving, then typing with another tab\u2019s draft stored, gives no false warning of a change', async () => {
  diaryApi();
  const { unmount } = render(<Diary />);
  await type('Looking back on the day', "This tab's text");
  await flush();
  localStorage.setItem(draftKey, theirDraft);
  otherTab(theirDraft);
  press('Save');
  await flush();
  expect(localStorage.getItem(draftKey)).toBe(theirDraft);
  await type('Looking back on the day', "This tab's text more");
  await flush();
  unmount();
  render(<Diary />);
  expect(await field('Looking back on the day')).toHaveValue("This tab's text more");
  expect(screen.getByRole('status')).toHaveTextContent('Save it to keep it in your records');
});

test('typing over what this tab loaded keeps that as the base, whatever another tab stored', async () => {
  diaryApi([saved]);
  render(<Diary />);
  await field('Looking back on the day');
  localStorage.setItem(
    draftKey,
    JSON.stringify({
      date: today,
      form: { ...empty, body: 'Other tab' },
      base: { ...empty, body: 'Other base' },
    }),
  );
  await type('Looking back on the day', "This tab's text");
  await flush();
  expect(JSON.parse(localStorage.getItem(draftKey)!)).toMatchObject({ base: { body: saved.body } });
});

test('an event older than this tab\u2019s own write is not a warning', async () => {
  diaryApi();
  render(<Diary />);
  await type('Looking back on the day', "This tab's text");
  await flush();
  // The event says another tab wrote, but what is stored now is this tab's.
  otherTab(theirDraft);
  await flush();
  expect(leaving()).toBe(false);
  press('Discard');
  press('Confirm discard');
  await flush();
  expect(localStorage.getItem(draftKey)).toBeNull();
});

test('after a retry succeeds, focus is on the page rather than lost', async () => {
  const api = diaryApi();
  api.failNextLoad();
  render(
    <section aria-labelledby="page">
      <h1 id="page">Diary</h1>
      <Diary />
    </section>,
  );
  const retry = await screen.findByRole('button', { name: 'Try again' });
  retry.focus();
  fireEvent.click(retry);
  await field('Looking back on the day');
  expect(screen.getByRole('region', { name: 'Diary' })).toHaveFocus();
});

test('a tab with nothing unsaved leaves another tab\u2019s draft alone', async () => {
  diaryApi([saved]);
  render(<Diary />);
  await field('Looking back on the day');
  await flush();
  // Another tab, since closed, left its text here.
  localStorage.setItem(draftKey, theirDraft);
  press('Save');
  await flush();
  expect(localStorage.getItem(draftKey)).toBe(theirDraft);
  // Spaces alone are nothing unsaved either.
  await type('Looking back on the day', `${saved.body} `);
  await flush();
  expect(localStorage.getItem(draftKey)).toBe(theirDraft);
});

test('text taken back to what is saved clears this tab\u2019s own draft', async () => {
  diaryApi([saved]);
  render(<Diary />);
  await type('Looking back on the day', 'Briefly written text');
  await flush();
  expect(localStorage.getItem(draftKey)).not.toBeNull();
  await type('Looking back on the day', saved.body);
  await flush();
  expect(localStorage.getItem(draftKey)).toBeNull();
});

test('a restored draft that cannot be stored again is still cleared when discarded', async () => {
  diaryApi();
  seedDraft(today, 'Restored text');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('blocked', 'QuotaExceededError');
  });
  const { unmount } = render(<Diary />);
  expect(await field('Looking back on the day')).toHaveValue('Restored text');
  await flush();
  press('Discard');
  press('Confirm discard');
  await flush();
  expect(localStorage.getItem(draftKey)).toBeNull();
  unmount();
  render(<Diary />);
  expect(await field('Looking back on the day')).toHaveValue('');
});

test('moving to a day whose draft matches what is saved clears that draft', async () => {
  const yesterday = '2026-10-21';
  diaryApi([{ ...saved, date: yesterday }]);
  render(<Diary />);
  await field('Looking back on the day');
  await flush();
  seedDraft(yesterday, saved.body);
  localStorage.setItem(
    draftKey,
    JSON.stringify({
      date: yesterday,
      form: { ...empty, body: saved.body, goodNote: saved.goodNote },
      base: empty,
    }),
  );
  press('Previous day');
  await screen.findByRole('heading', { level: 2, name: formatDate(yesterday) });
  expect(localStorage.getItem(draftKey)).toBeNull();
});
