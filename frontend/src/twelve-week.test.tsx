import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { TwelveWeek } from './twelve-week';

type Goal = {
  id: string;
  title: string;
  achieved: boolean | null;
  reviewNote: string | null;
  reviewedAt: string | null;
};

const pending = (id: string, title: string): Goal => ({
  id,
  title,
  achieved: null,
  reviewNote: null,
  reviewedAt: null,
});

const currentPeriod = { start: '2026-10-18', end: '2027-01-09' };
const lastPeriod = { start: '2026-07-26', end: '2026-10-17' };
const olderPeriod = { start: '2026-05-03', end: '2026-07-25' };

// A fake API with state, like the server. A plain object rather than a Response resolves in
// microtasks only, so flush() is exact. Answers are copies, as parsed JSON would be.
function goalsApi(seed: { current?: Goal[]; last?: Goal[]; older?: Goal[] } = {}) {
  let current = seed.current ?? [];
  let last = seed.last ?? [];
  let today = '2026-10-22';
  let goalLoads = 0;
  let heldReview: (() => void) | null = null;
  let holdNextReview = false;
  const older = seed.older ?? [];
  let nextId = 100;
  let failNextLoad = false;
  let failNextReview = false;
  const writes: { method: string; path: string; body?: unknown }[] = [];
  const routines = [
    { id: '50', name: '목표 재설정', cadence: 'twelve_week', category: null, sortOrder: 0 },
  ];
  const reply = (status: number, body: unknown) =>
    Promise.resolve({
      ok: status < 400,
      status,
      json: () => Promise.resolve(structuredClone(body)),
    });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (url.startsWith('/api/routines') && method === 'GET') return reply(200, { routines });
      if (url.startsWith('/api/checklist'))
        return reply(200, {
          date: '2026-10-22',
          today: '2026-10-22',
          previousDate: '2026-10-21',
          nextDate: null,
          period: currentPeriod,
          remainingDays: 79,
          endsSoon: false,
          items: routines.map((r) => ({ ...r, checked: false })),
        });
      if (method === 'GET') {
        goalLoads += 1;
        if (failNextLoad) {
          failNextLoad = false;
          return reply(500, { error: '서버 오류가 발생했습니다' });
        }
        return reply(200, {
          today,
          remainingWeeks: 12,
          current: { period: currentPeriod, goals: current },
          past: [
            ...(last.length ? [{ period: lastPeriod, goals: last }] : []),
            ...(older.length ? [{ period: olderPeriod, goals: older }] : []),
          ],
        });
      }
      const body = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : undefined;
      writes.push({ method, path: url, body });
      if (url === '/api/goals/reviews') {
        if (failNextReview) {
          failNextReview = false;
          return reply(500, { error: '서버 오류가 발생했습니다' });
        }
        for (const review of body!.reviews as { id: string; achieved: boolean; note: string }[]) {
          const goal = [...last, ...older].find((g) => g.id === review.id)!;
          goal.achieved = review.achieved;
          goal.reviewNote = review.note || null;
          goal.reviewedAt = review.achieved === null && !review.note ? null : 'now';
        }
        const saved = (body!.reviews as { id: string }[]).map(({ id }) => ({
          ...[...last, ...older].find((g) => g.id === id)!,
        }));
        const response = reply(200, { goals: saved });
        if (!holdNextReview) return response;
        holdNextReview = false;
        return new Promise((resolve) => {
          heldReview = () => resolve(response);
        });
      }
      if (url === '/api/goals') {
        const goal = pending(String(nextId++), String(body!.title));
        current = [...current, goal];
        return reply(201, { goal });
      }
      const id = url.split('/')[3];
      const found = current.find((g) => g.id === id);
      if (!found) return reply(404, { error: '목표를 찾을 수 없습니다' });
      if (method === 'DELETE') current = current.filter((g) => g !== found);
      else found.title = String(body!.title);
      return reply(200, { goal: found });
    }),
  );
  return {
    writes,
    failNextLoad: () => (failNextLoad = true),
    failNextReview: () => (failNextReview = true),
    removeElsewhere: (id: string) => (current = current.filter((g) => g.id !== id)),
    goalLoads: () => goalLoads,
    holdNextReview: () => (holdNextReview = true),
    releaseReview: () => heldReview?.(),
    // The next period starts: this period's goals become the ones to review.
    startNextPeriod: (date: string) => {
      today = date;
      last = current;
      current = [];
    },
  };
}

