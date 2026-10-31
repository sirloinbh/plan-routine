import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { FourWeekDue } from './four-week-due';

type Seed = { id: string; name: string; checked?: boolean };

// A fake checklist API with state. A plain object rather than a Response resolves in microtasks only.
function dueApi(seed: Seed[], options: { endsSoon?: boolean; remainingDays?: number } = {}) {
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
          period: { start: '2026-10-18', end: '2026-11-14' },
          remainingDays: options.remainingDays ?? 4,
          endsSoon: options.endsSoon ?? true,
          items: seed.map((r) => ({ id: r.id, name: r.name, checked: checks.has(r.id) })),
        });
      }
      writes.push({ method, path: url });
      const id = url.split('/')[3];
      if (method === 'PUT') checks.add(id);
      else checks.delete(id);
      return reply(200, {});
    }),
  );
  return { writes, failLoads: () => (failLoads = true) };
}

const flush = () => act(() => new Promise((resolve) => setTimeout(resolve)));
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

test('a checked box stays to be undone, and the next visit drops it', async () => {
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

test('a failed load shows the Korean error', async () => {
  dueApi(seed).failLoads();
  render(<FourWeekDue />);
  expect(await screen.findByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다');
});
