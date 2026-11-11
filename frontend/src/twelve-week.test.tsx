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
  let failNextWrite = false;
  const writes: { method: string; path: string; body?: unknown }[] = [];
  const routines = [
    { id: '50', name: 'Reset goals', cadence: 'twelve_week', category: null, sortOrder: 0 },
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
      if (url.startsWith('/api/routines') && method === 'GET')
        return reply(200, {
          routines: [
            ...routines,
            { id: '51', name: 'Wake at 6', cadence: 'daily', category: 'wake', sortOrder: 0 },
          ],
        });
      if (url === '/api/project-links') return reply(200, { projects: [] });
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
          return reply(500, { error: 'A server error occurred' });
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
          return reply(500, { error: 'A server error occurred' });
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
      if (failNextWrite) {
        failNextWrite = false;
        return reply(500, { error: 'A server error occurred' });
      }
      if (url === '/api/goals') {
        const goal = pending(String(nextId++), String(body!.title));
        current = [...current, goal];
        return reply(201, { goal });
      }
      const id = url.split('/')[3];
      const found = current.find((g) => g.id === id);
      if (!found) return reply(404, { error: 'Goal not found' });
      if (url.endsWith('/routines')) {
        const ids = body!.routineIds as string[];
        const linked = ids.map((value) => ({ id: value, name: 'Wake at 6' }));
        (found as Goal & { routines?: unknown }).routines = linked;
        return reply(200, { routines: linked });
      }
      if (method === 'DELETE') current = current.filter((g) => g !== found);
      else found.title = String(body!.title);
      return reply(200, { goal: found });
    }),
  );
  return {
    writes,
    failNextLoad: () => (failNextLoad = true),
    failNextReview: () => (failNextReview = true),
    failNextWrite: () => (failNextWrite = true),
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
const goalsCard = () => screen.getByRole('region', { name: 'Goals for these 12 weeks' });
const lastReview = () =>
  screen.getByRole('region', { name: 'Review for July 26, 2026 – October 17, 2026' });
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByRole('textbox', { name: label }), { target: { value } });
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const memo = (title: string) =>
  within(screen.getByRole('group', { name: title })).getByRole('textbox', { name: 'Note' });
const typeMemo = (title: string, value: string) =>
  fireEvent.change(memo(title), { target: { value } });
const saveLastReview = () =>
  fireEvent.submit(
    screen.getByRole('form', { name: 'Save the review for July 26, 2026 – October 17, 2026' }),
  );

test('shows the period, weeks left and the checklist item for resetting goals', async () => {
  goalsApi();
  render(<TwelveWeek />);
  await flush();
  expect(
    within(goalsCard()).getByText('October 18, 2026 – January 9, 2027 · 12 weeks left'),
  ).toBeVisible();
  expect(within(goalsCard()).getByText('No goals yet')).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Reset goals' })).toBeInTheDocument();
  expect(screen.queryByText(/set new ones/)).not.toBeInTheDocument();
});

test('several goals can be added, and an empty one shows an English error', async () => {
  const api = goalsApi();
  render(<TwelveWeek />);
  await flush();
  fireEvent.submit(screen.getByRole('form', { name: 'Add a new goal' }));
  await flush();
  expect(within(goalsCard()).getByRole('alert')).toHaveTextContent('Enter a goal');
  expect(api.writes).toEqual([]);

  for (const title of ['Read 12 books', ' Run 5 km ']) {
    type('New goal', title);
    fireEvent.submit(screen.getByRole('form', { name: 'Add a new goal' }));
    await flush();
  }
  expect(api.writes.map((write) => write.body)).toEqual([
    { title: 'Read 12 books' },
    { title: 'Run 5 km' },
  ]);
  expect(within(goalsCard()).getAllByRole('listitem')).toHaveLength(2);
  expect(screen.getByRole('textbox', { name: 'New goal' })).toHaveValue('');
});

