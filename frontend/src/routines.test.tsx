import { act, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { groupByCategory } from './routine-groups';
import { DailyRoutines, type Routine } from './routines';

// Focus follows a reload, which on a busy machine can outlast the default one second.
configure({ asyncUtilTimeout: 10_000 });

type Seed = { id: string; name: string; category: string };

// A fake routine API with state, like the server: add, move, rename, archive, and 404 for
// a routine that is gone. Moved here from backend/test/app-ui.test.ts (#27).
function routineApi(seed: Seed[] = []) {
  let routines: Routine[] = seed.map((r, i) => ({ ...r, cadence: 'daily', sortOrder: i + 1 }));
  let nextId = 100;
  const writes: { method: string; path: string; body?: unknown }[] = [];
  const reply = (status: number, body: unknown) =>
    Promise.resolve(new Response(JSON.stringify(body), { status }));
  const notFound = () => reply(404, { error: 'Routine not found' });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const path = url.split('?')[0];
      if (method === 'GET') return reply(200, { routines });
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      writes.push({ method, path, body });
      const id = path.split('/')[3];
      const found = routines.find((r) => r.id === id);
      if (method === 'POST' && path === '/api/routines') {
        if (body.name === 'Duplicate')
          return reply(409, { error: 'This item is already registered' });
        const sortOrder = routines.filter((r) => r.category === body.category).length + 1;
        routines = [...routines, { ...body, id: String(nextId++), sortOrder }];
        return reply(201, {});
      }
      if (!found) return notFound();
      if (path.endsWith('/move')) {
        const group = routines
          .filter((r) => r.category === found.category)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        const other = group[group.indexOf(found) + (body.direction === 'up' ? -1 : 1)];
        if (other) [found.sortOrder, other.sortOrder] = [other.sortOrder, found.sortOrder];
        return reply(200, {});
      }
      if (path.endsWith('/archive')) {
        if (found.name === 'Archive fails') return reply(500, { error: 'A server error occurred' });
        routines = routines.filter((r) => r !== found);
        return reply(200, {});
      }
      if (body.name === 'Duplicate')
        return reply(409, { error: 'This item is already registered' });
      if (body.name === 'Fail') return reply(500, { error: 'A server error occurred' });
      found.name = body.name;
      return reply(200, {});
    }),
  );
  return {
    writes,
    archiveElsewhere: (id: string) => (routines = routines.filter((r) => r.id !== id)),
  };
}

const region = (label: string) => screen.getByRole('region', { name: `${label} routines` });
const names = (label: string) =>
  within(region(label))
    .queryAllByRole('listitem')
    .map((li) => li.firstElementChild?.textContent);

test('groups routines by category in the backend order and by sort order inside a group', () => {
  const groups = groupByCategory([
    { id: '2', name: 'Stretch', cadence: 'daily', category: 'exercise', sortOrder: 2 },
    { id: '1', name: 'Drink water', cadence: 'daily', category: 'wake', sortOrder: 1 },
    { id: '3', name: 'Push-ups', cadence: 'daily', category: 'exercise', sortOrder: 1 },
  ]);
  expect(groups.map((g) => g.key)).toEqual([
    'wake',
    'exercise',
    'diet',
    'housework',
    'care',
    'study',
    'reading',
  ]);
  expect(groups[1].routines.map((r) => r.name)).toEqual(['Push-ups', 'Stretch']);
});

test('the daily routine page lists all seven categories with empty states', async () => {
  routineApi();
  render(<DailyRoutines />);
  for (const label of [
    'Wake-up',
    'Exercise',
    'Diet',
    'Housework',
    'Self-care',
    'Study',
    'Reading',
  ]) {
    const group = await screen.findByRole('region', { name: `${label} routines` });
    expect(within(group).getByRole('heading', { level: 2, name: new RegExp(label) })).toBeVisible();
    expect(within(group).getByText('No routines yet')).toBeInTheDocument();
  }
});

