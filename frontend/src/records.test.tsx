import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { formatDate } from './format-date';
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
        routine('1', 'Wake at 6', 'wake', true),
        routine('2', 'Routine from then', 'exercise', false, true),
      ],
      diary: {
        body: 'A good day',
        goodNote: 'Woke up early',
        regretNote: null,
        tomorrowNote: null,
      },
    },
    [today]: {
      progress: { checked: 0, total: 1 },
      routines: [routine('1', 'Wake at 6', 'wake', false)],
      diary: null,
    },
  };
  const calls: { method: string; url: string }[] = [];
  let serverToday = today;
  const held = new Map<string, () => void>();
  let failMonth = false;
  let failDay = false;
  const reply = (status: number, body: unknown) =>
    Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
  // An answer read now that arrives only at release(), as on a slow connection.
  const holding = (key: string, response: unknown) =>
    held.has(key)
      ? new Promise((resolve) => {
          held.set(key, () => resolve(response));
        })
      : response;
  const serverError = () => reply(500, { error: 'A server error occurred' });
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
        const response = reply(200, {
          today: serverToday,
          month,
          previousMonth: { '2026-10': '2026-09', '2026-09': '2026-08' }[month] ?? null,
          nextMonth: { '2026-08': '2026-09', '2026-09': '2026-10' }[month] ?? null,
          days:
            month === '2026-10'
              ? [
                  summary('2026-10-01'),
                  summary('2026-10-20', 1, 2, true),
                  summary('2026-10-21', 0, 1),
                  summary(today, 0, 1),
                  ...(serverToday === today ? [] : [summary(serverToday)]),
                ]
              : [summary(`${month}-01`, 1, 1)],
        });
        return holding(month, response);
      }
      if (failDay) {
        failDay = false;
        return serverError();
      }
      const date = path.pathname.split('/')[3];
      const response = reply(200, {
        date,
        today: serverToday,
        ...(days[date] ?? {
          progress: { checked: 0, total: 0 },
          routines: [],
          diary: null,
        }),
      });
      return holding(date, response);
    }),
  );
  return {
    calls,
    failMonth: () => (failMonth = true),
    failDay: () => (failDay = true),
    setToday: (date: string) => (serverToday = date),
    hold: (key: string) => held.set(key, () => {}),
    release: (key: string) => held.get(key)?.(),
  };
}

const flush = () => act(() => new Promise((resolve) => setTimeout(resolve)));
const dayButton = (date: string) =>
  screen.getByRole('button', { name: new RegExp(`^${formatDate(date, 'weekday')}: `) });
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

test('opens on this month and today, with each day summarised', async () => {
  recordsApi();
  render(<Records />);
  await flush();
  expect(screen.getByRole('region', { name: 'October 2026 calendar' })).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Tue, Oct 20: daily routines 1/2 done, diary written' }),
  ).toBeInTheDocument();
  expect(dayButton(today)).toHaveAttribute('aria-current', 'date');
  expect(dayButton(today)).toHaveAttribute('aria-pressed', 'true');
  expect(
    screen.getByRole('heading', { level: 2, name: `Today (${formatDate(today)})` }),
  ).toBeVisible();
  expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
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
  const record = screen.getByRole('region', { name: 'Records for October 20, 2026' });
  expect(within(record).getByText('Daily routines 1/2 done')).toBeInTheDocument();
  const items = within(record)
    .getAllByRole('listitem')
    .map((item) => item.textContent);
  expect(items[0]).toContain('Wake at 6');
  expect(items[0]).toContain('Done');
  expect(items[1]).toContain('Routine from then');
  expect(items[1]).toContain('Not done');
  expect(items[1]).toContain('Archived');
  expect(within(record).getByText('A good day')).toBeInTheDocument();
  expect(within(record).getByText('Woke up early')).toBeInTheDocument();
  expect(within(record).queryByText('What could be better')).not.toBeInTheDocument();
});

test('a day with no record says so', async () => {
  recordsApi();
  render(<Records />);
  await flush();
  fireEvent.click(dayButton('2026-10-01'));
  await flush();
  expect(screen.getByRole('heading', { level: 3, name: 'No records for this day' })).toBeVisible();
});

test('a day with routines but no diary says the diary was not written', async () => {
  recordsApi();
  render(<Records />);
  await flush();
  expect(screen.getByText('No diary entry for this day')).toBeInTheDocument();
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
  press('Previous month');
  await flush();
  expect(screen.getByRole('region', { name: 'September 2026 calendar' })).toBeVisible();
  expect(api.calls.map((call) => call.url)).toContain('/api/records?month=2026-09');
  expect(screen.getByRole('region', { name: 'Records for October 20, 2026' })).toBeVisible();
  press('Next month');
  await flush();
  expect(screen.getByRole('region', { name: 'October 2026 calendar' })).toBeVisible();
});

