import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { DailyChecklist } from './daily-checklist';

type Seed = { id: string; name: string; category: string; sortOrder?: number };

const today = '2026-10-22';
const editable = [
  '2026-10-15',
  '2026-10-16',
  '2026-10-17',
  '2026-10-18',
  '2026-10-19',
  '2026-10-20',
  '2026-10-21',
  today,
];

// A fake checklist API with state, like the server: one set of checks per date, the same date
// range rule, and 404 for a routine that is gone.
function checklistApi(seed: Seed[] = [], options: { failWrites?: string } = {}) {
  let routines = seed.map((r, i) => ({ sortOrder: i, cadence: 'daily', ...r }));
  const checks = new Set<string>();
  const writes: { method: string; path: string }[] = [];
  let serverToday = today;
  let failNextLoad = false;
  let heldWrite: (() => void) | null = null;
  let holdWrites = false;
  // A plain object rather than a Response: it resolves in microtasks only, so flush() is exact.
  const reply = (status: number, body: unknown) =>
    Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'GET') {
        if (failNextLoad) {
          failNextLoad = false;
          return reply(500, { error: '서버 오류가 발생했습니다' });
        }
        const date = new URL(url, 'http://localhost').searchParams.get('date') ?? serverToday;
        const index = editable.indexOf(date);
        return reply(200, {
          date,
          today: serverToday,
          previousDate: editable[index - 1] ?? null,
          nextDate: editable[index + 1] ?? null,
          period: { start: date, end: date },
          items: routines.map((r) => ({ ...r, checked: checks.has(`${r.id}/${date}`) })),
        });
      }
      writes.push({ method, path: url });
      if (options.failWrites) return reply(500, { error: options.failWrites });
      const [, , , id, , date] = url.split('/');
      if (!routines.some((r) => r.id === id))
        return reply(404, { error: '루틴을 찾을 수 없습니다' });
      const commit = () => {
        if (method === 'PUT') checks.add(`${id}/${date}`);
        else checks.delete(`${id}/${date}`);
        return reply(200, { routineId: id, date, checked: method === 'PUT' });
      };
      if (!holdWrites) return commit();
      // The server has not committed until release(), as on a slow connection.
      return new Promise((resolve) => {
        heldWrite = () => resolve(commit());
      });
    }),
  );
  return {
    writes,
    archiveElsewhere: (id: string) => (routines = routines.filter((r) => r.id !== id)),
    setToday: (date: string) => (serverToday = date),
    failNextLoad: () => (failNextLoad = true),
    holdWrites: () => (holdWrites = true),
    release: () => {
      holdWrites = false;
      heldWrite?.();
    },
  };
}

// Lets a running save finish; a box ignores clicks until then.
const flush = () => act(() => new Promise((resolve) => setTimeout(resolve)));
const box = (name: string) => screen.findByRole('checkbox', { name });
const region = (label: string) => screen.getByRole('region', { name: `${label} 체크리스트` });

const seed = [
  { id: '1', name: '6시 기상', category: 'wake' },
  { id: '2', name: '물 한 잔', category: 'wake' },
  { id: '3', name: '스쿼트', category: 'exercise' },
];

test('shows today with routines by category, hiding empty categories', async () => {
  checklistApi(seed);
  render(<DailyChecklist />);
  await box('6시 기상');
  expect(screen.getByRole('heading', { level: 2, name: '오늘 (2026-10-22)' })).toBeVisible();
  expect(within(region('기상')).getAllByRole('checkbox')).toHaveLength(2);
  expect(within(region('운동')).getAllByRole('checkbox')).toHaveLength(1);
  expect(screen.queryByRole('region', { name: '식단 체크리스트' })).not.toBeInTheDocument();
});

test('checking updates the box and progress at once and survives a reload', async () => {
  const api = checklistApi(seed);
  const { unmount } = render(<DailyChecklist />);
  expect(await box('6시 기상')).not.toBeChecked();
  expect(screen.getByText('전체 0/3 완료')).toBeInTheDocument();

  fireEvent.click(await box('6시 기상'));
  expect(await box('6시 기상')).toBeChecked();
  expect(screen.getByText('전체 1/3 완료')).toBeInTheDocument();
  expect(within(region('기상')).getByText('1/2')).toBeInTheDocument();
  expect(within(region('운동')).getByText('0/1')).toBeInTheDocument();
  await waitFor(() =>
    expect(api.writes).toEqual([{ method: 'PUT', path: `/api/routines/1/checks/${today}` }]),
  );

  unmount();
  render(<DailyChecklist />);
  expect(await box('6시 기상')).toBeChecked();
  expect(screen.getByText('전체 1/3 완료')).toBeInTheDocument();
});

test('unchecking sends a delete and lowers the progress', async () => {
  const api = checklistApi(seed);
  render(<DailyChecklist />);
  fireEvent.click(await box('스쿼트'));
  await flush();
  fireEvent.click(await box('스쿼트'));
  expect(await box('스쿼트')).not.toBeChecked();
  expect(screen.getByText('전체 0/3 완료')).toBeInTheDocument();
  await flush();
  expect(api.writes.at(-1)).toEqual({
    method: 'DELETE',
    path: `/api/routines/3/checks/${today}`,
  });
});

test('a second click on a box still saving sends no second request', async () => {
  const api = checklistApi(seed);
  render(<DailyChecklist />);
  const target = await box('6시 기상');
  fireEvent.click(target);
  fireEvent.click(target);
  await flush();
  expect(api.writes).toHaveLength(1);
  expect(target).toBeChecked();
});