const flush = () => act(() => new Promise((resolve) => setTimeout(resolve)));
const goalsCard = () => screen.getByRole('region', { name: '이번 12주 목표' });
const lastReview = () => screen.getByRole('region', { name: '2026-07-26 ~ 2026-10-17 회고' });
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByRole('textbox', { name: label }), { target: { value } });
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const memo = (title: string) =>
  within(screen.getByRole('group', { name: title })).getByRole('textbox', { name: '메모' });
const typeMemo = (title: string, value: string) =>
  fireEvent.change(memo(title), { target: { value } });
const saveLastReview = () =>
  fireEvent.submit(screen.getByRole('form', { name: '2026-07-26 ~ 2026-10-17 회고 저장' }));

test('shows the period, weeks left and the checklist item for resetting goals', async () => {
  goalsApi();
  render(<TwelveWeek />);
  await flush();
  expect(within(goalsCard()).getByText('2026-10-18 ~ 2027-01-09 · 12주 남았습니다')).toBeVisible();
  expect(within(goalsCard()).getByText('아직 목표가 없습니다')).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: '목표 재설정' })).toBeInTheDocument();
  expect(screen.queryByText(/돌아보고 새 목표/)).not.toBeInTheDocument();
});

test('several goals can be added, and an empty one shows a Korean error', async () => {
  const api = goalsApi();
  render(<TwelveWeek />);
  await flush();
  fireEvent.submit(screen.getByRole('form', { name: '새 목표 추가' }));
  await flush();
  expect(within(goalsCard()).getByRole('alert')).toHaveTextContent('목표를 입력해 주세요');
  expect(api.writes).toEqual([]);

  for (const title of ['책 12권 읽기', ' 5km 달리기 ']) {
    type('새 목표', title);
    fireEvent.submit(screen.getByRole('form', { name: '새 목표 추가' }));
    await flush();
  }
  expect(api.writes.map((write) => write.body)).toEqual([
    { title: '책 12권 읽기' },
    { title: '5km 달리기' },
  ]);
  expect(within(goalsCard()).getAllByRole('listitem')).toHaveLength(2);
  expect(screen.getByRole('textbox', { name: '새 목표' })).toHaveValue('');
});

test('a goal can be renamed, and removed only after confirming', async () => {
  const api = goalsApi({ current: [pending('1', '책 읽기')] });
  render(<TwelveWeek />);
  await flush();
  press('책 읽기 수정');
  type('책 읽기 새 이름', '책 12권 읽기');
  fireEvent.submit(screen.getByRole('form', { name: '책 읽기 수정' }));
  await flush();
  expect(api.writes.at(-1)).toEqual({
    method: 'PATCH',
    path: '/api/goals/1',
    body: { title: '책 12권 읽기' },
  });
  expect(within(goalsCard()).getByText('책 12권 읽기')).toBeInTheDocument();

  press('책 12권 읽기 삭제');
  expect(api.writes.at(-1)?.method).toBe('PATCH');
  press('책 12권 읽기 삭제 확인');
  await flush();
  expect(api.writes.at(-1)).toEqual({ method: 'DELETE', path: '/api/goals/1', body: undefined });
  expect(within(goalsCard()).getByText('아직 목표가 없습니다')).toBeInTheDocument();
});

test('a goal gone elsewhere shows the Korean 404 and leaves the list', async () => {
  const api = goalsApi({ current: [pending('1', '책 읽기')] });
  render(<TwelveWeek />);
  await flush();
  api.removeElsewhere('1');
  press('책 읽기 삭제');
  press('책 읽기 삭제 확인');
  await flush();
  expect(within(goalsCard()).getByRole('alert')).toHaveTextContent('목표를 찾을 수 없습니다');
  expect(within(goalsCard()).getByText('아직 목표가 없습니다')).toBeInTheDocument();
});