test('a slow answer for an earlier day does not replace the day chosen after it', async () => {
  const api = recordsApi();
  render(<Records />);
  await flush();
  api.hold('2026-10-20');
  fireEvent.click(dayButton('2026-10-20'));
  await flush();
  // Nothing from the previous day stays on screen while the next one loads.
  expect(screen.getByRole('region', { name: "Loading this day's records" })).toBeInTheDocument();
  fireEvent.click(dayButton('2026-10-01'));
  await flush();
  api.release('2026-10-20');
  await flush();
  expect(screen.getByRole('region', { name: 'Records for October 1, 2026' })).toBeVisible();
  expect(
    screen.queryByRole('region', { name: 'Records for October 20, 2026' }),
  ).not.toBeInTheDocument();
});

test('a slow answer for an earlier month does not replace the month chosen after it', async () => {
  const api = recordsApi();
  render(<Records />);
  await flush();
  press('Previous month');
  await flush();
  api.hold('2026-08');
  press('Previous month');
  await flush();
  press('Next month');
  await flush();
  expect(screen.getByRole('region', { name: 'October 2026 calendar' })).toBeVisible();
  api.release('2026-08');
  await flush();
  expect(screen.getByRole('region', { name: 'October 2026 calendar' })).toBeVisible();
});

const nextDay = (api: ReturnType<typeof recordsApi>) =>
  act(async () => {
    vi.setSystemTime(new Date('2026-10-23T03:00:00Z'));
    api.setToday('2026-10-23');
    vi.advanceTimersByTime(60_000);
    await new Promise((resolve) => setTimeout(resolve));
  });

test('a window left open moves on to the new day unless a day was picked', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(new Date('2026-10-22T03:00:00Z'));
  const api = recordsApi();
  render(<Records />);
  await flush();
  await nextDay(api);
  await flush();
  expect(screen.getByRole('heading', { level: 2, name: 'Today (October 23, 2026)' })).toBeVisible();
  expect(dayButton('2026-10-23')).toHaveAttribute('aria-pressed', 'true');
});

test('a picked day stays when the date changes', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(new Date('2026-10-22T03:00:00Z'));
  const api = recordsApi();
  render(<Records />);
  await flush();
  fireEvent.click(dayButton('2026-10-20'));
  await flush();
  await nextDay(api);
  await flush();
  expect(screen.getByRole('region', { name: 'Records for October 20, 2026' })).toBeVisible();
  expect(dayButton('2026-10-23')).toHaveAttribute('aria-current', 'date');
});

test('picking a day clears the error of an earlier failed day', async () => {
  const api = recordsApi();
  render(<Records />);
  await flush();
  api.failDay();
  fireEvent.click(dayButton('2026-10-20'));
  await flush();
  expect(screen.getByRole('alert')).toBeInTheDocument();
  fireEvent.click(dayButton('2026-10-01'));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  await flush();
  expect(screen.getByRole('region', { name: 'Records for October 1, 2026' })).toBeVisible();
});

test('picking the day that failed loads it again rather than waiting forever', async () => {
  const api = recordsApi();
  render(<Records />);
  await flush();
  api.failDay();
  fireEvent.click(dayButton('2026-10-20'));
  await flush();
  expect(screen.getByRole('alert')).toBeInTheDocument();
  fireEvent.click(dayButton('2026-10-20'));
  await flush();
  expect(screen.getByRole('region', { name: 'Records for October 20, 2026' })).toBeVisible();
  expect(
    screen.queryByRole('region', { name: "Loading this day's records" }),
  ).not.toBeInTheDocument();
});

test('the calendar heading is only the month, without its buttons', async () => {
  recordsApi();
  render(<Records />);
  await flush();
  expect(screen.getByRole('heading', { level: 2, name: 'October 2026' })).toBeVisible();
});

test('a failed first load offers a retry', async () => {
  const api = recordsApi();
  api.failMonth();
  render(<Records />);
  expect(await screen.findByRole('alert')).toHaveTextContent('A server error occurred');
  press('Try again');
  await flush();
  expect(screen.getByRole('region', { name: 'October 2026 calendar' })).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('a failed month move can be retried and keeps the calendar', async () => {
  const api = recordsApi();
  render(<Records />);
  await flush();
  api.failMonth();
  press('Previous month');
  await flush();
  expect(screen.getByRole('alert')).toHaveTextContent('A server error occurred');
  expect(screen.getByRole('region', { name: 'October 2026 calendar' })).toBeVisible();
  press('Try again');
  await flush();
  expect(screen.getByRole('region', { name: 'September 2026 calendar' })).toBeVisible();
});

test('a failed day load offers its own retry', async () => {
  const api = recordsApi();
  render(<Records />);
  await flush();
  api.failDay();
  fireEvent.click(dayButton('2026-10-20'));
  await flush();
  expect(screen.getByRole('alert')).toHaveTextContent('A server error occurred');
  press("Reload this day's records");
  await waitFor(() =>
    expect(screen.getByRole('region', { name: 'Records for October 20, 2026' })).toBeVisible(),
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
