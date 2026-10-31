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
        const response = reply(200, {
          date,
          today,
          previousDate: shift(date, -1),
          nextDate: date < today ? shift(date, 1) : null,
          progress: { checked: 2, total: 5 },
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
