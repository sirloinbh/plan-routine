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
  { id: '1', name: 'Wake at 6', cadence: 'daily', category: 'wake', sortOrder: 0 },
  { id: '2', name: 'Deep clean', cadence: 'weekly', category: null, sortOrder: 0 },
  { id: '3', name: 'Tidy the budget', cadence: 'four_week', category: null, sortOrder: 0 },
  { id: '4', name: 'Reset goals', cadence: 'twelve_week', category: null, sortOrder: 0 },
];

const reply = (status: number, body: unknown) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

const saved = [{ id: '1', name: 'Wake at 6' }];

function api(options: { list?: typeof routines; failList?: boolean; failSave?: boolean } = {}) {
  const writes: { path: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'GET')
        return options.failList
          ? reply(500, { error: 'A server error occurred' })
          : reply(200, { routines: options.list ?? routines });
      writes.push({ path: url, body: JSON.parse(String(init?.body)) });
      return options.failSave
        ? reply(400, { error: 'Some routines cannot be linked' })
        : reply(200, { routines: saved });
    }),
  );
  return writes;
}

const goal = { id: '9', title: 'Read a book', routines: [{ id: '1', name: 'Wake at 6' }] };
const flush = () => act(() => new Promise((resolve) => setTimeout(resolve)));
const opener = () => screen.getByRole('button', { name: 'Link routines to Read a book' });
const panel = () => screen.getByRole('form', { name: 'Link routines to Read a book' });

function show(overrides: Partial<typeof goal> = {}) {
  const onSaved = vi.fn();
  const onFailed = vi.fn();
  const onBegin = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <GoalRoutineLinks
      goal={{ ...goal, ...overrides }}
      disabled={false}
      onBegin={onBegin}
      onSaved={onSaved}
      onFailed={onFailed}
      onOpenChange={onOpenChange}
    />,
  );
  return { onSaved, onFailed, onBegin, onOpenChange };
}

const openPanel = async () => {
  opener().focus();
  fireEvent.click(opener());
  await flush();
};

test('shows what is linked, or that nothing is', () => {
  api();
  const { unmount } = render(
    <GoalRoutineLinks
      goal={goal}
      disabled={false}
      onSaved={vi.fn()}
      onBegin={vi.fn()}
      onFailed={vi.fn()}
      onOpenChange={vi.fn()}
    />,
  );
  expect(screen.getByText('Linked routines: Wake at 6')).toBeInTheDocument();
  unmount();
  show({ routines: [] });
  expect(screen.getByText('No linked routines')).toBeInTheDocument();
});

test('offers daily and weekly routines only, with what is linked ticked and focus on the first', async () => {
  api();
  show();
  await openPanel();
  expect(within(panel()).getAllByRole('checkbox')).toHaveLength(2);
  expect(within(panel()).queryByText('Tidy the budget')).not.toBeInTheDocument();
  expect(within(panel()).queryByText('Reset goals')).not.toBeInTheDocument();
  const first = within(panel()).getByRole('checkbox', { name: 'Wake at 6' });
  expect(first).toBeChecked();
  expect(within(panel()).getByRole('checkbox', { name: 'Deep clean' })).not.toBeChecked();
  expect(first).toHaveFocus();
  expect(screen.getByRole('group', { name: 'Weekly routines' })).toBeInTheDocument();
});

test('saving sends what is ticked and returns focus to the button', async () => {
  const writes = api();
  const { onSaved } = show();
  await openPanel();
  fireEvent.click(within(panel()).getByRole('checkbox', { name: 'Deep clean' }));
  const save = within(panel()).getByRole('button', { name: 'Save links' });
  save.focus();
  fireEvent.click(save);
  await flush();
  expect(writes).toEqual([{ path: '/api/goals/9/routines', body: { routineIds: ['1', '2'] } }]);
  expect(onSaved).toHaveBeenCalledWith("Linked 2 routines to the goal 'Read a book'", saved);
  expect(screen.queryByRole('form')).not.toBeInTheDocument();
  expect(opener()).toHaveFocus();
});

test('unticking everything clears the links and says so', async () => {
  const writes = api();
  const { onSaved } = show();
  await openPanel();
  fireEvent.click(within(panel()).getByRole('checkbox', { name: 'Wake at 6' }));
  fireEvent.click(within(panel()).getByRole('button', { name: 'Save links' }));
  await flush();
  expect(writes[0].body).toEqual({ routineIds: [] });
  expect(onSaved).toHaveBeenCalledWith("Unlinked all routines from the goal 'Read a book'", saved);
});

