import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { Diary } from './diary';

type Entry = {
  date: string;
  body: string;
  goodNote: string | null;
  regretNote: string | null;
  tomorrowNote: string | null;
};

const today = '2026-10-22';

// A fake diary API with state, like the server: one entry per date and a Korean 400 for an empty
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
          return reply(500, { error: '서버 오류가 발생했습니다' });
        }
        const date = new URL(url, 'http://localhost').searchParams.get('date') ?? today;
        if (date < '2000-01-01')
          return reply(400, { error: '2000년 이후 날짜의 일기만 쓸 수 있습니다' });
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
        return reply(500, { error: '서버 오류가 발생했습니다' });
      }
      if (!body.body.trim()) return reply(400, { error: '일기 본문을 입력해 주세요' });
      if (body.body.length > 5000)
        return reply(400, { error: '일기 본문은 5000자 이하로 입력해 주세요' });
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
  body: '잘 보낸 하루',
  goodNote: '일찍 일어남',
  regretNote: null,
  tomorrowNote: null,
};

test('shows today with its routine progress and an empty form', async () => {
  diaryApi();
  render(<Diary />);
  expect(await field('하루 돌아보기')).toHaveValue('');
  expect(screen.getByRole('heading', { level: 2, name: `오늘 (${today})` })).toBeVisible();
  expect(screen.getByText('하루 루틴 2/5 완료')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '다음 날' })).toBeDisabled();
});

test('a day before any routine existed shows no routine progress', async () => {
  const api = diaryApi();
  api.setProgress({ checked: 0, total: 0 });
  render(<Diary />);
  await field('하루 돌아보기');
  expect(screen.queryByText(/하루 루틴 .* 완료/)).not.toBeInTheDocument();
});

test('saving sends every field and keeps the text after a reload', async () => {
  const api = diaryApi();
  const { unmount } = render(<Diary />);
  await type('하루 돌아보기', '  잘 보낸 하루 ');
  await type('잘한 점 (선택)', '일찍 일어남');
  expect(screen.getByText('저장하지 않은 내용이 있습니다')).toBeInTheDocument();
  press('저장');
  await flush();
  expect(api.writes).toEqual([
    {
      path: `/api/diary/${today}`,
      body: { body: '  잘 보낸 하루 ', goodNote: '일찍 일어남', regretNote: '', tomorrowNote: '' },
    },
  ]);
  expect(screen.getByRole('status')).toHaveTextContent(`${today} 일기를 저장했습니다`);
  // The form shows what the server stored, and nothing is left unsaved.
  expect(await field('하루 돌아보기')).toHaveValue('잘 보낸 하루');
  expect(screen.queryByText('저장하지 않은 내용이 있습니다')).not.toBeInTheDocument();

  unmount();
  render(<Diary />);
  expect(await field('하루 돌아보기')).toHaveValue('잘 보낸 하루');
  expect(await field('잘한 점 (선택)')).toHaveValue('일찍 일어남');
});

test('saving a day that has an entry shows it first and updates it', async () => {
  const api = diaryApi([saved]);
  render(<Diary />);
  expect(await field('하루 돌아보기')).toHaveValue('잘 보낸 하루');
  await type('하루 돌아보기', '고쳐 쓴 하루');
  press('저장');
  await flush();
  expect(api.writes).toHaveLength(1);
  expect(await field('하루 돌아보기')).toHaveValue('고쳐 쓴 하루');
  expect(await field('잘한 점 (선택)')).toHaveValue('일찍 일어남');
});