test('adding a routine posts it to its category and shows it in the list', async () => {
  const api = routineApi();
  render(<DailyRoutines />);
  const reading = await screen.findByRole('region', { name: 'Reading routines' });
  fireEvent.change(within(reading).getByRole('textbox', { name: 'New Reading routine name' }), {
    target: { value: 'Read 10 pages' },
  });
  fireEvent.click(within(reading).getByRole('button', { name: 'Add' }));
  expect(
    await screen.findByText("Added the routine 'Read 10 pages' to Reading"),
  ).toBeInTheDocument();
  expect(api.writes).toEqual([
    {
      method: 'POST',
      path: '/api/routines',
      body: { name: 'Read 10 pages', cadence: 'daily', category: 'reading' },
    },
  ]);
  await waitFor(() => expect(names('Reading')).toEqual(['Read 10 pages']));
  expect(
    within(region('Reading')).getByRole('textbox', { name: 'New Reading routine name' }),
  ).toHaveValue('');
});

test('an empty name or a server error shows an English alert and keeps the draft', async () => {
  const api = routineApi();
  render(<DailyRoutines />);
  const wake = await screen.findByRole('region', { name: 'Wake-up routines' });
  fireEvent.click(within(wake).getByRole('button', { name: 'Add' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a routine name');
  expect(api.writes).toEqual([]);

  const input = within(wake).getByRole('textbox', { name: 'New Wake-up routine name' });
  fireEvent.change(input, { target: { value: 'Duplicate' } });
  fireEvent.click(within(wake).getByRole('button', { name: 'Add' }));
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('This item is already registered'),
  );
  expect(
    within(region('Wake-up')).getByRole('textbox', { name: 'New Wake-up routine name' }),
  ).toHaveValue('Duplicate');
});

test('routines can be reordered, renamed and archived after confirmation', async () => {
  const api = routineApi([
    { id: '1', name: 'Wake at 6', category: 'wake' },
    { id: '2', name: 'Drink water', category: 'wake' },
  ]);
  render(<DailyRoutines />);
  await screen.findByText('Wake at 6');
  expect(names('Wake-up')).toEqual(['Wake at 6', 'Drink water']);
  expect(screen.getByRole('button', { name: 'Move Wake at 6 up' })).toBeDisabled();

  fireEvent.click(screen.getByRole('button', { name: 'Move Drink water up' }));
  await waitFor(() => expect(names('Wake-up')).toEqual(['Drink water', 'Wake at 6']));
  expect(api.writes.at(-1)).toEqual({
    method: 'POST',
    path: '/api/routines/2/move',
    body: { direction: 'up' },
  });

  fireEvent.click(screen.getByRole('button', { name: 'Rename Wake at 6' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'New name for Wake at 6' }), {
    target: { value: 'Wake at 6:30' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(names('Wake-up')).toEqual(['Drink water', 'Wake at 6:30']));
  expect(api.writes.at(-1)).toEqual({
    method: 'PATCH',
    path: '/api/routines/1',
    body: { name: 'Wake at 6:30' },
  });

  // The first press only asks for confirmation; nothing is archived yet.
  fireEvent.click(screen.getByRole('button', { name: 'Archive Drink water' }));
  expect(api.writes.at(-1)?.method).toBe('PATCH');
  fireEvent.click(screen.getByRole('button', { name: 'Confirm archiving Drink water' }));
  await waitFor(() => expect(names('Wake-up')).toEqual(['Wake at 6:30']));
  expect(api.writes.at(-1)).toEqual({
    method: 'POST',
    path: '/api/routines/2/archive',
    body: undefined,
  });
  expect(screen.getByRole('status')).toHaveTextContent('Past records are kept');
});

test('a routine changed elsewhere shows the English 404 and the list reloads', async () => {
  const api = routineApi([
    { id: '1', name: 'Wake at 6', category: 'wake' },
    { id: '2', name: 'Drink water', category: 'wake' },
  ]);
  render(<DailyRoutines />);
  await screen.findByText('Drink water');
  api.archiveElsewhere('2');
  fireEvent.click(screen.getByRole('button', { name: 'Move Drink water up' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Routine not found');
  await waitFor(() => expect(names('Wake-up')).toEqual(['Wake at 6']));
});

const twoRoutines = [
  { id: '1', name: 'Wake at 6', category: 'wake' },
  { id: '2', name: 'Drink water', category: 'wake' },
];
const button = (name: string) => screen.getByRole('button', { name });

test('saving a rename returns focus to its edit button', async () => {
  routineApi(twoRoutines);
  render(<DailyRoutines />);
  await screen.findByText('Wake at 6');
  fireEvent.click(button('Rename Wake at 6'));
  const input = screen.getByRole('textbox', { name: 'New name for Wake at 6' });
  expect(input).toHaveFocus();
  fireEvent.change(input, { target: { value: 'Wake up early' } });
  fireEvent.click(button('Save'));
  await waitFor(() => expect(button('Rename Wake up early')).toHaveFocus());
});

test('cancelling a rename returns focus to its edit button', async () => {
  routineApi(twoRoutines);
  render(<DailyRoutines />);
  await screen.findByText('Wake at 6');
  fireEvent.click(button('Rename Wake at 6'));
  fireEvent.click(button('Cancel'));
  await waitFor(() => expect(button('Rename Wake at 6')).toHaveFocus());
});

test('a rename that fails keeps the form and returns focus to its field', async () => {
  routineApi(twoRoutines);
  render(<DailyRoutines />);
  await screen.findByText('Wake at 6');
  fireEvent.click(button('Rename Wake at 6'));
  const input = screen.getByRole('textbox', { name: 'New name for Wake at 6' });
  fireEvent.change(input, { target: { value: 'Duplicate' } });
  input.blur();
  fireEvent.click(button('Save'));
  await screen.findByRole('alert');
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'New name for Wake at 6' })).toHaveFocus(),
  );
  expect(screen.getByRole('textbox', { name: 'New name for Wake at 6' })).toHaveValue('Duplicate');
});

test('renaming a routine that has gone moves focus to the add field', async () => {
  const api = routineApi(twoRoutines);
  render(<DailyRoutines />);
  await screen.findByText('Wake at 6');
  fireEvent.click(button('Rename Wake at 6'));
  api.archiveElsewhere('1');
  fireEvent.click(button('Save'));
  await screen.findByRole('alert');
  await waitFor(() =>
    expect(
      screen.queryByRole('textbox', { name: 'New name for Wake at 6' }),
    ).not.toBeInTheDocument(),
  );
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'New Wake-up routine name' })).toHaveFocus(),
  );
});

