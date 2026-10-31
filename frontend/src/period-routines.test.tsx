import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { FourWeekRoutines, WeeklyRoutines } from './period-routines';

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
  let failChecklistLoads = 0;
  let failListLoads = 0;
  const checks = new Set<string>();
  const writes: { method: string; path: string; body?: unknown }[] = [];
  const reply = (status: number, body: unknown) =>
    Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const path = url.split('?')[0];
      const serverError = () => reply(500, { error: '서버 오류가 발생했습니다' });
      if (method === 'GET' && path === '/api/routines') {
        if (failListLoads > 0) {
          failListLoads -= 1;
          return serverError();
        }
        return reply(200, { routines });
      }
      if (method === 'GET') {
        if (failChecklistLoads > 0) {
          failChecklistLoads -= 1;
          return serverError();
        }
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
      if (action === 'move') {
        const sorted = [...routines].sort((a, b) => a.sortOrder - b.sortOrder);
        const other = sorted[sorted.indexOf(found) + (body!.direction === 'up' ? -1 : 1)];
        if (other) [found.sortOrder, other.sortOrder] = [other.sortOrder, found.sortOrder];
        routines = [...routines].sort((a, b) => a.sortOrder - b.sortOrder);
      }
      if (method === 'PATCH') found.name = body!.name;
      return reply(200, {});
    }),
  );
  return {
    writes,
    checks,
    setToday: (date: string) => (today = date),
    failChecklistLoads: (count: number) => (failChecklistLoads = count),
    failListLoads: (count: number) => (failListLoads = count),
    addElsewhere: (name: string) => {
      routines = [
        ...routines,
        {
          id: String(nextId++),
          name,
          cadence: 'weekly',
          category: null,
          sortOrder: routines.length,
        },
      ];
    },
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

// The four-week page shares the weekly page's code, so only what differs is checked here.
function fourWeekApi(remainingDays: number) {
  const writes: { method: string; path: string; body?: unknown }[] = [];
  const routines = [
    { id: '1', name: '이불빨래', cadence: 'four_week', category: null, sortOrder: 0 },
  ];
  const reply = (body: unknown) =>
    Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method !== 'GET') {
        writes.push({
          method,
          path: url,
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        return reply({});
      }
      if (url.startsWith('/api/routines')) return reply({ url, routines });
      return reply({
        date: '2026-10-22',
        today: '2026-10-22',
        previousDate: '2026-10-21',
        nextDate: null,
        period: { start: '2026-10-18', end: '2026-11-14' },
        remainingDays,
        endsSoon: false,
        items: routines.map((r) => ({ ...r, checked: false })),
      });
    }),
  );
  return writes;
}

test('the four-week page shows its period and the days left', async () => {
  fourWeekApi(23);
  render(<FourWeekRoutines />);
  await box('이불빨래');
  expect(
    screen.getByRole('heading', { level: 2, name: '이번 4주 (2026-10-18 ~ 2026-11-14)' }),
  ).toBeVisible();
  expect(screen.getByText('23일 남았습니다')).toBeInTheDocument();
  expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual(
    expect.arrayContaining(['/api/routines?cadence=four_week', '/api/checklist?cadence=four_week']),
  );
});

test('the last day of a four-week period says so', async () => {
  fourWeekApi(0);
  render(<FourWeekRoutines />);
  expect(await screen.findByText('오늘이 마지막 날입니다')).toBeInTheDocument();
});

test('a four-week routine is added with its cadence and checked under the date', async () => {
  const writes = fourWeekApi(23);
  render(<FourWeekRoutines />);
  const input = await screen.findByRole('textbox', { name: '4주 새 루틴 이름' });
  expect(input).toHaveAttribute('placeholder', '예: 이불빨래, 소모품 교체, 대청소');
  fireEvent.change(input, { target: { value: '대청소' } });
  fireEvent.click(screen.getByRole('button', { name: '추가' }));
  await flush();
  expect(writes.at(-1)).toEqual({
    method: 'POST',
    path: '/api/routines',
    body: { name: '대청소', cadence: 'four_week' },
  });
  fireEvent.click(await box('이불빨래'));
  await flush();
  expect(writes.at(-1)).toEqual({
    method: 'PUT',
    path: '/api/routines/1/checks/2026-10-22',
    body: undefined,
  });
});

