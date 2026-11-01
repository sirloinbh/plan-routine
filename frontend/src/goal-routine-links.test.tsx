import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';

import { GoalRoutineLinks } from './goal-routine-links';

// jsdom has none; a checkbox inside a form reads it.
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

const routines = [
  { id: '1', name: '6시 기상', cadence: 'daily', category: 'wake', sortOrder: 0 },
  { id: '2', name: '대청소', cadence: 'weekly', category: null, sortOrder: 0 },
  { id: '3', name: '가계부 정리', cadence: 'four_week', category: null, sortOrder: 0 },
  { id: '4', name: '목표 재설정', cadence: 'twelve_week', category: null, sortOrder: 0 },
];

const reply = (status: number, body: unknown) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

function api(options: { list?: typeof routines; failList?: boolean; failSave?: boolean } = {}) {
  const writes: { path: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'GET')
        return options.failList
          ? reply(500, { error: '서버 오류가 발생했습니다' })
          : reply(200, { routines: options.list ?? routines });
      writes.push({ path: url, body: JSON.parse(String(init?.body)) });
      return options.failSave
        ? reply(400, { error: '연결할 수 없는 루틴이 있습니다' })
        : reply(200, { routines: [] });
    }),
  );
  return writes;
}

const goal = { id: '9', title: '책 읽기', routines: [{ id: '1', name: '6시 기상' }] };
const flush = () => act(() => new Promise((resolve) => setTimeout(resolve)));
const opener = () => screen.getByRole('button', { name: '책 읽기 루틴 연결' });
const panel = () => screen.getByRole('form', { name: '책 읽기 루틴 연결' });

function show(overrides: Partial<typeof goal> = {}) {
  const onSaved = vi.fn();
  const onFailed = vi.fn();
  render(
    <GoalRoutineLinks
      goal={{ ...goal, ...overrides }}
      disabled={false}
      onSaved={onSaved}
      onFailed={onFailed}
    />,
  );
  return { onSaved, onFailed };
}

const openPanel = async () => {
  opener().focus();
  fireEvent.click(opener());
  await flush();
};

test('shows what is linked, or that nothing is', () => {
  api();
  const { unmount } = render(
    <GoalRoutineLinks goal={goal} disabled={false} onSaved={vi.fn()} onFailed={vi.fn()} />,
  );
  expect(screen.getByText('연결된 루틴: 6시 기상')).toBeInTheDocument();
  unmount();
  show({ routines: [] });
  expect(screen.getByText('연결된 루틴이 없습니다')).toBeInTheDocument();
});

test('offers daily and weekly routines only, with what is linked ticked and focus on the first', async () => {
  api();
  show();
  await openPanel();
  expect(within(panel()).getAllByRole('checkbox')).toHaveLength(2);
  expect(within(panel()).queryByText('가계부 정리')).not.toBeInTheDocument();
  expect(within(panel()).queryByText('목표 재설정')).not.toBeInTheDocument();
  const first = within(panel()).getByRole('checkbox', { name: '6시 기상' });
  expect(first).toBeChecked();
  expect(within(panel()).getByRole('checkbox', { name: '대청소' })).not.toBeChecked();
  expect(first).toHaveFocus();
  expect(screen.getByRole('group', { name: '주간 루틴' })).toBeInTheDocument();
});

test('saving sends what is ticked and returns focus to the button', async () => {
  const writes = api();
  const { onSaved } = show();
  await openPanel();
  fireEvent.click(within(panel()).getByRole('checkbox', { name: '대청소' }));
  const save = within(panel()).getByRole('button', { name: '연결 저장' });
  save.focus();
  fireEvent.click(save);
  await flush();
  expect(writes).toEqual([{ path: '/api/goals/9/routines', body: { routineIds: ['1', '2'] } }]);
  expect(onSaved).toHaveBeenCalledWith("'책 읽기' 목표에 루틴 2개를 연결했습니다");
  expect(screen.queryByRole('form')).not.toBeInTheDocument();
  expect(opener()).toHaveFocus();
});

test('unticking everything clears the links and says so', async () => {
  const writes = api();
  const { onSaved } = show();
  await openPanel();
  fireEvent.click(within(panel()).getByRole('checkbox', { name: '6시 기상' }));
  fireEvent.click(within(panel()).getByRole('button', { name: '연결 저장' }));
  await flush();
  expect(writes[0].body).toEqual({ routineIds: [] });
  expect(onSaved).toHaveBeenCalledWith("'책 읽기' 목표의 루틴 연결을 모두 해제했습니다");
});

test('a failed save keeps the panel and what was ticked, with focus on saving again', async () => {
  api({ failSave: true });
  const { onSaved, onFailed } = show();
  await openPanel();
  fireEvent.click(within(panel()).getByRole('checkbox', { name: '대청소' }));
  const save = within(panel()).getByRole('button', { name: '연결 저장' });
  fireEvent.click(save);
  await flush();
  expect(onFailed).toHaveBeenCalledOnce();
  expect(onSaved).not.toHaveBeenCalled();
  expect(within(panel()).getByRole('checkbox', { name: '대청소' })).toBeChecked();
  expect(save).toHaveFocus();
});

test('closing discards the ticks and returns focus to the button', async () => {
  const writes = api();
  show();
  await openPanel();
  fireEvent.click(within(panel()).getByRole('checkbox', { name: '대청소' }));
  fireEvent.click(within(panel()).getByRole('button', { name: '닫기' }));
  await flush();
  expect(opener()).toHaveFocus();
  expect(writes).toEqual([]);
  await openPanel();
  expect(within(panel()).getByRole('checkbox', { name: '대청소' })).not.toBeChecked();
});

test('a list that fails to load reports it and closes the panel', async () => {
  api({ failList: true });
  const { onFailed } = show();
  await openPanel();
  expect(onFailed).toHaveBeenCalledOnce();
  expect(screen.queryByRole('form')).not.toBeInTheDocument();
  await waitFor(() => expect(opener()).toHaveFocus());
});

test('with no routines to link it says so and focus goes to saving', async () => {
  api({ list: [routines[2]] });
  show({ routines: [] });
  await openPanel();
  expect(screen.getByText(/연결할 하루·주간 루틴이 없습니다/)).toBeInTheDocument();
  expect(within(panel()).getByRole('button', { name: '연결 저장' })).toHaveFocus();
});