test('moving a routine that has gone moves focus to the add field', async () => {
  const api = routineApi(twoRoutines);
  render(<DailyRoutines />);
  await screen.findByText('Drink water');
  api.archiveElsewhere('2');
  fireEvent.click(button('Move Drink water up'));
  await screen.findByRole('alert');
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'New Wake-up routine name' })).toHaveFocus(),
  );
});

test('an archive that fails stays on its own row', async () => {
  routineApi([{ id: '1', name: 'Archive fails', category: 'wake' }, twoRoutines[1]]);
  render(<DailyRoutines />);
  await screen.findByText('Archive fails');
  fireEvent.click(button('Archive Archive fails'));
  fireEvent.click(button('Confirm archiving Archive fails'));
  await screen.findByRole('alert');
  await waitFor(() => expect(button('Rename Archive fails')).toHaveFocus());
});

test('moving a routine keeps focus on the same button', async () => {
  routineApi([...twoRoutines, { id: '3', name: 'Stretch', category: 'wake' }]);
  render(<DailyRoutines />);
  await screen.findByText('Stretch');
  fireEvent.click(button('Move Stretch up'));
  await waitFor(() => expect(names('Wake-up')).toEqual(['Wake at 6', 'Stretch', 'Drink water']));
  await waitFor(() => expect(button('Move Stretch up')).toHaveFocus());
});

test('a routine moved to the end of its group hands focus to the other direction', async () => {
  routineApi(twoRoutines);
  render(<DailyRoutines />);
  await screen.findByText('Drink water');
  // The pressed button keeps focus while disabled, as some browsers do; that is not moving on.
  button('Move Drink water up').focus();
  fireEvent.click(button('Move Drink water up'));
  await waitFor(() => expect(names('Wake-up')).toEqual(['Drink water', 'Wake at 6']));
  expect(button('Move Drink water up')).toBeDisabled();
  await waitFor(() => expect(button('Move Drink water down')).toHaveFocus());
});

test('archiving moves focus to the next routine, then the previous one', async () => {
  routineApi([...twoRoutines, { id: '3', name: 'Stretch', category: 'wake' }]);
  render(<DailyRoutines />);
  await screen.findByText('Stretch');
  fireEvent.click(button('Archive Drink water'));
  fireEvent.click(button('Confirm archiving Drink water'));
  await waitFor(() => expect(button('Rename Stretch')).toHaveFocus());

  fireEvent.click(button('Archive Stretch'));
  fireEvent.click(button('Confirm archiving Stretch'));
  await waitFor(() => expect(button('Rename Wake at 6')).toHaveFocus());
});