test('a goal can be renamed, and removed only after confirming', async () => {
  const api = goalsApi({ current: [pending('1', 'Read a book')] });
  render(<TwelveWeek />);
  await flush();
  press('Rename Read a book');
  type('New name for Read a book', 'Read 12 books');
  fireEvent.submit(screen.getByRole('form', { name: 'Rename Read a book' }));
  await flush();
  expect(api.writes.at(-1)).toEqual({
    method: 'PATCH',
    path: '/api/goals/1',
    body: { title: 'Read 12 books' },
  });
  expect(within(goalsCard()).getByText('Read 12 books')).toBeInTheDocument();

  press('Delete Read 12 books');
  expect(api.writes.at(-1)?.method).toBe('PATCH');
  press('Confirm deleting Read 12 books');
  await flush();
  expect(api.writes.at(-1)).toEqual({ method: 'DELETE', path: '/api/goals/1', body: undefined });
  expect(within(goalsCard()).getByText('No goals yet')).toBeInTheDocument();
});

test('a goal gone elsewhere shows the English 404 and leaves the list', async () => {
  const api = goalsApi({ current: [pending('1', 'Read a book')] });
  render(<TwelveWeek />);
  await flush();
  api.removeElsewhere('1');
  press('Delete Read a book');
  press('Confirm deleting Read a book');
  await flush();
  expect(within(goalsCard()).getByRole('alert')).toHaveTextContent('Goal not found');
  expect(within(goalsCard()).getByText('No goals yet')).toBeInTheDocument();
});

test('a past period with goals to review comes first and saves every answer', async () => {
  const api = goalsApi({
    current: [pending('9', 'New goal')],
    last: [pending('1', 'Read a book'), pending('2', 'Run')],
  });
  render(<TwelveWeek />);
  await flush();
  expect(screen.getByText(/set new ones/)).toBeInTheDocument();
  expect(within(lastReview()).getByText('Review needed')).toBeInTheDocument();
  // Reviewing first is the order on the page, before the goals of the running period.
  expect(
    lastReview().compareDocumentPosition(goalsCard()) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();

  const reading = within(lastReview()).getByRole('group', { name: 'Read a book' });
  fireEvent.click(within(reading).getByRole('radio', { name: 'Achieved' }));
  typeMemo('Read a book', 'Read 10 books');
  fireEvent.click(
    within(within(lastReview()).getByRole('group', { name: 'Run' })).getByRole('radio', {
      name: 'Not achieved',
    }),
  );
  saveLastReview();
  await flush();
  expect(api.writes.at(-1)).toEqual({
    method: 'PUT',
    path: '/api/goals/reviews',
    body: {
      reviews: [
        { id: '1', achieved: true, note: 'Read 10 books' },
        { id: '2', achieved: false, note: '' },
      ],
    },
  });
  // The card moves down the page when finished, so the message stays where it can be seen.
  expect(screen.getByText('Saved the review')).toBeInTheDocument();
  expect(screen.queryByText('Review needed')).not.toBeInTheDocument();
  expect(screen.queryByText(/set new ones/)).not.toBeInTheDocument();
  // Once reviewed the period moves below, still readable and still editable.
  expect(
    goalsCard().compareDocumentPosition(lastReview()) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(memo('Read a book')).toHaveValue('Read 10 books');
  expect(
    within(within(lastReview()).getByRole('group', { name: 'Read a book' })).getByRole('radio', {
      name: 'Achieved',
    }),
  ).toBeChecked();
});

test('a failed review keeps what was typed and can be saved again', async () => {
  const api = goalsApi({ last: [pending('1', 'Read a book')] });
  render(<TwelveWeek />);
  await flush();
  typeMemo('Read a book', 'Text that must stay');
  api.failNextReview();
  saveLastReview();
  await flush();
  expect(within(lastReview()).getByRole('alert')).toHaveTextContent('A server error occurred');
  expect(memo('Read a book')).toHaveValue('Text that must stay');

  saveLastReview();
  await flush();
  expect(api.writes.at(-1)?.body).toEqual({
    reviews: [{ id: '1', achieved: null, note: 'Text that must stay' }],
  });
});

test('a reload keeps typing in a review', async () => {
  const api = goalsApi({ last: [pending('1', 'Read a book')] });
  render(<TwelveWeek />);
  await flush();
  typeMemo('Read a book', 'Typing');
  const before = api.goalLoads();
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((resolve) => setTimeout(resolve));
  });
  expect(api.goalLoads()).toBe(before + 1);
  expect(memo('Read a book')).toHaveValue('Typing');
});