test('the weekly page does not show days left', async () => {
  weeklyApi(seed);
  render(<WeeklyRoutines />);
  await box('청소');
  expect(screen.queryByText(/남았습니다|마지막 날/)).not.toBeInTheDocument();
});

// Noon in Seoul. Only the clock and the interval are faked; flush() still uses a real timer.
const setClock = (date: string) => vi.setSystemTime(new Date(`${date}T03:00:00Z`));
const fakeClock = (date: string) => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  setClock(date);
};

test('the first check after the week changes goes to the new week', async () => {
  fakeClock('2026-10-24');
  const api = weeklyApi(seed);
  api.setToday('2026-10-24');
  render(<WeeklyRoutines />);
  await screen.findByRole('heading', { level: 2, name: '이번 주 (2026-10-18 ~ 2026-10-24)' });

  setClock('2026-10-25');
  api.setToday('2026-10-25');
  fireEvent.click(await box('청소'));
  await flush();
  expect(api.checks).toEqual(new Set());
  expect(
    screen.getByRole('heading', { level: 2, name: '이번 주 (2026-10-25 ~ 2026-10-31)' }),
  ).toBeVisible();
  expect(screen.getByText(/날짜가 바뀌어 새 기간을 불러왔습니다/)).toBeInTheDocument();

  fireEvent.click(await box('청소'));
  await flush();
  expect(api.checks).toEqual(new Set(['2/2026-10-25']));
});

test('a device clock ahead of the server still reaches the new week', async () => {
  fakeClock('2026-10-24');
  const api = weeklyApi(seed);
  api.setToday('2026-10-24');
  render(<WeeklyRoutines />);
  await box('청소');
  const nextCheck = () =>
    act(async () => {
      vi.advanceTimersByTime(60_000);
      await new Promise((resolve) => setTimeout(resolve));
    });

  // The device reaches Sunday first; the server still answers with last week.
  setClock('2026-10-25');
  await nextCheck();
  expect(
    screen.getByRole('heading', { level: 2, name: '이번 주 (2026-10-18 ~ 2026-10-24)' }),
  ).toBeVisible();

  // Then the server reaches Sunday too.
  api.setToday('2026-10-25');
  await nextCheck();
  expect(
    screen.getByRole('heading', { level: 2, name: '이번 주 (2026-10-25 ~ 2026-10-31)' }),
  ).toBeVisible();
  fireEvent.click(await box('청소'));
  await flush();
  expect(api.checks).toEqual(new Set(['2/2026-10-25']));
});

test('a day change inside the same week saves at once', async () => {
  fakeClock('2026-10-22');
  const api = weeklyApi(seed);
  render(<WeeklyRoutines />);
  await box('청소');

  setClock('2026-10-23');
  api.setToday('2026-10-23');
  fireEvent.click(await box('청소'));
  await flush();
  expect(api.checks).toEqual(new Set(['2/2026-10-18']));
  expect(screen.queryByText(/날짜가 바뀌어/)).not.toBeInTheDocument();
});

test('the first check after a four-week period ends is not saved to it', async () => {
  fakeClock('2026-11-15');
  const writes = fourWeekApi(0);
  render(<FourWeekRoutines />);
  await box('이불빨래');
  // The fake period ended on 2026-11-14, before this device's date, but this load was on 11-15:
  // the screen is what was loaded today, so the check is saved.
  fireEvent.click(await box('이불빨래'));
  await flush();
  expect(writes).toHaveLength(1);

  setClock('2026-11-16');
  fireEvent.click(await box('이불빨래'));
  await flush();
  expect(writes).toHaveLength(1);
  expect(screen.getByText(/날짜가 바뀌어 새 기간을 불러왔습니다/)).toBeInTheDocument();
});

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