test('archiving the last routine of a group moves focus to the add field', async () => {
  routineApi([{ id: '1', name: 'Wake at 6', category: 'wake' }]);
  render(<DailyRoutines />);
  await screen.findByText('Wake at 6');
  fireEvent.click(button('Archive Wake at 6'));
  fireEvent.click(button('Confirm archiving Wake at 6'));
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'New Wake-up routine name' })).toHaveFocus(),
  );
});

test('adding a routine returns focus to the add field, ready for the next one', async () => {
  routineApi();
  render(<DailyRoutines />);
  const reading = await screen.findByRole('region', { name: 'Reading routines' });
  fireEvent.change(within(reading).getByRole('textbox', { name: 'New Reading routine name' }), {
    target: { value: 'Read 10 pages' },
  });
  fireEvent.click(within(reading).getByRole('button', { name: 'Add' }));
  await screen.findByText('Read 10 pages');
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'New Reading routine name' })).toHaveFocus(),
  );
});

test('a change does not take focus back once the user has moved on', async () => {
  routineApi(twoRoutines);
  render(<DailyRoutines />);
  await screen.findByText('Wake at 6');
  // Answers wait until released, as on a slow connection.
  const working = vi.mocked(fetch).getMockImplementation()!;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => gate.then(() => working(url, init))),
  );
  const wake = screen.getByRole('textbox', { name: 'New Wake-up routine name' });
  wake.focus();
  fireEvent.change(wake, { target: { value: 'Morning stretch' } });
  fireEvent.click(within(region('Wake-up')).getByRole('button', { name: 'Add' }));

  const reading = screen.getByRole('textbox', { name: 'New Reading routine name' });
  reading.focus();
  release();
  await screen.findByText('Morning stretch');
  await act(() => new Promise((resolve) => setTimeout(resolve)));
  expect(reading).toHaveFocus();
});

test('a reload from elsewhere does not move focus', async () => {
  routineApi(twoRoutines);
  render(<DailyRoutines />);
  await screen.findByText('Wake at 6');
  const add = screen.getByRole('textbox', { name: 'New Exercise routine name' });
  add.focus();
  const loads = vi.mocked(fetch).mock.calls.length;
  document.dispatchEvent(new Event('visibilitychange'));
  await act(() => new Promise((resolve) => setTimeout(resolve)));
  // The routines and the projects a routine can link to.
  expect(vi.mocked(fetch).mock.calls.length).toBe(loads + 2);
  expect(add).toHaveFocus();
});

test('on a touch screen no field takes focus, so no keyboard pops up unasked', async () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: query === '(pointer: coarse)' })),
  );
  routineApi([{ id: '1', name: 'Wake at 6', category: 'wake' }]);
  render(<DailyRoutines />);
  await screen.findByText('Wake at 6');
  fireEvent.click(button('Archive Wake at 6'));
  fireEvent.click(button('Confirm archiving Wake at 6'));
  await waitFor(() => expect(screen.queryByText('Wake at 6')).not.toBeInTheDocument());
  await act(() => new Promise((resolve) => setTimeout(resolve)));
  expect(screen.getByRole('textbox', { name: 'New Wake-up routine name' })).not.toHaveFocus();
});

// Projects and project links on top of a routine fake; a save follows failLink.
function linkApi(seed: Seed[], options: { failLink?: boolean } = {}) {
  routineApi(seed);
  const working = vi.mocked(fetch).getMockImplementation()!;
  const linkWrites: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/project-links')
        return Promise.resolve(
          new Response(
            JSON.stringify({
              projects: [{ id: '7', name: 'Reading log', url: 'https://books.example/' }],
            }),
          ),
        );
      if (url.endsWith('/project-link')) {
        linkWrites.push({ url, body: JSON.parse(String(init?.body)) });
        return Promise.resolve(
          options.failLink
            ? new Response(JSON.stringify({ error: 'Routine or project not found' }), {
                status: 404,
              })
            : new Response(JSON.stringify({ routine: {} })),
        );
      }
      return working(url, init);
    }),
  );
  return linkWrites;
}