test('a note over the limit is not cut and the count warns', async () => {
  goalsApi({ last: [pending('1', 'Read a book')] });
  render(<TwelveWeek />);
  await flush();
  const tooLong = 'a'.repeat(1001);
  typeMemo('Read a book', tooLong);
  expect(screen.getByText('1001/1000')).toBeInTheDocument();
  expect(memo('Read a book')).toHaveValue(tooLong);
});

test('older periods stay readable, newest first', async () => {
  const reviewed = (id: string, title: string): Goal => ({
    ...pending(id, title),
    achieved: true,
    reviewedAt: 'then',
  });
  goalsApi({ last: [reviewed('1', 'Recent goal')], older: [reviewed('2', 'Old goal')] });
  render(<TwelveWeek />);
  await flush();
  const headings = screen
    .getAllByRole('heading', { level: 2 })
    .map((heading) => heading.textContent);
  expect(headings.indexOf('July 26, 2026 – October 17, 2026')).toBeLessThan(
    headings.indexOf('May 3, 2026 – July 25, 2026'),
  );
  expect(screen.getByText('Recent goal')).toBeInTheDocument();
  expect(screen.getByText('Old goal')).toBeInTheDocument();
});

test('saved answers stay on screen even if the reload after saving fails', async () => {
  const api = goalsApi({ last: [pending('1', 'Read a book'), pending('2', 'Run')] });
  render(<TwelveWeek />);
  await flush();
  typeMemo('Read a book', 'Read 10 books');
  api.failNextLoad();
  saveLastReview();
  await flush();
  expect(memo('Read a book')).toHaveValue('Read 10 books');
  expect(within(lastReview()).getByRole('status')).toHaveTextContent('Saved the review');
});

test('an answer changed while saving is ignored rather than lost silently', async () => {
  const api = goalsApi({ last: [pending('1', 'Read a book')] });
  render(<TwelveWeek />);
  await flush();
  const radio = (name: string) =>
    within(screen.getByRole('group', { name: 'Read a book' })).getByRole('radio', { name });
  fireEvent.click(radio('Achieved'));
  api.holdNextReview();
  saveLastReview();
  await flush();
  fireEvent.click(radio('Not achieved'));
  expect(radio('Achieved')).toBeChecked();
  api.releaseReview();
  await flush();
  expect(radio('Achieved')).toBeChecked();
});

test('a review with nothing filled in says it is not finished', async () => {
  goalsApi({ last: [pending('1', 'Read a book')] });
  render(<TwelveWeek />);
  await flush();
  saveLastReview();
  await flush();
  expect(within(lastReview()).getByRole('status')).toHaveTextContent(
    'The review is complete once you mark the goal achieved or add a note',
  );
  expect(screen.getByText('Review needed')).toBeInTheDocument();
});

test('saving a reviewed period again clears the earlier message and shows it in place', async () => {
  const reviewed: Goal = { ...pending('1', 'Read a book'), achieved: true, reviewedAt: 'then' };
  goalsApi({ last: [reviewed] });
  render(<TwelveWeek />);
  await flush();
  typeMemo('Read a book', 'Rewritten note');
  saveLastReview();
  await flush();
  expect(within(lastReview()).getByRole('status')).toHaveTextContent('Saved the review');
  expect(screen.getAllByText('Saved the review')).toHaveLength(1);
});

