import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { WeeklyRoutines } from './weekly-routines';

type Seed = { id: string; name: string };

// Sunday of the date's week, as backend/src/periods.ts counts it.
function weekStart(date: string) {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - day.getUTCDay());
  return day.toISOString().slice(0, 10);
}
const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 864e5).toISOString().slice(0, 10);

// A fake API with state, like the server: one check per routine per week, and 404 for a routine
// that is gone. A plain object rather than a Response resolves in microtasks only.
function weeklyApi(seed: Seed[] = []) {
  let routines = seed.map((r, i) => ({ ...r, cadence: 'weekly', category: null, sortOrder: i }));
  let nextId = 100;
  let today = '2026-10-22';
  const checks = new Set<string>();
  const writes: { method: string; path: string; body?: unknown }[] = [];
  const reply = (status: number, body: unknown) =>
    Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const path = url.split('?')[0];
      if (method === 'GET' && path === '/api/routines') return reply(200, { routines });
      if (method === 'GET') {
        const start = weekStart(today);
        return reply(200, {
          date: today,
          today,
          previousDate: addDays(today, -1),
          nextDate: null,
          period: { start, end: addDays(start, 6) },
          items: routines.map((r) => ({ ...r, checked: checks.has(`${r.id}/${start}`) })),
        });
      }
      const body = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, string>)
        : undefined;
      writes.push({ method, path, body });
      if (method === 'POST' && path === '/api/routines') {
        const routine = {
          id: String(nextId++),
          name: body!.name,
          cadence: 'weekly',
          category: null,
          sortOrder: routines.length,
        };
        routines = [...routines, routine];
        return reply(201, { routine });
      }
      const [, , , id, action, date] = path.split('/');
      const found = routines.find((r) => r.id === id);
      if (!found) return reply(404, { error: '루틴을 찾을 수 없습니다' });
      if (action === 'checks') {
        const key = `${id}/${weekStart(date)}`;
        if (method === 'PUT') checks.add(key);
        else checks.delete(key);
        return reply(200, {});
      }
      if (action === 'archive') routines = routines.filter((r) => r !== found);
      return reply(200, {});
    }),
  );
  return {
    writes,
    checks,
    setToday: (date: string) => (today = date),
    archiveElsewhere: (id: string) => (routines = routines.filter((r) => r.id !== id)),
  };
}

const flush = () => act(() => new Promise((resolve) => setTimeout(resolve)));
const box = (name: string) => screen.findByRole('checkbox', { name });
const thisWeek = () => screen.getByRole('region', { name: '이번 주 체크리스트' });
const seed = [
  { id: '1', name: '독후감 쓰기' },
  { id: '2', name: '청소' },
  { id: '3', name: '가계부 쓰기' },
];

test('shows this week from Sunday to Saturday with its progress', async () => {
  weeklyApi(seed);
  render(<WeeklyRoutines />);
  await box('독후감 쓰기');
  expect(
    screen.getByRole('heading', { level: 2, name: '이번 주 (2026-10-18 ~ 2026-10-24)' }),
  ).toBeVisible();
  expect(within(thisWeek()).getByText('0/3')).toBeInTheDocument();
});

test('checking saves under the date and survives a reload', async () => {
  const api = weeklyApi(seed);
  const { unmount } = render(<WeeklyRoutines />);
  fireEvent.click(await box('청소'));
  expect(await box('청소')).toBeChecked();
  expect(within(thisWeek()).getByText('1/3')).toBeInTheDocument();
  await flush();
  expect(api.writes).toEqual([
    { method: 'PUT', path: '/api/routines/2/checks/2026-10-22', body: undefined },
  ]);

  unmount();
  render(<WeeklyRoutines />);
  expect(await box('청소')).toBeChecked();
});

test('a later day of the same week stays checked and a new week starts empty', async () => {
  const api = weeklyApi(seed);
  render(<WeeklyRoutines />);
  fireEvent.click(await box('청소'));
  await flush();

  const showPageAgain = async () => {
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
  };
  api.setToday('2026-10-24');
  await act(showPageAgain);
  expect(await box('청소')).toBeChecked();

  api.setToday('2026-10-25');
  await act(showPageAgain);
  expect(
    screen.getByRole('heading', { level: 2, name: '이번 주 (2026-10-25 ~ 2026-10-31)' }),
  ).toBeVisible();
  expect(await box('청소')).not.toBeChecked();
  // Last week's record stays.
  expect(api.checks).toEqual(new Set(['2/2026-10-18']));
});

test('adding a routine sends no category and it appears in both lists', async () => {
  const api = weeklyApi();
  render(<WeeklyRoutines />);
  expect(await screen.findByText('이번 주에 체크할 루틴이 없습니다')).toBeInTheDocument();
  const input = screen.getByRole('textbox', { name: '주간 새 루틴 이름' });
  expect(input).toHaveAttribute('placeholder', '예: 독후감 쓰기, 청소, 가계부 쓰기');
  fireEvent.change(input, { target: { value: ' 독후감 쓰기 ' } });
  fireEvent.click(screen.getByRole('button', { name: '추가' }));
  expect(await box('독후감 쓰기')).not.toBeChecked();
  expect(api.writes).toEqual([
    { method: 'POST', path: '/api/routines', body: { name: '독후감 쓰기', cadence: 'weekly' } },
  ]);
  const manage = screen.getByRole('region', { name: '주간 루틴 관리' });
  expect(within(manage).getByText('독후감 쓰기')).toBeInTheDocument();
  expect(within(manage).getByRole('textbox', { name: '주간 새 루틴 이름' })).toHaveValue('');
});

test('archiving after confirmation removes it from the checklist too', async () => {
  const api = weeklyApi(seed);
  render(<WeeklyRoutines />);
  await box('청소');
  fireEvent.click(await screen.findByRole('button', { name: '청소 보관' }));
  expect(screen.getByRole('checkbox', { name: '청소' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '청소 보관 확인' }));
  await flush();
  expect(api.writes.at(-1)?.path).toBe('/api/routines/2/archive');
  expect(screen.queryByRole('checkbox', { name: '청소' })).not.toBeInTheDocument();
  expect(within(thisWeek()).getByText('0/2')).toBeInTheDocument();
});

test('a routine archived elsewhere shows the Korean 404 and leaves the checklist', async () => {
  const api = weeklyApi(seed);
  render(<WeeklyRoutines />);
  await box('청소');
  api.archiveElsewhere('2');
  fireEvent.click(await box('청소'));
  await flush();
  expect(screen.getAllByRole('alert').map((n) => n.textContent)).toContain(
    '루틴을 찾을 수 없습니다',
  );
  expect(screen.queryByRole('checkbox', { name: '청소' })).not.toBeInTheDocument();
});

test('a failed checklist load offers a retry and the routine list still works', async () => {
  let failing = true;
  weeklyApi(seed);
  const working = vi.mocked(fetch);
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (failing && url.startsWith('/api/checklist')) {
        failing = false;
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: '서버 오류가 발생했습니다' }),
        });
      }
      return working(url, init);
    }),
  );
  render(<WeeklyRoutines />);
  await flush();
  expect(screen.getAllByRole('alert').map((n) => n.textContent)).toContain(
    '서버 오류가 발생했습니다',
  );
  expect(screen.getByRole('button', { name: '청소 보관' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  expect(await box('청소')).toBeInTheDocument();
});
