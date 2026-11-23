import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { formatDate } from './format-date';
import { Records } from './records';
import { findLive, getLive, queryLive } from './test/live';
import { render } from './test/render';
import { takeUnexpected, unexpectedRequest } from './test/unexpected-request';

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
        { ...routine('3', 'Squats', 'exercise', false), skipped: true, skipReason: 'Knee hurts' },
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
  // key -> the release of a request that has arrived, or null while it is only expected.
  const held = new Map<string, (() => void) | null>();
  let failMonth = false;
  let failDay = false;
  const reply = (status: number, body: unknown) =>
    Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
  // An answer read now that arrives only at release(), as on a slow connection.
  const holding = (key: string, response: unknown) =>
    held.has(key)
      ? new Promise((resolve) => {
          held.set(key, () => {
            held.delete(key);
            resolve(response);
          });
        })
      : response;
  const serverError = () => reply(500, { error: 'A server error occurred' });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      calls.push({ method: init?.method ?? 'GET', url });
      const path = new URL(url, 'http://localhost');
      const known = /^\/api\/records(\/\d{4}-\d{2}-\d{2})?$/.test(path.pathname);
      if ((init?.method ?? 'GET') !== 'GET' || !known)
        return unexpectedRequest(init?.method ?? 'GET', url);
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
    setDay: (date: string, value: unknown) => (days[date] = value),
    hold: (key: string) => held.set(key, null),
    release: (key: string) => {
      const release = held.get(key);
      if (!release) {
        throw new Error(
          held.has(key)
            ? `release('${key}'): the held request has not arrived yet; flush before releasing`
            : `release('${key}'): nothing is held for it; call hold('${key}') first`,
        );
      }
      release();
    },
  };
}

// The query layer tells the screen about a result one timer tick after the answer arrives, and the first day
// loads only after the month has told the screen which day is today.
const tick = () => new Promise((resolve) => setTimeout(resolve));
const flush = () =>
  act(async () => {
    for (let i = 0; i < 4; i += 1) await tick();
  });
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

// The search results link to /records?date=YYYY-MM-DD; Records reads it once, when it opens.
async function openAt(search: string) {
  window.history.replaceState(null, '', `/records${search}`);
  try {
    const api = recordsApi();
    render(<Records />);
    await flush();
    return api;
  } finally {
    window.history.replaceState(null, '', '/');
  }
}

test('?date= opens that day in its month', async () => {
  const { calls } = await openAt('?date=2026-09-05');
  expect(calls.map((call) => call.url)).toEqual([
    '/api/records?month=2026-09',
    '/api/records/2026-09-05',
  ]);
  expect(screen.getByRole('region', { name: 'Records for September 5, 2026' })).toBeInTheDocument();
});

test.each(['?date=nope', '?date=2026-02-30', '?date=2999-01-01', '?date=1999-12-31', ''])(
  'a missing or unusable date (%s) opens this month and today as usual',
  async (search) => {
    const { calls } = await openAt(search);
    expect(calls.map((call) => call.url)).toEqual(['/api/records', '/api/records/2026-10-22']);
  },
);

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
  // A skipped routine is shown as skipped with its reason, and is not in the 1/2 above.
  expect(items[2]).toContain('Squats');
  expect(items[2]).toContain('Skipped');
  expect(items[2]).toContain('Reason: Knee hurts');
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

test('moving to another month drops a day outside it and loads only the month', async () => {
  const api = recordsApi();
  render(<Records />);
  await flush();
  fireEvent.click(dayButton('2026-10-20'));
  await flush();
  const before = api.calls.length;
  press('Previous month');
  await flush();
  expect(screen.getByRole('region', { name: 'September 2026 calendar' })).toBeVisible();
  // One month request, and no day request.
  expect(api.calls.slice(before).map((call) => call.url)).toEqual(['/api/records?month=2026-09']);
  expect(screen.queryByRole('region', { name: /^Records for / })).not.toBeInTheDocument();
  expect(screen.getByText('Choose a day to see its records')).toBeVisible();
  expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0);
  press('Next month');
  await flush();
  expect(screen.getByRole('region', { name: 'October 2026 calendar' })).toBeVisible();
  // Back in the current month, today's records show again.
  expect(
    screen.getByRole('region', { name: `Records for ${formatDate(today, 'long')}` }),
  ).toBeVisible();
});

test('re-choosing the shown day reloads the day but not the month', async () => {
  const api = recordsApi();
  render(<Records />);
  await flush();
  fireEvent.click(dayButton('2026-10-20'));
  await flush();
  const before = api.calls.length;
  fireEvent.click(dayButton('2026-10-20'));
  await flush();
  expect(api.calls.slice(before).map((call) => call.url)).toEqual(['/api/records/2026-10-20']);
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
    await tick();
    await tick();
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
  expect(getLive('alert')).toBeInTheDocument();
  fireEvent.click(dayButton('2026-10-01'));
  expect(queryLive('alert')).toBeNull();
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
  expect(getLive('alert')).toBeInTheDocument();
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
  expect(await findLive('alert')).toHaveTextContent('A server error occurred');
  press('Try again');
  await flush();
  expect(screen.getByRole('region', { name: 'October 2026 calendar' })).toBeVisible();
  expect(queryLive('alert')).toBeNull();
});

test('a failed month move can be retried and keeps the calendar', async () => {
  const api = recordsApi();
  render(<Records />);
  await flush();
  api.failMonth();
  press('Previous month');
  await flush();
  expect(getLive('alert')).toHaveTextContent('A server error occurred');
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
  expect(getLive('alert')).toHaveTextContent('A server error occurred');
  press("Reload this day's records");
  await waitFor(() =>
    expect(screen.getByRole('region', { name: 'Records for October 20, 2026' })).toBeVisible(),
  );
  expect(queryLive('alert')).toBeNull();
});

test('a page shown again loads the records once more', async () => {
  const api = recordsApi();
  render(<Records />);
  await flush();
  expect(screen.getByText('Daily routines 0/1 done')).toBeInTheDocument();
  // The server's answer changes while the page is hidden; showing the page again must bring the new data in.
  api.setDay(today, {
    progress: { checked: 1, total: 1 },
    routines: [routine('1', 'Wake at 6', 'wake', true)],
    diary: null,
  });
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
    await tick();
    await tick();
  });
  expect(await screen.findByText('Daily routines 1/1 done')).toBeInTheDocument();
  expect(screen.queryByText('Daily routines 0/1 done')).not.toBeInTheDocument();
});

test('the fake fails with a clear message when release() has nothing to release', () => {
  const api = recordsApi();
  expect(() => api.release('2026-10-20')).toThrow('nothing is held');
  api.hold('2026-10-20');
  expect(() => api.release('2026-10-20')).toThrow('has not arrived yet');
});

test('a request the fake does not know fails the test with a clear message', () => {
  recordsApi();
  expect(() => fetch('/api/unknown')).toThrow('Unexpected request: GET /api/unknown');
  // It is also remembered, so a screen that swallows the error still fails its test afterwards.
  expect(takeUnexpected()).toEqual(['GET /api/unknown']);
});