test('taking a finished review back moves its card up and still says so', async () => {
  const reviewed: Goal = { ...pending('1', 'Read a book'), achieved: true, reviewedAt: 'then' };
  goalsApi({ last: [reviewed] });
  render(<TwelveWeek />);
  await flush();
  fireEvent.click(
    within(screen.getByRole('group', { name: 'Read a book' })).getByRole('radio', {
      name: 'Undecided',
    }),
  );
  saveLastReview();
  await flush();
  expect(screen.getByText('Review needed')).toBeInTheDocument();
  expect(
    screen.getByText(/The review is complete once you mark the goal achieved or add a note/),
  ).toBeInTheDocument();
});

test('text typed while a goal is saving stays for the next goal', async () => {
  goalsApi();
  render(<TwelveWeek />);
  await flush();
  type('New goal', 'Read a book');
  fireEvent.submit(screen.getByRole('form', { name: 'Add a new goal' }));
  type('New goal', 'Run');
  await flush();
  expect(screen.getByRole('textbox', { name: 'New goal' })).toHaveValue('Run');
});

test('an open window moves to the next period by itself and shows goals to review', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(new Date('2026-10-22T03:00:00Z'));
  const api = goalsApi({ current: [pending('1', 'Read a book')] });
  render(<TwelveWeek />);
  await flush();
  expect(screen.queryByText(/set new ones/)).not.toBeInTheDocument();
  const loads = api.goalLoads();
  await act(async () => {
    vi.advanceTimersByTime(5 * 60_000);
    await new Promise((resolve) => setTimeout(resolve));
  });
  expect(api.goalLoads()).toBe(loads);

  press('Rename Read a book');
  type('New name for Read a book', 'Name being typed');
  vi.setSystemTime(new Date('2027-01-10T03:00:00Z'));
  api.startNextPeriod('2027-01-10');
  await act(async () => {
    vi.advanceTimersByTime(60_000);
    await new Promise((resolve) => setTimeout(resolve));
  });
  expect(screen.getByText(/set new ones/)).toBeInTheDocument();
  expect(screen.getByRole('group', { name: 'Read a book' })).toBeInTheDocument();
  expect(within(goalsCard()).getByText('No goals yet')).toBeInTheDocument();
  // The rename form went with the goal, and says so rather than dropping the text silently.
  expect(within(goalsCard()).getByRole('alert')).toHaveTextContent('Name being typed');
});

test('a failed load offers a retry', async () => {
  const api = goalsApi();
  api.failNextLoad();
  render(<TwelveWeek />);
  await flush();
  expect(screen.getByText('A server error occurred')).toBeInTheDocument();
  press('Reload goals');
  await flush();
  expect(within(goalsCard()).getByText('No goals yet')).toBeInTheDocument();
  expect(screen.queryByText('A server error occurred')).not.toBeInTheDocument();
});

const button = (name: string) => screen.getByRole('button', { name });
const pressFocused = (name: string) => {
  button(name).focus();
  press(name);
};
const twoGoals = () => [pending('1', 'Read a book'), pending('2', 'Run')];

test("renaming or cancelling returns focus to the goal's edit button", async () => {
  goalsApi({ current: twoGoals() });
  render(<TwelveWeek />);
  await flush();
  press('Rename Read a book');
  expect(screen.getByRole('textbox', { name: 'New name for Read a book' })).toHaveFocus();
  pressFocused('Cancel');
  await flush();
  expect(button('Rename Read a book')).toHaveFocus();

  press('Rename Read a book');
  type('New name for Read a book', 'Read 12 books');
  pressFocused('Save');
  await flush();
  expect(button('Rename Read 12 books')).toHaveFocus();
});

test('renaming a goal gone elsewhere moves focus to the new goal field', async () => {
  const api = goalsApi({ current: twoGoals() });
  render(<TwelveWeek />);
  await flush();
  press('Rename Read a book');
  api.removeElsewhere('1');
  fireEvent.submit(screen.getByRole('form', { name: 'Rename Read a book' }));
  await flush();
  expect(screen.getByRole('textbox', { name: 'New goal' })).toHaveFocus();
});