test('a failed save keeps the panel and what was ticked, with focus on saving again', async () => {
  api({ failSave: true });
  const { onSaved, onFailed } = show();
  await openPanel();
  fireEvent.click(within(panel()).getByRole('checkbox', { name: 'Deep clean' }));
  const save = within(panel()).getByRole('button', { name: 'Save links' });
  fireEvent.click(save);
  await flush();
  expect(onFailed).toHaveBeenCalledOnce();
  expect(onSaved).not.toHaveBeenCalled();
  expect(within(panel()).getByRole('checkbox', { name: 'Deep clean' })).toBeChecked();
  expect(save).toHaveFocus();
});

test('closing discards the ticks and returns focus to the button', async () => {
  const writes = api();
  show();
  await openPanel();
  fireEvent.click(within(panel()).getByRole('checkbox', { name: 'Deep clean' }));
  fireEvent.click(within(panel()).getByRole('button', { name: 'Close' }));
  await flush();
  expect(opener()).toHaveFocus();
  expect(writes).toEqual([]);
  await openPanel();
  expect(within(panel()).getByRole('checkbox', { name: 'Deep clean' })).not.toBeChecked();
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
  expect(screen.getByText(/There are no daily or weekly routines to link/)).toBeInTheDocument();
  expect(within(panel()).getByRole('button', { name: 'Save links' })).toHaveFocus();
});

test('a linked routine archived elsewhere is dropped, so saving is not refused for ever', async () => {
  const writes = api({ list: [routines[1]] });
  show();
  await openPanel();
  expect(within(panel()).getAllByRole('checkbox')).toHaveLength(1);
  fireEvent.click(within(panel()).getByRole('button', { name: 'Save links' }));
  await flush();
  expect(writes[0].body).toEqual({ routineIds: [] });
});

test('after a refused save the list is fetched again, so the next save can succeed', async () => {
  const list = [...routines];
  const writes = api({ list, failSave: true });
  show();
  await openPanel();
  fireEvent.click(within(panel()).getByRole('checkbox', { name: 'Deep clean' }));
  list.splice(1, 1);
  fireEvent.click(within(panel()).getByRole('button', { name: 'Save links' }));
  await flush();
  expect(within(panel()).queryByRole('checkbox', { name: 'Deep clean' })).not.toBeInTheDocument();
  fireEvent.click(within(panel()).getByRole('button', { name: 'Save links' }));
  await flush();
  expect(writes.at(-1)?.body).toEqual({ routineIds: ['1'] });
});

test('a list that fails after the user moved on leaves their focus alone', async () => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(() => gate.then(() => reply(500, { error: 'A server error occurred' }))),
  );
  render(
    <>
      <input aria-label="Other field" />
      <GoalRoutineLinks
        goal={goal}
        disabled={false}
        onBegin={vi.fn()}
        onSaved={vi.fn()}
        onFailed={vi.fn()}
        onOpenChange={vi.fn()}
      />
    </>,
  );
  await openPanel();
  const other = screen.getByRole('textbox', { name: 'Other field' });
  other.focus();
  release();
  await flush();
  expect(screen.queryByRole('form')).not.toBeInTheDocument();
  expect(other).toHaveFocus();
});

test('closing is ignored while saving', async () => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init?: RequestInit) =>
      (init?.method ?? 'GET') === 'GET'
        ? reply(200, { routines })
        : gate.then(() => reply(200, { routines: saved })),
    ),
  );
  show();
  await openPanel();
  fireEvent.click(within(panel()).getByRole('button', { name: 'Save links' }));
  await flush();
  fireEvent.click(within(panel()).getByRole('button', { name: 'Close' }));
  await flush();
  expect(panel()).toBeInTheDocument();
  release();
  await flush();
  expect(screen.queryByRole('form')).not.toBeInTheDocument();
});

test('opening and saving each clear the earlier message', async () => {
  api();
  const { onBegin } = show();
  await openPanel();
  expect(onBegin).toHaveBeenCalledTimes(1);
  fireEvent.click(within(panel()).getByRole('button', { name: 'Save links' }));
  await flush();
  expect(onBegin).toHaveBeenCalledTimes(2);
});