test('a past period with goals to review comes first and saves every answer', async () => {
  const api = goalsApi({
    current: [pending('9', '새 목표')],
    last: [pending('1', '책 읽기'), pending('2', '달리기')],
  });
  render(<TwelveWeek />);
  await flush();
  expect(screen.getByText(/돌아보고 새 목표/)).toBeInTheDocument();
  expect(within(lastReview()).getByText('회고 필요')).toBeInTheDocument();
  // Reviewing first is the order on the page, before the goals of the running period.
  expect(
    lastReview().compareDocumentPosition(goalsCard()) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();

  const reading = within(lastReview()).getByRole('group', { name: '책 읽기' });
  fireEvent.click(within(reading).getByRole('radio', { name: '달성' }));
  typeMemo('책 읽기', '10권 읽었다');
  fireEvent.click(
    within(within(lastReview()).getByRole('group', { name: '달리기' })).getByRole('radio', {
      name: '미달성',
    }),
  );
  saveLastReview();
  await flush();
  expect(api.writes.at(-1)).toEqual({
    method: 'PUT',
    path: '/api/goals/reviews',
    body: {
      reviews: [
        { id: '1', achieved: true, note: '10권 읽었다' },
        { id: '2', achieved: false, note: '' },
      ],
    },
  });
  // The card moves down the page when finished, so the message stays where it can be seen.
  expect(screen.getByText('회고를 저장했습니다')).toBeInTheDocument();
  expect(screen.queryByText('회고 필요')).not.toBeInTheDocument();
  expect(screen.queryByText(/돌아보고 새 목표/)).not.toBeInTheDocument();
  // Once reviewed the period moves below, still readable and still editable.
  expect(
    goalsCard().compareDocumentPosition(lastReview()) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(memo('책 읽기')).toHaveValue('10권 읽었다');
  expect(
    within(within(lastReview()).getByRole('group', { name: '책 읽기' })).getByRole('radio', {
      name: '달성',
    }),
  ).toBeChecked();
});

test('a failed review keeps what was typed and can be saved again', async () => {
  const api = goalsApi({ last: [pending('1', '책 읽기')] });
  render(<TwelveWeek />);
  await flush();
  typeMemo('책 읽기', '지우면 안 되는 글');
  api.failNextReview();
  saveLastReview();
  await flush();
  expect(within(lastReview()).getByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다');
  expect(memo('책 읽기')).toHaveValue('지우면 안 되는 글');

  saveLastReview();
  await flush();
  expect(api.writes.at(-1)?.body).toEqual({
    reviews: [{ id: '1', achieved: null, note: '지우면 안 되는 글' }],
  });
});

test('a reload keeps typing in a review', async () => {
  const api = goalsApi({ last: [pending('1', '책 읽기')] });
  render(<TwelveWeek />);
  await flush();
  typeMemo('책 읽기', '쓰는 중');
  const before = api.goalLoads();
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((resolve) => setTimeout(resolve));
  });
  expect(api.goalLoads()).toBe(before + 1);
  expect(memo('책 읽기')).toHaveValue('쓰는 중');
});

test('a note over the limit is not cut and the count warns', async () => {
  goalsApi({ last: [pending('1', '책 읽기')] });
  render(<TwelveWeek />);
  await flush();
  const tooLong = '가'.repeat(1001);
  typeMemo('책 읽기', tooLong);
  expect(screen.getByText('1001/1000')).toBeInTheDocument();
  expect(memo('책 읽기')).toHaveValue(tooLong);
});

test('older periods stay readable, newest first', async () => {
  const reviewed = (id: string, title: string): Goal => ({
    ...pending(id, title),
    achieved: true,
    reviewedAt: 'then',
  });
  goalsApi({ last: [reviewed('1', '최근 목표')], older: [reviewed('2', '오래된 목표')] });
  render(<TwelveWeek />);
  await flush();
  const headings = screen
    .getAllByRole('heading', { level: 2 })
    .map((heading) => heading.textContent);
  expect(headings.indexOf('2026-07-26 ~ 2026-10-17')).toBeLessThan(
    headings.indexOf('2026-05-03 ~ 2026-07-25'),
  );
  expect(screen.getByText('최근 목표')).toBeInTheDocument();
  expect(screen.getByText('오래된 목표')).toBeInTheDocument();
});

test('saved answers stay on screen even if the reload after saving fails', async () => {
  const api = goalsApi({ last: [pending('1', '책 읽기'), pending('2', '달리기')] });
  render(<TwelveWeek />);
  await flush();
  typeMemo('책 읽기', '10권 읽었다');
  api.failNextLoad();
  saveLastReview();
  await flush();
  expect(memo('책 읽기')).toHaveValue('10권 읽었다');
  expect(within(lastReview()).getByRole('status')).toHaveTextContent('회고를 저장했습니다');
});

test('an answer changed while saving is ignored rather than lost silently', async () => {
  const api = goalsApi({ last: [pending('1', '책 읽기')] });
  render(<TwelveWeek />);
  await flush();
  const radio = (name: string) =>
    within(screen.getByRole('group', { name: '책 읽기' })).getByRole('radio', { name });
  fireEvent.click(radio('달성'));
  api.holdNextReview();
  saveLastReview();
  await flush();
  fireEvent.click(radio('미달성'));
  expect(radio('달성')).toBeChecked();
  api.releaseReview();
  await flush();
  expect(radio('달성')).toBeChecked();
});

test('a review with nothing filled in says it is not finished', async () => {
  goalsApi({ last: [pending('1', '책 읽기')] });
  render(<TwelveWeek />);
  await flush();
  saveLastReview();
  await flush();
  expect(within(lastReview()).getByRole('status')).toHaveTextContent(
    '달성 여부나 메모를 남기면 회고가 끝납니다',
  );
  expect(screen.getByText('회고 필요')).toBeInTheDocument();
});

test('saving a reviewed period again clears the earlier message and shows it in place', async () => {
  const reviewed: Goal = { ...pending('1', '책 읽기'), achieved: true, reviewedAt: 'then' };
  goalsApi({ last: [reviewed] });
  render(<TwelveWeek />);
  await flush();
  typeMemo('책 읽기', '다시 쓴 메모');
  saveLastReview();
  await flush();
  expect(within(lastReview()).getByRole('status')).toHaveTextContent('회고를 저장했습니다');
  expect(screen.getAllByText('회고를 저장했습니다')).toHaveLength(1);
});

test('taking a finished review back moves its card up and still says so', async () => {
  const reviewed: Goal = { ...pending('1', '책 읽기'), achieved: true, reviewedAt: 'then' };
  goalsApi({ last: [reviewed] });
  render(<TwelveWeek />);
  await flush();
  fireEvent.click(
    within(screen.getByRole('group', { name: '책 읽기' })).getByRole('radio', { name: '미정' }),
  );
  saveLastReview();
  await flush();
  expect(screen.getByText('회고 필요')).toBeInTheDocument();
  expect(screen.getByText(/달성 여부나 메모를 남기면 회고가 끝납니다/)).toBeInTheDocument();
});

test('text typed while a goal is saving stays for the next goal', async () => {
  goalsApi();
  render(<TwelveWeek />);
  await flush();
  type('새 목표', '책 읽기');
  fireEvent.submit(screen.getByRole('form', { name: '새 목표 추가' }));
  type('새 목표', '달리');
  await flush();
  expect(screen.getByRole('textbox', { name: '새 목표' })).toHaveValue('달리');
});

test('an open window moves to the next period by itself and shows goals to review', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(new Date('2026-10-22T03:00:00Z'));
  const api = goalsApi({ current: [pending('1', '책 읽기')] });
  render(<TwelveWeek />);
  await flush();
  expect(screen.queryByText(/돌아보고 새 목표/)).not.toBeInTheDocument();
  const loads = api.goalLoads();
  await act(async () => {
    vi.advanceTimersByTime(5 * 60_000);
    await new Promise((resolve) => setTimeout(resolve));
  });
  expect(api.goalLoads()).toBe(loads);

  press('책 읽기 수정');
  type('책 읽기 새 이름', '쓰던 이름');
  vi.setSystemTime(new Date('2027-01-10T03:00:00Z'));
  api.startNextPeriod('2027-01-10');
  await act(async () => {
    vi.advanceTimersByTime(60_000);
    await new Promise((resolve) => setTimeout(resolve));
  });
  expect(screen.getByText(/돌아보고 새 목표/)).toBeInTheDocument();
  expect(screen.getByRole('group', { name: '책 읽기' })).toBeInTheDocument();
  expect(within(goalsCard()).getByText('아직 목표가 없습니다')).toBeInTheDocument();
  // The rename form went with the goal, and says so rather than dropping the text silently.
  expect(within(goalsCard()).getByRole('alert')).toHaveTextContent('쓰던 이름');
});

test('a failed load offers a retry', async () => {
  const api = goalsApi();
  api.failNextLoad();
  render(<TwelveWeek />);
  await flush();
  expect(screen.getByText('서버 오류가 발생했습니다')).toBeInTheDocument();
  press('목표 다시 불러오기');
  await flush();
  expect(within(goalsCard()).getByText('아직 목표가 없습니다')).toBeInTheDocument();
  expect(screen.queryByText('서버 오류가 발생했습니다')).not.toBeInTheDocument();
});
