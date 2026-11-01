import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { Stats } from './stats';

const tally = (start: string, end: string, checked: number, total: number) => ({
  start,
  end,
  checked,
  total,
});

const dailyItem = {
  id: '1',
  name: '6시 기상',
  cadence: 'daily',
  category: 'wake',
  sortOrder: 0,
  archived: false,
  checked: 1,
  total: 2,
  periods: [
    { start: '2026-10-22', end: '2026-10-22', status: 'open' },
    { start: '2026-10-21', end: '2026-10-21', status: 'missed' },
    { start: '2026-10-20', end: '2026-10-20', status: 'done' },
    { start: '2026-10-19', end: '2026-10-19', status: 'none' },
  ],
};
const weeklyItem = {
  id: '2',
  name: '청소',
  cadence: 'weekly',
  category: null,
  sortOrder: 0,
  archived: true,
  checked: 0,
  total: 0,
  periods: [{ start: '2026-10-18', end: '2026-10-24', status: 'none' }],
};
const full = {
  today: '2026-10-22',
  daily: {
    weeks: [tally('2026-10-18', '2026-10-24', 2, 3), tally('2026-10-11', '2026-10-17', 0, 0)],
    months: [{ month: '2026-10', ...tally('2026-10-01', '2026-10-31', 7, 7) }],
  },
  weekly: [tally('2026-10-18', '2026-10-24', 0, 2)],
  fourWeek: [tally('2026-10-18', '2026-11-14', 0, 0)],
  twelveWeek: [tally('2026-10-18', '2027-01-09', 1, 4)],
  items: [dailyItem, weeklyItem],
};

// A plain object rather than a Response resolves in microtasks only, so flush() is exact.
function statsApi(body: unknown = full) {
  let answer = body;
  let failing = false;
  let held: (() => void) | null = null;
  let holdNext = false;
  const calls = vi.fn();
  const reply = (status: number, value: unknown) =>
    Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(value) });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      calls(url, init?.method ?? 'GET');
      if (failing) return reply(500, { error: '서버 오류가 발생했습니다' });
      const response = reply(200, answer);
      if (!holdNext) return response;
      holdNext = false;
      return new Promise((resolve) => {
        held = () => resolve(response);
      });
    }),
  );
  return {
    calls,
    setAnswer: (value: unknown) => (answer = value),
    fail: (value = true) => (failing = value),
    holdNext: () => (holdNext = true),
    release: () => held?.(),
  };
}

const flush = () => act(() => new Promise((resolve) => setTimeout(resolve)));
const rates = (title: string) => screen.getByRole('region', { name: `${title} 달성률` });
const showPageAgain = () =>
  act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((resolve) => setTimeout(resolve));
  });

test('each cadence shows its rate with the counts behind it', async () => {
  statsApi();
  render(<Stats />);
  await flush();
  expect(within(rates('하루 루틴 주별')).getByText(/^67%/)).toHaveTextContent('2/3');
  expect(within(rates('하루 루틴 월별')).getByText(/^100%/)).toHaveTextContent('7/7');
  expect(within(rates('주간 루틴')).getByText(/^0%/)).toHaveTextContent('0/2');
  expect(within(rates('12주 루틴')).getByText(/^25%/)).toHaveTextContent('1/4');
});

test('a period with nothing to count says no record rather than 0%', async () => {
  statsApi();
  render(<Stats />);
  await flush();
  expect(within(rates('4주 루틴')).getByText('기록 없음')).toBeInTheDocument();
  expect(within(rates('4주 루틴')).queryByText(/%/)).not.toBeInTheDocument();
  expect(within(rates('하루 루틴 주별')).getByText('기록 없음')).toBeInTheDocument();
});

test('a real 0% stays different from no record', async () => {
  statsApi();
  render(<Stats />);
  await flush();
  expect(within(rates('주간 루틴')).queryByText('기록 없음')).not.toBeInTheDocument();
});

test('each routine shows its rate and history, oldest first, with every state in words', async () => {
  statsApi();
  render(<Stats />);
  await flush();
  // In words, in the list that opens under the row, rather than only in a hover title.
  const history = within(screen.getByRole('list', { name: '6시 기상 최근 이력', hidden: true }));
  expect(history.getAllByRole('listitem', { hidden: true }).map((row) => row.textContent)).toEqual([
    '2026-10-19대상 아님',
    '2026-10-20완료',
    '2026-10-21미완료',
    '2026-10-22진행 중',
  ]);
  expect(screen.getByText('6시 기상 기간별로 보기').tagName).toBe('SUMMARY');
  const card = within(screen.getByRole('region', { name: '기상 이력' }));
  expect(card.getByText('6시 기상')).toBeInTheDocument();
  expect(card.getByText(/^50%/)).toHaveTextContent('1/2');
});

