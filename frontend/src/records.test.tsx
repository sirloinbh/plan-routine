import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { Records } from './records';

const today = '2026-10-22';

const summary = (date: string, checked = 0, total = 0, hasDiary = false) => ({
  date,
  checked,
  total,
  hasDiary,
});
const routine = (
  id: string,
  name: string,
  category: string,
  checked: boolean,
  archived = false,
) => ({
  id,
  name,
  cadence: 'daily',
  category,
  sortOrder: Number(id),
  checked,
  archived,
});

// A fake records API. A plain object rather than a Response resolves in microtasks only.
function recordsApi() {
  const days: Record<string, unknown> = {
    '2026-10-20': {
      progress: { checked: 1, total: 2 },
      routines: [
        routine('1', '6시 기상', 'wake', true),
        routine('2', '그때 있던 루틴', 'exercise', false, true),
      ],
      diary: {
        body: '잘 보낸 하루',
        goodNote: '일찍 일어남',
        regretNote: null,
        tomorrowNote: null,
      },
    },
    [today]: {
      progress: { checked: 0, total: 1 },
      routines: [routine('1', '6시 기상', 'wake', false)],
      diary: null,
    },
  };
  const calls: { method: string; url: string }[] = [];
  let failMonth = false;
  let failDay = false;
  const reply = (status: number, body: unknown) =>
    Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
  const serverError = () => reply(500, { error: '서버 오류가 발생했습니다' });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      calls.push({ method: init?.method ?? 'GET', url });
      const path = new URL(url, 'http://localhost');
      if (path.pathname === '/api/records') {
        if (failMonth) {
          failMonth = false;
          return serverError();
        }
        const month = path.searchParams.get('month') ?? '2026-10';
        return reply(200, {
          today,
          month,
          previousMonth: month === '2026-10' ? '2026-09' : null,
          nextMonth: month === '2026-09' ? '2026-10' : null,
          days:
            month === '2026-10'
              ? [
                  summary('2026-10-01'),
                  summary('2026-10-20', 1, 2, true),
                  summary('2026-10-21', 0, 1),
                  summary(today, 0, 1),
                ]
              : [summary('2026-09-01', 1, 1)],
        });
      }
      if (failDay) {
        failDay = false;
        return serverError();
      }
      const date = path.pathname.split('/')[3];
      return reply(200, {
        date,
        today,
        ...(days[date] ?? {
          progress: { checked: 0, total: 0 },
          routines: [],
          diary: null,
        }),
      });
    }),
  );
  return {
    calls,
    failMonth: () => (failMonth = true),
    failDay: () => (failDay = true),
  };
}

const flush = () => act(() => new Promise((resolve) => setTimeout(resolve)));
const dayButton = (date: string) => screen.getByRole('button', { name: new RegExp(`^${date} `) });
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

test('opens on this month and today, with each day summarised', async () => {
  recordsApi();
  render(<Records />);
  await flush();
  expect(screen.getByRole('region', { name: '2026년 10월 달력' })).toBeVisible();
  expect(
    screen.getByRole('button', { name: '2026-10-20 하루 루틴 1/2 완료, 일기 있음' }),
  ).toBeInTheDocument();
  expect(dayButton(today)).toHaveAttribute('aria-current', 'date');
  expect(dayButton(today)).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('heading', { level: 2, name: `오늘 (${today})` })).toBeVisible();
  expect(screen.getByRole('button', { name: '다음 달' })).toBeDisabled();
});

test('the first day sits under its weekday', async () => {
  recordsApi();
  render(<Records />);
  await flush();
  // 2026-10-01 is a Thursday, the fifth column from Sunday.
  expect(dayButton('2026-10-01').closest('li')).toHaveStyle({ gridColumnStart: '5' });
});

test('a chosen day shows its checks, archived routines and diary', async () => {
  recordsApi();
  render(<Records />);
  await flush();
  fireEvent.click(dayButton('2026-10-20'));
  await flush();
  const record = screen.getByRole('region', { name: '2026-10-20 기록' });
  expect(within(record).getByText('하루 루틴 1/2 완료')).toBeInTheDocument();
  const items = within(record)
    .getAllByRole('listitem')
    .map((item) => item.textContent);
  expect(items[0]).toContain('6시 기상');
  expect(items[0]).toContain('완료');
  expect(items[1]).toContain('그때 있던 루틴');
  expect(items[1]).toContain('미완료');
  expect(items[1]).toContain('보관됨');
  expect(within(record).getByText('잘 보낸 하루')).toBeInTheDocument();
  expect(within(record).getByText('일찍 일어남')).toBeInTheDocument();
  expect(within(record).queryByText('아쉬운 점')).not.toBeInTheDocument();
});

test('a day with no record says so', async () => {
  recordsApi();
  render(<Records />);
  await flush();
  fireEvent.click(dayButton('2026-10-01'));
  await flush();
  expect(screen.getByText('이 날의 기록이 없습니다')).toBeInTheDocument();
});

test('a day with routines but no diary says the diary was not written', async () => {
  recordsApi();
  render(<Records />);
  await flush();
  expect(screen.getByText('이 날은 일기를 쓰지 않았습니다')).toBeInTheDocument();
});

test('records cannot be changed from this page', async () => {
  const api = recordsApi();
  render(<Records />);
  await flush();
  fireEvent.click(dayButton('2026-10-20'));
  await flush();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(api.calls.every((call) => call.method === 'GET')).toBe(true);
});

test('months can be moved through while the chosen day stays', async () => {
  const api = recordsApi();
  render(<Records />);
  await flush();
  fireEvent.click(dayButton('2026-10-20'));
  await flush();
  press('이전 달');
  await flush();
  expect(screen.getByRole('region', { name: '2026년 9월 달력' })).toBeVisible();
  expect(api.calls.at(-1)?.url).toContain('/api/records');
  expect(screen.getByRole('region', { name: '2026-10-20 기록' })).toBeVisible();
  press('다음 달');
  await flush();
  expect(screen.getByRole('region', { name: '2026년 10월 달력' })).toBeVisible();
});

test('a failed first load offers a retry', async () => {
  const api = recordsApi();
  api.failMonth();
  render(<Records />);
  expect(await screen.findByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다');
  press('다시 시도');
  await flush();
  expect(screen.getByRole('region', { name: '2026년 10월 달력' })).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('a failed month move can be retried and keeps the calendar', async () => {
  const api = recordsApi();
  render(<Records />);
  await flush();
  api.failMonth();
  press('이전 달');
  await flush();
  expect(screen.getByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다');
  expect(screen.getByRole('region', { name: '2026년 10월 달력' })).toBeVisible();
  press('다시 시도');
  await flush();
  expect(screen.getByRole('region', { name: '2026년 9월 달력' })).toBeVisible();
});

test('a failed day load offers its own retry', async () => {
  const api = recordsApi();
  render(<Records />);
  await flush();
  api.failDay();
  fireEvent.click(dayButton('2026-10-20'));
  await flush();
  expect(screen.getByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다');
  press('이 날 기록 다시 불러오기');
  await waitFor(() =>
    expect(screen.getByRole('region', { name: '2026-10-20 기록' })).toBeVisible(),
  );
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('a page shown again loads the records once more', async () => {
  const api = recordsApi();
  render(<Records />);
  await flush();
  const before = api.calls.length;
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((resolve) => setTimeout(resolve));
  });
  expect(api.calls.length).toBe(before + 2);
});
