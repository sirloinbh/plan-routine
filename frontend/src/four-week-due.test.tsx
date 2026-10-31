import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { FourWeekDue } from './four-week-due';

type Seed = { id: string; name: string; checked?: boolean };

// A fake checklist API with state. A plain object rather than a Response resolves in microtasks only.
function dueApi(seed: Seed[], options: { endsSoon?: boolean; remainingDays?: number } = {}) {
  let routines = seed;
  let periodStart = '2026-10-18';
  let failNextSave = false;
  const checks = new Set(seed.filter((r) => r.checked).map((r) => r.id));
  const writes: { method: string; path: string }[] = [];
  let failLoads = false;
  const reply = (status: number, body: unknown) =>
    Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'GET') {
        if (failLoads) return reply(500, { error: '서버 오류가 발생했습니다' });
        return reply(200, {
          date: '2026-11-10',
          today: '2026-11-10',
          previousDate: '2026-11-09',
          nextDate: null,
          period: { start: periodStart, end: '2026-11-14' },
          remainingDays: options.remainingDays ?? 4,
          endsSoon: options.endsSoon ?? true,
          items: routines.map((r) => ({ id: r.id, name: r.name, checked: checks.has(r.id) })),
        });
      }
      writes.push({ method, path: url });
      if (failNextSave) {
        failNextSave = false;
        return reply(500, { error: '서버 오류가 발생했습니다' });
      }
      const id = url.split('/')[3];
      if (!routines.some((r) => r.id === id))
        return reply(404, { error: '루틴을 찾을 수 없습니다' });
      if (method === 'PUT') checks.add(id);
      else checks.delete(id);
      return reply(200, {});
    }),
  );
  return {
    writes,
    failLoads: (on = true) => (failLoads = on),
    failNextSave: () => (failNextSave = true),
    archiveElsewhere: (id: string) => (routines = routines.filter((r) => r.id !== id)),
    setPeriodStart: (date: string) => (periodStart = date),
  };
}

const flush = () => act(() => new Promise((resolve) => setTimeout(resolve)));
const showPageAgain = () =>
  act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((resolve) => setTimeout(resolve));
  });
const seed = [
  { id: '1', name: '이불빨래' },
  { id: '2', name: '소모품 교체', checked: true },
];

test('outside the last 7 days nothing is shown', async () => {
  dueApi(seed, { endsSoon: false, remainingDays: 7 });
  render(<FourWeekDue />);
  await flush();
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
});

test('in the last 7 days only unfinished routines are shown with the days left', async () => {
  dueApi(seed);
  render(<FourWeekDue />);
  expect(await screen.findByRole('checkbox', { name: '이불빨래' })).not.toBeChecked();
  expect(screen.queryByRole('checkbox', { name: '소모품 교체' })).not.toBeInTheDocument();
  expect(screen.getByRole('region', { name: '곧 끝나는 4주 루틴 체크리스트' })).toBeVisible();
  expect(screen.getByText('2026-11-14까지입니다. 4일 남았습니다')).toBeInTheDocument();
});

test('the last day says so', async () => {
  dueApi(seed, { remainingDays: 0 });
  render(<FourWeekDue />);
  expect(
    await screen.findByText('2026-11-14까지입니다. 오늘이 마지막 날입니다'),
  ).toBeInTheDocument();
});

test('a checked box stays to be undone, even after a reload, and leaving the page drops it', async () => {
  const api = dueApi(seed);
  const { unmount } = render(<FourWeekDue />);
  fireEvent.click(await screen.findByRole('checkbox', { name: '이불빨래' }));
  await flush();
  expect(api.writes).toEqual([{ method: 'PUT', path: '/api/routines/1/checks/2026-11-10' }]);
  expect(screen.getByRole('checkbox', { name: '이불빨래' })).toBeChecked();

  fireEvent.click(screen.getByRole('checkbox', { name: '이불빨래' }));
  await flush();
  expect(api.writes.at(-1)?.method).toBe('DELETE');
  expect(screen.getByRole('checkbox', { name: '이불빨래' })).not.toBeChecked();

  fireEvent.click(screen.getByRole('checkbox', { name: '이불빨래' }));
  await flush();
  await showPageAgain();
  expect(screen.getByRole('checkbox', { name: '이불빨래' })).toBeChecked();
  unmount();
  render(<FourWeekDue />);
  await flush();
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
});

