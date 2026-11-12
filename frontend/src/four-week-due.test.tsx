import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { FourWeekDue } from './four-week-due';

type Seed = { id: string; name: string; checked?: boolean };

// A fake checklist API with state. A plain object rather than a Response resolves in microtasks only.
function dueApi(seed: Seed[], options: { endsSoon?: boolean; remainingDays?: number } = {}) {
  let routines = seed;
  let periodStart = '2026-10-18';
  let failNextSave = false;
  let endsSoon = options.endsSoon ?? true;
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
        if (failLoads) return reply(500, { error: 'A server error occurred' });
        return reply(200, {
          date: '2026-11-10',
          today: '2026-11-10',
          previousDate: '2026-11-09',
          nextDate: null,
          period: { start: periodStart, end: '2026-11-14' },
          remainingDays: options.remainingDays ?? 4,
          endsSoon,
          items: routines.map((r) => ({ id: r.id, name: r.name, checked: checks.has(r.id) })),
        });
      }
      writes.push({ method, path: url });
      if (failNextSave) {
        failNextSave = false;
        return reply(500, { error: 'A server error occurred' });
      }
      const id = url.split('/')[3];
      if (!routines.some((r) => r.id === id)) return reply(404, { error: 'Routine not found' });
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
    setEndsSoon: (value: boolean) => (endsSoon = value),
  };
}

const flush = () => act(() => new Promise((resolve) => setTimeout(resolve)));
const showPageAgain = () =>
  act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((resolve) => setTimeout(resolve));
  });
const seed = [
  { id: '1', name: 'Wash bedding' },
  { id: '2', name: 'Replace supplies', checked: true },
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
  expect(await screen.findByRole('checkbox', { name: 'Wash bedding' })).not.toBeChecked();
  expect(screen.queryByRole('checkbox', { name: 'Replace supplies' })).not.toBeInTheDocument();
  expect(
    screen.getByRole('region', { name: '4-week routines ending soon checklist' }),
  ).toBeVisible();
  expect(screen.getByText('Ends November 14, 2026. 4 days left')).toBeInTheDocument();
});

test('the last day says so', async () => {
  dueApi(seed, { remainingDays: 0 });
  render(<FourWeekDue />);
  expect(
    await screen.findByText('Ends November 14, 2026. Today is the last day'),
  ).toBeInTheDocument();
});

test('a checked box stays to be undone, even after a reload, and leaving the page drops it', async () => {
  const api = dueApi(seed);
  const { unmount } = render(<FourWeekDue />);
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Wash bedding' }));
  await flush();
  expect(api.writes).toEqual([{ method: 'PUT', path: '/api/routines/1/checks/2026-11-10' }]);
  expect(screen.getByRole('checkbox', { name: 'Wash bedding' })).toBeChecked();

  fireEvent.click(screen.getByRole('checkbox', { name: 'Wash bedding' }));
  await flush();
  expect(api.writes.at(-1)?.method).toBe('DELETE');
  expect(screen.getByRole('checkbox', { name: 'Wash bedding' })).not.toBeChecked();

  fireEvent.click(screen.getByRole('checkbox', { name: 'Wash bedding' }));
  await flush();
  await showPageAgain();
  expect(screen.getByRole('checkbox', { name: 'Wash bedding' })).toBeChecked();
  unmount();
  render(<FourWeekDue />);
  await flush();
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
});

test('with everything finished nothing is shown', async () => {
  dueApi([{ id: '2', name: 'Replace supplies', checked: true }]);
  render(<FourWeekDue />);
  await flush();
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
});

test('a failed load shows the English error and can be retried', async () => {
  const api = dueApi(seed);
  api.failLoads();
  render(<FourWeekDue />);
  expect(await screen.findByRole('alert')).toHaveTextContent('A server error occurred');
  api.failLoads(false);
  fireEvent.click(screen.getByRole('button', { name: 'Reload 4-week routines' }));
  expect(await screen.findByRole('checkbox', { name: 'Wash bedding' })).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Reload 4-week routines' })).not.toBeInTheDocument();
});

test('a reload that fails while the card is showing keeps it and offers a retry', async () => {
  const api = dueApi(seed);
  render(<FourWeekDue />);
  await screen.findByRole('checkbox', { name: 'Wash bedding' });
  api.failLoads();
  await showPageAgain();
  expect(screen.getByRole('checkbox', { name: 'Wash bedding' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reload 4-week routines' })).toBeInTheDocument();
});

test('a failed save restores the box and shows the English error', async () => {
  const api = dueApi(seed);
  render(<FourWeekDue />);
  const target = await screen.findByRole('checkbox', { name: 'Wash bedding' });
  api.failNextSave();
  fireEvent.click(target);
  await flush();
  expect(screen.getByRole('alert')).toHaveTextContent('A server error occurred');
  expect(screen.getByRole('checkbox', { name: 'Wash bedding' })).not.toBeChecked();
});

test('the English 404 stays when the only routine was archived elsewhere', async () => {
  const api = dueApi([{ id: '1', name: 'Wash bedding' }]);
  render(<FourWeekDue />);
  const target = await screen.findByRole('checkbox', { name: 'Wash bedding' });
  api.archiveElsewhere('1');
  fireEvent.click(target);
  await flush();
  expect(screen.getByRole('alert')).toHaveTextContent('Routine not found');
  expect(screen.queryByRole('checkbox', { name: 'Wash bedding' })).not.toBeInTheDocument();
});

test('a box checked in one period is not kept in the next', async () => {
  const api = dueApi(seed);
  render(<FourWeekDue />);
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Wash bedding' }));
  await flush();
  api.setPeriodStart('2026-11-15');
  await showPageAgain();
  // The fake API keeps the check, so only the new period makes the card drop it.
  expect(screen.queryByRole('checkbox', { name: 'Wash bedding' })).not.toBeInTheDocument();
});

test('a check after the period ended is not saved to it', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(new Date('2026-11-14T03:00:00Z'));
  const api = dueApi(seed);
  render(<FourWeekDue />);
  const target = await screen.findByRole('checkbox', { name: 'Wash bedding' });

  vi.setSystemTime(new Date('2026-11-15T03:00:00Z'));
  fireEvent.click(target);
  await flush();
  expect(api.writes).toEqual([]);
  expect(screen.getByRole('status')).toHaveTextContent(
    'The date changed and a new period was loaded',
  );
});

test('the refusal message does not stay once the new period has no card', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(new Date('2026-11-14T03:00:00Z'));
  const api = dueApi(seed);
  render(<FourWeekDue />);
  const target = await screen.findByRole('checkbox', { name: 'Wash bedding' });

  vi.setSystemTime(new Date('2026-11-15T03:00:00Z'));
  api.setEndsSoon(false);
  fireEvent.click(target);
  await flush();
  expect(api.writes).toEqual([]);
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

test('its heading is a level below the page title', async () => {
  dueApi(seed);
  render(<FourWeekDue />);
  expect(
    await screen.findByRole('heading', { level: 2, name: /4-week routines ending soon/ }),
  ).toBeVisible();
});