const linkSelect = () => screen.findByRole('combobox', { name: 'Project to link to Read 30 min' });

test('a routine can be linked to a registered project, and focus stays on the choice', async () => {
  const writes = linkApi([{ id: '1', name: 'Read 30 min', category: 'reading' }]);
  render(<DailyRoutines />);
  const select = await linkSelect();
  expect(select).toHaveValue('');
  select.focus();
  fireEvent.change(select, { target: { value: '7' } });
  await screen.findByText("Linked a project to the routine 'Read 30 min'");
  expect(writes).toEqual([{ url: '/api/routines/1/project-link', body: { projectLinkId: '7' } }]);
  await waitFor(async () => expect(await linkSelect()).toHaveFocus());
});

test('a routine already linked shows its project, and unlinking sends null', async () => {
  const writes = linkApi([
    { id: '1', name: 'Read 30 min', category: 'reading', projectLinkId: '7' } as Seed,
  ]);
  render(<DailyRoutines />);
  const select = await linkSelect();
  await waitFor(() => expect(select).toHaveValue('7'));
  fireEvent.change(select, { target: { value: '' } });
  await screen.findByText("Unlinked the routine 'Read 30 min'");
  expect(writes).toEqual([{ url: '/api/routines/1/project-link', body: { projectLinkId: null } }]);
});

test('a link that fails shows the English error and leaves the choice as it was', async () => {
  linkApi([{ id: '1', name: 'Read 30 min', category: 'reading' }], { failLink: true });
  render(<DailyRoutines />);
  const select = await linkSelect();
  fireEvent.change(select, { target: { value: '7' } });
  expect(await screen.findByRole('alert')).toHaveTextContent('Routine or project not found');
  expect(await linkSelect()).toHaveValue('');
});

test('with no projects registered a routine offers no link', async () => {
  routineApi(twoRoutines);
  render(<DailyRoutines />);
  await screen.findByText('Wake at 6');
  await act(() => new Promise((resolve) => setTimeout(resolve)));
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
});

// Writes wait until released, as on a slow connection.
function holdWrites() {
  const working = vi.mocked(fetch).getMockImplementation()!;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) =>
      (init?.method ?? 'GET') === 'GET' ? working(url, init) : gate.then(() => working(url, init)),
    ),
  );
  return () => release();
}

test('only the add button that was pressed spins', async () => {
  routineApi(twoRoutines);
  render(<DailyRoutines />);
  await screen.findByText('Wake at 6');
  const release = holdWrites();
  fireEvent.change(screen.getByRole('textbox', { name: 'New Wake-up routine name' }), {
    target: { value: 'Morning stretch' },
  });
  fireEvent.click(within(region('Wake-up')).getByRole('button', { name: 'Add' }));
  await act(() => new Promise((resolve) => setTimeout(resolve)));
  expect(screen.getAllByRole('status', { name: 'Saving' })).toHaveLength(1);
  expect(within(region('Wake-up')).getByRole('status', { name: 'Saving' })).toBeInTheDocument();
  release();
  await screen.findByText('Morning stretch');
  await waitFor(() =>
    expect(screen.queryByRole('status', { name: 'Saving' })).not.toBeInTheDocument(),
  );
});

test('moving a routine spins nothing, and an archive spins only its own row', async () => {
  routineApi(twoRoutines);
  render(<DailyRoutines />);
  await screen.findByText('Wake at 6');
  const release = holdWrites();
  fireEvent.click(button('Move Drink water up'));
  await act(() => new Promise((resolve) => setTimeout(resolve)));
  expect(screen.queryByRole('status', { name: /ing/ })).not.toBeInTheDocument();
  release();
  await waitFor(() => expect(button('Rename Drink water')).not.toBeDisabled());

  const again = holdWrites();
  fireEvent.click(button('Archive Wake at 6'));
  fireEvent.click(button('Confirm archiving Wake at 6'));
  await act(() => new Promise((resolve) => setTimeout(resolve)));
  expect(
    within(button('Confirm archiving Wake at 6')).getByRole('status', { name: 'Working' }),
  ).toBeInTheDocument();
  expect(screen.getAllByRole('status', { name: /ing/ })).toHaveLength(1);
  again();
});