test('with everything finished nothing is shown', async () => {
  dueApi([{ id: '2', name: '소모품 교체', checked: true }]);
  render(<FourWeekDue />);
  await flush();
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
});

test('a failed load shows the Korean error and can be retried', async () => {
  const api = dueApi(seed);
  api.failLoads();
  render(<FourWeekDue />);
  expect(await screen.findByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다');
  api.failLoads(false);
  fireEvent.click(screen.getByRole('button', { name: '4주 루틴 다시 불러오기' }));
  expect(await screen.findByRole('checkbox', { name: '이불빨래' })).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '4주 루틴 다시 불러오기' })).not.toBeInTheDocument();
});

test('a reload that fails while the card is showing keeps it and offers a retry', async () => {
  const api = dueApi(seed);
  render(<FourWeekDue />);
  await screen.findByRole('checkbox', { name: '이불빨래' });
  api.failLoads();
  await showPageAgain();
  expect(screen.getByRole('checkbox', { name: '이불빨래' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '4주 루틴 다시 불러오기' })).toBeInTheDocument();
});

test('a failed save restores the box and shows the Korean error', async () => {
  const api = dueApi(seed);
  render(<FourWeekDue />);
  const target = await screen.findByRole('checkbox', { name: '이불빨래' });
  api.failNextSave();
  fireEvent.click(target);
  await flush();
  expect(screen.getByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다');
  expect(screen.getByRole('checkbox', { name: '이불빨래' })).not.toBeChecked();
});

test('the Korean 404 stays when the only routine was archived elsewhere', async () => {
  const api = dueApi([{ id: '1', name: '이불빨래' }]);
  render(<FourWeekDue />);
  const target = await screen.findByRole('checkbox', { name: '이불빨래' });
  api.archiveElsewhere('1');
  fireEvent.click(target);
  await flush();
  expect(screen.getByRole('alert')).toHaveTextContent('루틴을 찾을 수 없습니다');
  expect(screen.queryByRole('checkbox', { name: '이불빨래' })).not.toBeInTheDocument();
});

test('a box checked in one period is not kept in the next', async () => {
  const api = dueApi(seed);
  render(<FourWeekDue />);
  fireEvent.click(await screen.findByRole('checkbox', { name: '이불빨래' }));
  await flush();
  api.setPeriodStart('2026-11-15');
  await showPageAgain();
  // The fake API keeps the check, so only the new period makes the card drop it.
  expect(screen.queryByRole('checkbox', { name: '이불빨래' })).not.toBeInTheDocument();
});

afterEach(() => {
  vi.useRealTimers();
});

test('a check after the period ended is not saved to it', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(new Date('2026-11-14T03:00:00Z'));
  const api = dueApi(seed);
  render(<FourWeekDue />);
  const target = await screen.findByRole('checkbox', { name: '이불빨래' });

  vi.setSystemTime(new Date('2026-11-15T03:00:00Z'));
  fireEvent.click(target);
  await flush();
  expect(api.writes).toEqual([]);
  expect(screen.getByRole('status')).toHaveTextContent('날짜가 바뀌어 새 기간을 불러왔습니다');
});

test('its heading is a level below the page title', async () => {
  dueApi(seed);
  render(<FourWeekDue />);
  expect(
    await screen.findByRole('heading', { level: 2, name: /곧 끝나는 4주 루틴/ }),
  ).toBeVisible();
});