test('a rejected or failed save shows the Korean error and keeps the text', async () => {
  const api = diaryApi();
  render(<Diary />);
  await field('하루 돌아보기');
  press('저장');
  await flush();
  expect(screen.getByRole('alert')).toHaveTextContent('일기 본문을 입력해 주세요');

  await type('하루 돌아보기', '지우면 안 되는 글');
  api.failNextSave();
  press('저장');
  await flush();
  expect(screen.getByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다');
  expect(await field('하루 돌아보기')).toHaveValue('지우면 안 되는 글');
  expect(screen.getByText('저장하지 않은 내용이 있습니다')).toBeInTheDocument();
});

test('text over the limit is not cut: the count warns and the server rejects it', async () => {
  const api = diaryApi();
  render(<Diary />);
  const body = await field('하루 돌아보기');
  expect(body).not.toHaveAttribute('maxlength');
  const tooLong = '가'.repeat(5001);
  await type('하루 돌아보기', tooLong);
  expect(screen.getByText('5001/5000')).toBeInTheDocument();
  press('저장');
  await flush();
  expect(api.writes).toHaveLength(1);
  expect(screen.getByRole('alert')).toHaveTextContent('일기 본문은 5000자 이하로 입력해 주세요');
  expect(await field('하루 돌아보기')).toHaveValue(tooLong);
});

test('a save result appears beside the save button, a blocked move beside the date buttons', async () => {
  diaryApi();
  render(<Diary />);
  const form = (await field('하루 돌아보기')).closest('form')!;
  press('저장');
  await flush();
  expect(form).toContainElement(screen.getByRole('alert'));
  await type('하루 돌아보기', '아직 저장 안 함');
  press('이전 날');
  await flush();
  expect(form).not.toContainElement(screen.getByRole('alert'));
});

test('while a day is loading the form is locked and a slow older answer is ignored', async () => {
  const api = diaryApi([saved]);
  render(<Diary />);
  await field('하루 돌아보기');
  press('이전 날');
  await screen.findByRole('heading', { level: 2, name: '2026-10-21' });
  api.holdNextLoad();
  press('이전 날');
  await flush();
  expect(await field('하루 돌아보기')).toHaveAttribute('readonly');
  press('저장');
  await flush();
  expect(api.writes).toEqual([]);

  press('오늘로');
  await flush();
  expect(await field('하루 돌아보기')).not.toHaveAttribute('readonly');
  api.releaseLoad();
  await flush();
  expect(screen.getByRole('heading', { level: 2, name: `오늘 (${today})` })).toBeVisible();
  expect(await field('하루 돌아보기')).toHaveValue('잘 보낸 하루');
});

test('while saving the form is locked and the date stays', async () => {
  const api = diaryApi();
  render(<Diary />);
  await type('하루 돌아보기', '저장 중인 글');
  api.holdNextSave();
  press('저장');
  await flush();
  expect(await field('하루 돌아보기')).toHaveAttribute('readonly');
  press('이전 날');
  await flush();
  expect(screen.getByRole('heading', { level: 2, name: `오늘 (${today})` })).toBeVisible();
  api.releaseSave();
  await flush();
  expect(api.writes).toHaveLength(1);
  expect(await field('하루 돌아보기')).toHaveValue('저장 중인 글');
  expect(await field('하루 돌아보기')).not.toHaveAttribute('readonly');
});

test('a past day can be opened and written, and each day keeps its own entry', async () => {
  const api = diaryApi([saved]);
  render(<Diary />);
  await field('하루 돌아보기');
  press('이전 날');
  expect(await screen.findByRole('heading', { level: 2, name: '2026-10-21' })).toBeVisible();
  expect(await field('하루 돌아보기')).toHaveValue('');
  await type('하루 돌아보기', '어제의 일기');
  press('저장');
  await flush();
  expect(api.writes.at(-1)?.path).toBe('/api/diary/2026-10-21');

  press('오늘로');
  await screen.findByRole('heading', { level: 2, name: `오늘 (${today})` });
  expect(await field('하루 돌아보기')).toHaveValue('잘 보낸 하루');
  press('이전 날');
  await screen.findByRole('heading', { level: 2, name: '2026-10-21' });
  press('다음 날');
  await screen.findByRole('heading', { level: 2, name: `오늘 (${today})` });
  expect(await field('하루 돌아보기')).toHaveValue('잘 보낸 하루');
});

test('unsaved text blocks moving to another day until it is saved', async () => {
  diaryApi();
  render(<Diary />);
  await type('하루 돌아보기', '아직 저장 안 함');
  press('이전 날');
  await flush();
  expect(screen.getByRole('alert')).toHaveTextContent('저장하지 않은 내용이 있습니다');
  expect(screen.getByRole('heading', { level: 2, name: `오늘 (${today})` })).toBeVisible();
  expect(await field('하루 돌아보기')).toHaveValue('아직 저장 안 함');

  press('저장');
  await flush();
  press('이전 날');
  expect(await screen.findByRole('heading', { level: 2, name: '2026-10-21' })).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('a failed move can be retried with the same button', async () => {
  const api = diaryApi();
  render(<Diary />);
  await field('하루 돌아보기');
  api.failNextLoad();
  press('이전 날');
  await flush();
  expect(screen.getByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다');
  press('이전 날');
  expect(await screen.findByRole('heading', { level: 2, name: '2026-10-21' })).toBeVisible();
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
});

test('a failed first load offers a retry', async () => {
  const api = diaryApi();
  api.failNextLoad();
  render(<Diary />);
  expect(await screen.findByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다');
  press('다시 시도');
  expect(await field('하루 돌아보기')).toBeInTheDocument();
});

const draftKey = 'plan-routine.diary-draft';
const empty = { body: '', goodNote: '', regretNote: '', tomorrowNote: '' };
const seedDraft = (date: string, body: string, base = empty) =>
  localStorage.setItem(draftKey, JSON.stringify({ date, form: { ...empty, body }, base }));

test('text left unsaved comes back with a notice, and is not saved on its own', async () => {
  const api = diaryApi();
  const { unmount } = render(<Diary />);
  await type('하루 돌아보기', '쓰다 만 글');
  await type('잘한 점 (선택)', '메모');
  unmount();

  render(<Diary />);
  expect(await field('하루 돌아보기')).toHaveValue('쓰다 만 글');
  expect(await field('잘한 점 (선택)')).toHaveValue('메모');
  expect(screen.getByRole('status')).toHaveTextContent('저장하지 않은 글을 불러왔습니다');
  expect(screen.getByText('저장하지 않은 내용이 있습니다')).toBeInTheDocument();
  expect(api.writes).toEqual([]);

  press('저장');
  await flush();
  expect(api.writes.at(-1)?.body.body).toBe('쓰다 만 글');
  expect(localStorage.getItem(draftKey)).toBeNull();
});

test('a saved diary leaves no draft and no notice behind', async () => {
  diaryApi();
  const { unmount } = render(<Diary />);
  await type('하루 돌아보기', '저장할 글');
  press('저장');
  await flush();
  unmount();

  render(<Diary />);
  expect(await field('하루 돌아보기')).toHaveValue('저장할 글');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(localStorage.getItem(draftKey)).toBeNull();
});

test('a failed save keeps the draft', async () => {
  const api = diaryApi();
  const { unmount } = render(<Diary />);
  await type('하루 돌아보기', '지키는 글');
  api.failNextSave();
  press('저장');
  await flush();
  unmount();

  render(<Diary />);
  expect(await field('하루 돌아보기')).toHaveValue('지키는 글');
});

test('leaving while a save is under way does not bring the text back as unsaved', async () => {
  const api = diaryApi();
  const { unmount } = render(<Diary />);
  await type('하루 돌아보기', '  저장 중에 떠난 글 ');
  api.holdNextSave();
  press('저장');
  await flush();
  unmount();
  api.releaseSave();
  await flush();

  render(<Diary />);
  expect(await field('하루 돌아보기')).toHaveValue('저장 중에 떠난 글');
  expect(screen.queryByText('저장하지 않은 내용이 있습니다')).not.toBeInTheDocument();
});

test('a draft from an earlier day opens that day, not an empty today', async () => {
  diaryApi();
  seedDraft('2026-10-20', '그저께 쓰던 글');
  render(<Diary />);
  expect(await screen.findByRole('heading', { level: 2, name: '2026-10-20' })).toBeVisible();
  expect(await field('하루 돌아보기')).toHaveValue('그저께 쓰던 글');
  press('오늘로');
  await flush();
  expect(screen.getByRole('alert')).toHaveTextContent('저장하거나 버린 뒤');
  expect(screen.getByRole('heading', { level: 2, name: '2026-10-20' })).toBeVisible();
});

test('a draft older than a save made elsewhere keeps saying so on every visit', async () => {
  diaryApi([saved]);
  seedDraft(today, '예전 글', { ...empty, body: '더 예전 글' });
  const { unmount } = render(<Diary />);
  expect(await field('하루 돌아보기')).toHaveValue('예전 글');
  expect(screen.getByRole('status')).toHaveTextContent('저장된 내용이 달라졌으니');
  await flush();
  unmount();

  render(<Diary />);
  expect(await field('하루 돌아보기')).toHaveValue('예전 글');
  expect(screen.getByRole('status')).toHaveTextContent('저장된 내용이 달라졌으니');
});

test('an answer to an earlier save does not erase text written since', async () => {
  const api = diaryApi();
  const { unmount } = render(<Diary />);
  await type('하루 돌아보기', '먼저 쓴 글');
  api.holdNextSave();
  press('저장');
  await flush();
  unmount();

  render(<Diary />);
  await type('하루 돌아보기', '이어서 쓴 글');
  await flush();
  api.releaseSave();
  await flush();
  expect(JSON.parse(localStorage.getItem(draftKey)!)).toMatchObject({
    form: { body: '이어서 쓴 글' },
  });
});

test('spaces alone leave no draft, so they cannot reopen an old day', async () => {
  diaryApi([saved]);
  const { unmount } = render(<Diary />);
  await type('하루 돌아보기', '잘 보낸 하루 ');
  await flush();
  expect(localStorage.getItem(draftKey)).toBeNull();
  unmount();

  seedDraft('2026-10-20', '   ');
  render(<Diary />);
  expect(await screen.findByRole('heading', { level: 2, name: `오늘 (${today})` })).toBeVisible();
  expect(localStorage.getItem(draftKey)).toBeNull();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

test('a draft for a day the server refuses opens today instead of failing forever', async () => {
  diaryApi();
  seedDraft('1999-01-01', '열 수 없는 날의 글');
  render(<Diary />);
  expect(await screen.findByRole('heading', { level: 2, name: `오늘 (${today})` })).toBeVisible();
  expect(screen.getByRole('alert')).toHaveTextContent('1999-01-01은 열 수 없는 날짜라');
  expect(localStorage.getItem(draftKey)).toBeNull();
});

test('typing again takes back a discard that was about to be confirmed', async () => {
  diaryApi();
  render(<Diary />);
  await type('하루 돌아보기', '버릴까 한 글');
  press('버리기');
  await type('하루 돌아보기', '계속 쓰는 글');
  expect(screen.queryByRole('button', { name: '버리기 확인' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '버리기' })).toBeInTheDocument();
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
  await field('하루 돌아보기');
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
  expect(await field('하루 돌아보기')).toHaveValue('');
  expect(screen.getByRole('heading', { level: 2, name: `오늘 (${today})` })).toBeVisible();
});

test('unsaved text can be discarded after confirming, back to what is saved', async () => {
  diaryApi([saved]);
  const { unmount } = render(<Diary />);
  await field('하루 돌아보기');
  expect(screen.queryByRole('button', { name: '버리기' })).not.toBeInTheDocument();
  await type('하루 돌아보기', '버릴 글');

  press('버리기');
  expect(screen.getByRole('button', { name: '버리기 확인' })).toHaveFocus();
  press('취소');
  expect(screen.getByRole('button', { name: '버리기' })).toHaveFocus();
  expect(await field('하루 돌아보기')).toHaveValue('버릴 글');

  press('버리기');
  press('버리기 확인');
  expect(await field('하루 돌아보기')).toHaveValue('잘 보낸 하루');
  expect(screen.getByRole('button', { name: '저장' })).toHaveFocus();
  expect(screen.getByRole('status')).toHaveTextContent('저장하지 않은 내용을 버렸습니다');
  unmount();

  render(<Diary />);
  expect(await field('하루 돌아보기')).toHaveValue('잘 보낸 하루');
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
  await type('하루 돌아보기', '보관되는 글');
  await flush();
  expect(leaving()).toBe(false);

  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('full', 'QuotaExceededError');
  });
  await type('하루 돌아보기', '보관되지 않는 글');
  await flush();
  expect(screen.getByText(/임시 저장하지 못해, 떠나면 사라집니다/)).toBeInTheDocument();
  expect(leaving()).toBe(true);

  vi.mocked(Storage.prototype.setItem).mockRestore();
  press('버리기');
  press('버리기 확인');
  await flush();
  expect(leaving()).toBe(false);
});