test('an empty new name keeps focus on its field', async () => {
  goalsApi({ current: twoGoals() });
  render(<TwelveWeek />);
  await flush();
  press('Rename Read a book');
  type('New name for Read a book', ' ');
  within(goalsCard()).getByRole('button', { name: 'Save' }).focus();
  fireEvent.submit(screen.getByRole('form', { name: 'Rename Read a book' }));
  await flush();
  expect(within(goalsCard()).getByRole('alert')).toHaveTextContent('Enter a goal');
  expect(screen.getByRole('textbox', { name: 'New name for Read a book' })).toHaveFocus();
});

test('removing a goal moves focus to the next, then the previous, then the new goal field', async () => {
  goalsApi({ current: [...twoGoals(), pending('3', 'Savings')] });
  render(<TwelveWeek />);
  await flush();
  press('Delete Run');
  pressFocused('Confirm deleting Run');
  await flush();
  expect(button('Rename Savings')).toHaveFocus();

  press('Delete Savings');
  pressFocused('Confirm deleting Savings');
  await flush();
  expect(button('Rename Read a book')).toHaveFocus();

  press('Delete Read a book');
  pressFocused('Confirm deleting Read a book');
  await flush();
  expect(screen.getByRole('textbox', { name: 'New goal' })).toHaveFocus();
});

test('adding a goal by its button returns focus to the field', async () => {
  goalsApi();
  render(<TwelveWeek />);
  await flush();
  type('New goal', 'Read a book');
  within(goalsCard()).getByRole('button', { name: 'Add' }).focus();
  fireEvent.submit(screen.getByRole('form', { name: 'Add a new goal' }));
  await flush();
  expect(screen.getByRole('textbox', { name: 'New goal' })).toHaveFocus();
});

test('a finished review moves its card, focus and message together', async () => {
  goalsApi({ last: [pending('1', 'Read a book')] });
  render(<TwelveWeek />);
  await flush();
  typeMemo('Read a book', 'Finished');
  button('Save review').focus();
  saveLastReview();
  await flush();
  expect(
    screen.getByRole('heading', { level: 2, name: 'July 26, 2026 – October 17, 2026' }),
  ).toHaveFocus();
  expect(within(lastReview()).getByRole('status')).toHaveTextContent('Saved the review');
  expect(screen.getAllByText('Saved the review')).toHaveLength(1);
});

test('a review staying in its list keeps focus on its button', async () => {
  const reviewed: Goal = { ...pending('1', 'Read a book'), achieved: true, reviewedAt: 'then' };
  goalsApi({ last: [reviewed] });
  render(<TwelveWeek />);
  await flush();
  typeMemo('Read a book', 'Rewritten note');
  button('Save review').focus();
  saveLastReview();
  await flush();
  expect(button('Save review')).toHaveFocus();
});

test('a slow review does not take focus back once the user has moved on', async () => {
  const api = goalsApi({ last: [pending('1', 'Read a book')] });
  render(<TwelveWeek />);
  await flush();
  typeMemo('Read a book', 'Finished');
  button('Save review').focus();
  api.holdNextReview();
  saveLastReview();
  await flush();
  const goal = screen.getByRole('textbox', { name: 'New goal' });
  goal.focus();
  api.releaseReview();
  await flush();
  expect(goal).toHaveFocus();
});

test('a rename that fails keeps its form and returns focus to the field', async () => {
  const api = goalsApi({ current: twoGoals() });
  render(<TwelveWeek />);
  await flush();
  press('Rename Read a book');
  type('New name for Read a book', 'Read 12 books');
  api.failNextWrite();
  pressFocused('Save');
  await flush();
  expect(within(goalsCard()).getByRole('alert')).toHaveTextContent('A server error occurred');
  expect(screen.getByRole('textbox', { name: 'New name for Read a book' })).toHaveFocus();
  expect(screen.getByRole('textbox', { name: 'New name for Read a book' })).toHaveValue(
    'Read 12 books',
  );
});