test('a failed save restores the box and shows the Korean error', async () => {
  checklistApi(seed, { failWrites: '서버 오류가 발생했습니다' });
  render(<DailyChecklist />);
  fireEvent.click(await box('6시 기상'));
  expect(await screen.findByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다');
  expect(await box('6시 기상')).not.toBeChecked();
  expect(screen.getByText('전체 0/3 완료')).toBeInTheDocument();
});

test('a routine archived elsewhere shows the Korean 404 and leaves the list', async () => {
  const api = checklistApi(seed);
  render(<DailyChecklist />);
  await box('물 한 잔');
  api.archiveElsewhere('2');
  fireEvent.click(await box('물 한 잔'));
  expect(await screen.findByRole('alert')).toHaveTextContent('루틴을 찾을 수 없습니다');
  await waitFor(() =>
    expect(screen.queryByRole('checkbox', { name: '물 한 잔' })).not.toBeInTheDocument(),
  );
  expect(screen.getByText('전체 0/2 완료')).toBeInTheDocument();
});

test('another day keeps its own checks and the date buttons stop at the range ends', async () => {
  const api = checklistApi(seed);
  render(<DailyChecklist />);
  fireEvent.click(await box('6시 기상'));
  await waitFor(() => expect(api.writes).toHaveLength(1));
  expect(screen.getByRole('button', { name: '다음 날' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: '오늘로' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '이전 날' }));
  expect(await screen.findByRole('heading', { level: 2, name: '2026-10-21' })).toBeVisible();
  expect(await box('6시 기상')).not.toBeChecked();
  fireEvent.click(await box('스쿼트'));
  await waitFor(() =>
    expect(api.writes.at(-1)).toEqual({ method: 'PUT', path: '/api/routines/3/checks/2026-10-21' }),
  );

  fireEvent.click(screen.getByRole('button', { name: '오늘로' }));
  expect(await screen.findByRole('heading', { level: 2, name: `오늘 (${today})` })).toBeVisible();
  expect(await box('6시 기상')).toBeChecked();
  expect(await box('스쿼트')).not.toBeChecked();

  for (let step = 0; step < 7; step++) {
    fireEvent.click(screen.getByRole('button', { name: '이전 날' }));
    await screen.findByRole('heading', { level: 2, name: editable[6 - step] });
  }
  expect(screen.getByRole('button', { name: '이전 날' })).toBeDisabled();
});

const showPageAgain = () =>
  act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((resolve) => setTimeout(resolve));
  });

test('a page shown again after midnight moves to the new day and saves there', async () => {
  const api = checklistApi(seed);
  api.setToday('2026-10-20');
  render(<DailyChecklist />);
  await screen.findByRole('heading', { level: 2, name: '오늘 (2026-10-20)' });

  // "오늘로" keeps following the server's today rather than the date it was pressed on.
  fireEvent.click(screen.getByRole('button', { name: '이전 날' }));
  await screen.findByRole('heading', { level: 2, name: '2026-10-19' });
  fireEvent.click(screen.getByRole('button', { name: '오늘로' }));
  await screen.findByRole('heading', { level: 2, name: '오늘 (2026-10-20)' });

  api.setToday(today);
  await showPageAgain();
  expect(screen.getByRole('heading', { level: 2, name: `오늘 (${today})` })).toBeVisible();
  fireEvent.click(await box('6시 기상'));
  await flush();
  expect(api.writes).toEqual([{ method: 'PUT', path: `/api/routines/1/checks/${today}` }]);
});

test('a load during a save does not undo the checked box, and the saved state is shown', async () => {
  const api = checklistApi(seed);
  render(<DailyChecklist />);
  const target = await box('6시 기상');
  api.holdWrites();
  fireEvent.click(target);
  // This load reads the server before the save commits, so it still says "not checked".
  await showPageAgain();
  expect(await box('6시 기상')).toBeChecked();
  expect(screen.getByText('전체 1/3 완료')).toBeInTheDocument();

  api.release();
  await flush();
  await flush();
  expect(await box('6시 기상')).toBeChecked();
  expect(screen.getByText('전체 1/3 완료')).toBeInTheDocument();
  // Unchecking after the reload proves the save finished and the box accepts clicks again.
  fireEvent.click(await box('6시 기상'));
  await flush();
  expect(api.writes.at(-1)?.method).toBe('DELETE');
});

test('a failed move can be retried with the same button', async () => {
  const api = checklistApi(seed);
  render(<DailyChecklist />);
  await box('6시 기상');
  api.failNextLoad();
  fireEvent.click(screen.getByRole('button', { name: '이전 날' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다');
  fireEvent.click(screen.getByRole('button', { name: '이전 날' }));
  expect(await screen.findByRole('heading', { level: 2, name: '2026-10-21' })).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('a failed first load offers a retry', async () => {
  const api = checklistApi(seed);
  api.failNextLoad();
  render(<DailyChecklist />);
  expect(await screen.findByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다');
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  expect(await box('6시 기상')).toBeInTheDocument();
});

test('with no routines it points to the routine page instead of an empty grid', async () => {
  checklistApi();
  render(<DailyChecklist />);
  expect(await screen.findByText('체크할 루틴이 없습니다')).toBeInTheDocument();
  expect(screen.getByText('전체 0/0 완료')).toBeInTheDocument();
});

test('a failed load shows the Korean error', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('offline'))),
  );
  render(<DailyChecklist />);
  expect(await screen.findByRole('alert')).toHaveTextContent('서버에 연결할 수 없습니다');
});