const manage = () => screen.getByRole('region', { name: '주간 루틴 관리' });
const checklistNames = () =>
  within(thisWeek())
    .getAllByRole('checkbox')
    .map((checkbox) => within(checkbox.closest('li')!).getByText(/./).textContent);

test('renaming and reordering show in the checklist too', async () => {
  const api = weeklyApi(seed);
  render(<WeeklyRoutines />);
  await box('청소');
  fireEvent.click(screen.getByRole('button', { name: '청소 위로 이동' }));
  await flush();
  expect(api.writes.at(-1)).toEqual({
    method: 'POST',
    path: '/api/routines/2/move',
    body: { direction: 'up' },
  });
  expect(checklistNames()).toEqual(['청소', '독후감 쓰기', '가계부 쓰기']);

  fireEvent.click(screen.getByRole('button', { name: '청소 이름 수정' }));
  fireEvent.change(screen.getByRole('textbox', { name: '청소 새 이름' }), {
    target: { value: '대청소' },
  });
  fireEvent.click(within(manage()).getByRole('button', { name: '저장' }));
  await flush();
  expect(checklistNames()).toEqual(['대청소', '독후감 쓰기', '가계부 쓰기']);
});

test('a page shown again picks up routines added elsewhere in both lists', async () => {
  const api = weeklyApi(seed);
  render(<WeeklyRoutines />);
  await box('청소');
  api.addElsewhere('가계부 정리');
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
  });
  expect(await box('가계부 정리')).toBeInTheDocument();
  expect(within(manage()).getByText('가계부 정리')).toBeInTheDocument();
});

test('a reload that fails after the first load offers a retry', async () => {
  const api = weeklyApi();
  render(<WeeklyRoutines />);
  await screen.findByText('이번 주에 체크할 루틴이 없습니다');
  api.failChecklistLoads(1);
  fireEvent.change(screen.getByRole('textbox', { name: '주간 새 루틴 이름' }), {
    target: { value: '청소' },
  });
  fireEvent.click(screen.getByRole('button', { name: '추가' }));
  await flush();
  expect(screen.queryByRole('checkbox', { name: '청소' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  expect(await box('청소')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument();
});

test('a failed list load offers its own retry instead of claiming the list is empty', async () => {
  const api = weeklyApi(seed);
  api.failListLoads(1);
  render(<WeeklyRoutines />);
  await flush();
  expect(within(manage()).queryByText('아직 루틴이 없습니다')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '목록 다시 불러오기' }));
  await flush();
  expect(screen.getByRole('button', { name: '청소 보관' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '목록 다시 불러오기' })).not.toBeInTheDocument();
  expect(within(manage()).queryByRole('alert')).toBeEmptyDOMElement();
});

test('a list reload that fails with routines on screen offers a retry', async () => {
  const api = weeklyApi(seed);
  render(<WeeklyRoutines />);
  await box('청소');
  api.failListLoads(1);
  fireEvent.change(screen.getByRole('textbox', { name: '주간 새 루틴 이름' }), {
    target: { value: '가계부 정리' },
  });
  fireEvent.click(screen.getByRole('button', { name: '추가' }));
  await flush();
  expect(within(manage()).queryByText('가계부 정리')).not.toBeInTheDocument();
  expect(within(manage()).getByText('청소')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '목록 다시 불러오기' }));
  await flush();
  expect(within(manage()).getByText('가계부 정리')).toBeInTheDocument();
  expect(api.writes.filter((write) => write.path === '/api/routines')).toHaveLength(1);
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
  // The routine list reloads as well, so it no longer offers buttons that would fail again.
  expect(screen.queryByRole('button', { name: '청소 보관' })).not.toBeInTheDocument();
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