test('a removal that fails stays on its own row', async () => {
  const api = goalsApi({ current: twoGoals() });
  render(<TwelveWeek />);
  await flush();
  press('Delete Read a book');
  api.failNextWrite();
  pressFocused('Confirm deleting Read a book');
  await flush();
  expect(within(goalsCard()).getByRole('alert')).toHaveTextContent('A server error occurred');
  expect(button('Delete Read a book')).toHaveFocus();
});

test('a goal shows its routines after linking them, and goals of past periods cannot', async () => {
  // jsdom has none; a checkbox inside a form reads it.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const api = goalsApi({
    current: [pending('1', 'Read a book')],
    last: [pending('2', 'Past goal')],
  });
  render(<TwelveWeek />);
  await flush();
  expect(within(goalsCard()).getByText('No linked routines')).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Link routines to Past goal' }),
  ).not.toBeInTheDocument();

  press('Link routines to Read a book');
  await flush();
  fireEvent.click(within(goalsCard()).getByRole('checkbox', { name: 'Wake at 6' }));
  fireEvent.submit(screen.getByRole('form', { name: 'Link routines to Read a book' }));
  await flush();
  expect(api.writes.at(-1)).toEqual({
    method: 'PUT',
    path: '/api/goals/1/routines',
    body: { routineIds: ['51'] },
  });
  expect(within(goalsCard()).getByRole('status')).toHaveTextContent(
    "Linked 1 routine to the goal 'Read a book'",
  );
  expect(within(goalsCard()).getByText('Linked routines: Wake at 6')).toBeInTheDocument();
});

test('linked routines show at once, even if the reload after saving fails', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const api = goalsApi({ current: [pending('1', 'Read a book')] });
  render(<TwelveWeek />);
  await flush();
  press('Link routines to Read a book');
  await flush();
  fireEvent.click(within(goalsCard()).getByRole('checkbox', { name: 'Wake at 6' }));
  api.failNextLoad();
  fireEvent.submit(screen.getByRole('form', { name: 'Link routines to Read a book' }));
  await flush();
  expect(within(goalsCard()).getByText('Linked routines: Wake at 6')).toBeInTheDocument();
});

test('after a retry succeeds, focus is on the page rather than lost', async () => {
  const api = goalsApi();
  api.failNextLoad();
  render(
    <section aria-labelledby="page">
      <h1 id="page">12-week routines</h1>
      <TwelveWeek />
    </section>,
  );
  await flush();
  const retry = button('Reload goals');
  retry.focus();
  fireEvent.click(retry);
  await flush();
  expect(screen.getByRole('region', { name: '12-week routines' })).toHaveFocus();
});

const stubResize = () =>
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );

test('a goal gone while its link panel is open says so and moves focus to the new goal field', async () => {
  stubResize();
  const api = goalsApi({ current: twoGoals() });
  render(<TwelveWeek />);
  await flush();
  press('Link routines to Read a book');
  await flush();
  api.removeElsewhere('1');
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await flush();
  expect(within(goalsCard()).getByRole('alert')).toHaveTextContent(
    "Could not save routine links because 'Read a book' is no longer in this period's goals",
  );
  expect(screen.getByRole('textbox', { name: 'New goal' })).toHaveFocus();
});

test('a panel closed before its goal goes says nothing', async () => {
  stubResize();
  const api = goalsApi({ current: twoGoals() });
  render(<TwelveWeek />);
  await flush();
  press('Link routines to Read a book');
  await flush();
  fireEvent.click(within(goalsCard()).getByRole('button', { name: 'Close' }));
  await flush();
  api.removeElsewhere('1');
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await flush();
  expect(within(goalsCard()).queryByRole('alert')).not.toBeInTheDocument();
});