test('an archived routine is marked, and one with nothing to count says so', async () => {
  statsApi();
  render(<Stats />);
  await flush();
  const card = within(screen.getByRole('region', { name: '주간 루틴 이력' }));
  expect(card.getByText('보관됨')).toBeInTheDocument();
  expect(card.getByText('기록 없음')).toBeInTheDocument();
});

test('with no routines at all it says there is no history yet', async () => {
  statsApi({ ...full, items: [] });
  render(<Stats />);
  await flush();
  expect(screen.getByText('아직 이력이 없습니다')).toBeInTheDocument();
});

test('the bar length matches the rate', async () => {
  statsApi();
  const { container } = render(<Stats />);
  await flush();
  const widths = [...container.querySelectorAll<HTMLElement>('span.bg-primary')].map(
    (bar) => bar.style.width,
  );
  expect(widths).toEqual(expect.arrayContaining(['67%', '100%', '0%', '25%']));
});

test('rounding never claims all or nothing while neither is true', async () => {
  statsApi({
    ...full,
    weekly: [
      tally('2026-10-18', '2026-10-24', 216, 217),
      tally('2026-10-11', '2026-10-17', 1, 217),
      tally('2026-10-04', '2026-10-10', 217, 217),
      tally('2026-09-27', '2026-10-03', 0, 217),
    ],
  });
  render(<Stats />);
  await flush();
  const rows = within(rates('주간 루틴'))
    .getAllByRole('listitem')
    .map((row) => row.textContent);
  expect(rows[0]).toContain('99%');
  expect(rows[1]).toContain('1%');
  expect(rows[2]).toContain('100%');
  expect(rows[3]).toContain('0%');
});

test('this page only reads', async () => {
  const api = statsApi();
  render(<Stats />);
  await flush();
  expect(api.calls.mock.calls.every(([, method]) => method === 'GET')).toBe(true);
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});

test('a failed first load offers a retry', async () => {
  const api = statsApi();
  api.fail();
  render(<Stats />);
  await flush();
  expect(screen.getByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다');
  api.fail(false);
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  await flush();
  expect(rates('주간 루틴')).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('a failed reload keeps what is on screen and offers a retry', async () => {
  const api = statsApi();
  render(<Stats />);
  await flush();
  api.fail();
  await showPageAgain();
  expect(screen.getByRole('alert')).toBeInTheDocument();
  expect(rates('주간 루틴')).toBeVisible();
  expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
});

test('a page shown again picks up new numbers', async () => {
  const api = statsApi();
  render(<Stats />);
  await flush();
  api.setAnswer({ ...full, weekly: [tally('2026-10-18', '2026-10-24', 1, 2)] });
  await showPageAgain();
  expect(within(rates('주간 루틴')).getByText(/^50%/)).toHaveTextContent('1/2');
});

test('a slow older answer does not replace a newer one', async () => {
  const api = statsApi();
  render(<Stats />);
  await flush();
  api.holdNext();
  await showPageAgain();
  api.setAnswer({ ...full, weekly: [tally('2026-10-18', '2026-10-24', 2, 2)] });
  await showPageAgain();
  expect(within(rates('주간 루틴')).getByText(/^100%/)).toBeInTheDocument();
  api.release();
  await flush();
  expect(within(rates('주간 루틴')).getByText(/^100%/)).toBeInTheDocument();
});

test('an open window reloads when the date changes, and not before', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(new Date('2026-10-22T03:00:00Z'));
  const api = statsApi();
  render(<Stats />);
  await flush();
  const before = api.calls.mock.calls.length;
  await act(async () => {
    vi.advanceTimersByTime(5 * 60_000);
    await new Promise((resolve) => setTimeout(resolve));
  });
  expect(api.calls.mock.calls.length).toBe(before);
  vi.setSystemTime(new Date('2026-10-23T03:00:00Z'));
  api.setAnswer({ ...full, today: '2026-10-23' });
  await act(async () => {
    vi.advanceTimersByTime(60_000);
    await new Promise((resolve) => setTimeout(resolve));
  });
  expect(api.calls.mock.calls.length).toBe(before + 1);
});