test('editing a goal\u2019s name keeps its open link panel and what was ticked', async () => {
  stubResize();
  goalsApi({ current: twoGoals() });
  render(<TwelveWeek />);
  await flush();
  press('Link routines to Read a book');
  await flush();
  fireEvent.click(within(goalsCard()).getByRole('checkbox', { name: 'Wake at 6' }));
  press('Rename Read a book');
  expect(screen.getByRole('textbox', { name: 'New name for Read a book' })).toHaveFocus();
  expect(within(goalsCard()).getByRole('checkbox', { name: 'Wake at 6' })).toBeChecked();
});

test('removing a goal with its link panel open reports the removal, not a failure', async () => {
  stubResize();
  goalsApi({ current: twoGoals() });
  render(<TwelveWeek />);
  await flush();
  press('Link routines to Read a book');
  await flush();
  press('Delete Read a book');
  press('Confirm deleting Read a book');
  await flush();
  expect(within(goalsCard()).queryByRole('alert')).not.toBeInTheDocument();
  expect(within(goalsCard()).getByRole('status')).toHaveTextContent(
    "Deleted the goal 'Read a book'",
  );
});

const reloadList = async () => {
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await flush();
};

test('several panels lost at once are all named', async () => {
  stubResize();
  const api = goalsApi({ current: twoGoals() });
  render(<TwelveWeek />);
  await flush();
  press('Link routines to Read a book');
  await flush();
  press('Link routines to Run');
  await flush();
  api.removeElsewhere('1');
  api.removeElsewhere('2');
  await reloadList();
  const alert = within(goalsCard()).getByRole('alert');
  expect(alert).toHaveTextContent("'Read a book'");
  expect(alert).toHaveTextContent("'Run'");
});

test('a goal lost while both editing it and linking it says both were lost', async () => {
  stubResize();
  const api = goalsApi({ current: twoGoals() });
  render(<TwelveWeek />);
  await flush();
  press('Link routines to Read a book');
  await flush();
  press('Rename Read a book');
  api.removeElsewhere('1');
  await reloadList();
  const alert = within(goalsCard()).getByRole('alert');
  expect(alert).toHaveTextContent('Could not save the edit');
  expect(alert).toHaveTextContent('Could not save routine links');
});

test('the notice names a goal by its current name', async () => {
  stubResize();
  const api = goalsApi({ current: twoGoals() });
  render(<TwelveWeek />);
  await flush();
  press('Link routines to Read a book');
  await flush();
  press('Rename Read a book');
  type('New name for Read a book', 'New name');
  fireEvent.submit(screen.getByRole('form', { name: 'Rename Read a book' }));
  await flush();
  api.removeElsewhere('1');
  await reloadList();
  expect(within(goalsCard()).getByRole('alert')).toHaveTextContent("'New name' is no longer");
});

test('a panel closed by saving or by a failed list says nothing when its goal goes', async () => {
  stubResize();
  const api = goalsApi({ current: twoGoals() });
  render(<TwelveWeek />);
  await flush();
  press('Link routines to Read a book');
  await flush();
  fireEvent.submit(screen.getByRole('form', { name: 'Link routines to Read a book' }));
  await flush();
  api.removeElsewhere('1');
  await reloadList();
  expect(within(goalsCard()).queryByRole('alert')).not.toBeInTheDocument();

  const working = vi.mocked(fetch).getMockImplementation()!;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) =>
      url === '/api/routines'
        ? Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve({ error: 'Server error' }),
          })
        : working(url, init),
    ),
  );
  press('Link routines to Run');
  await flush();
  expect(within(goalsCard()).getByRole('alert')).toHaveTextContent('Server error');
  vi.stubGlobal('fetch', vi.fn(working));
  api.removeElsewhere('2');
  await reloadList();
  expect(within(goalsCard()).queryByText(/Could not save routine links/)).not.toBeInTheDocument();
});
