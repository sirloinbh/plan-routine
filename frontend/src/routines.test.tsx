import { act, configure, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { groupByCategory } from './routine-groups';
import { DailyRoutines, type Routine } from './routines';
import { findLive, getLive } from './test/live';
import { render } from './test/render';
import { unexpectedRequest } from './test/unexpected-request';

// Focus follows a reload, which on a busy machine can outlast the default one second.
configure({ asyncUtilTimeout: 10_000 });

type Seed = { id: number; name: string; category: string };

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
      const path = new URL(url, 'http://localhost').pathname;
      if (method === 'GET') {
        if (path === '/api/routines') return reply(200, { routines });
        if (path === '/api/project-links') return reply(200, { projects: [] });
        return unexpectedRequest(method, url);
      }
      const knownWrite =
        (method === 'POST' && /^\/api\/routines(\/\d+\/(move|archive))?$/.test(path)) ||
        (method === 'PATCH' && /^\/api\/routines\/\d+$/.test(path));
      if (!knownWrite) return unexpectedRequest(method, url);
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      writes.push({ method, path, body });
      const id = Number(path.split('/')[3]);
      const found = routines.find((r) => r.id === id);
      if (method === 'POST' && path === '/api/routines') {
        if (body.name === 'Duplicate')
          return reply(409, { error: 'This item is already registered' });
        const sortOrder = routines.filter((r) => r.category === body.category).length + 1;
        routines = [...routines, { ...body, id: nextId++, sortOrder }];
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
    archiveElsewhere: (id: number) => (routines = routines.filter((r) => r.id !== id)),
  };
}

// The query layer tells the screen about a result one timer tick after the answer arrives.
const tick = () => new Promise((resolve) => setTimeout(resolve));
const flush = () =>
  act(async () => {
    await tick();
    await tick();
  });
const region = (label: string) => screen.getByRole('region', { name: `${label} routines` });
const names = (label: string) =>
  within(region(label))
    .queryAllByRole('listitem')
    .map((li) => li.firstElementChild?.textContent);

test('groups routines by category in the backend order and by sort order inside a group', () => {
  const groups = groupByCategory([
    { id: 2, name: 'Stretch', cadence: 'daily', category: 'exercise', sortOrder: 2 },
    { id: 1, name: 'Drink water', cadence: 'daily', category: 'wake', sortOrder: 1 },
    { id: 3, name: 'Push-ups', cadence: 'daily', category: 'exercise', sortOrder: 1 },
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

test('a routine with an unknown category shows in an Other group without an add form', async () => {
  routineApi([{ id: 7, name: 'Mystery habit', category: 'sleep' }]);
  render(<DailyRoutines />);
  const other = await screen.findByRole('region', { name: 'Other routines' });
  expect(within(other).getByText('Mystery habit')).toBeVisible();
  expect(within(other).queryByRole('form')).not.toBeInTheDocument();
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

test('add forms read as whole English phrases', async () => {
  routineApi();
  render(<DailyRoutines />);
  expect(await screen.findByRole('form', { name: 'Add an exercise routine' })).toBeVisible();
  expect(screen.getByRole('form', { name: 'Add a wake-up routine' })).toBeVisible();
  expect(screen.getByRole('textbox', { name: 'New exercise routine name' })).toBeVisible();
});

test('adding a routine posts it to its category and shows it in the list', async () => {
  const api = routineApi();
  render(<DailyRoutines />);
  const reading = await screen.findByRole('region', { name: 'Reading routines' });
  fireEvent.change(within(reading).getByRole('textbox', { name: 'New reading routine name' }), {
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
    within(region('Reading')).getByRole('textbox', { name: 'New reading routine name' }),
  ).toHaveValue('');
});

test('an empty name or a server error shows an English alert and keeps the draft', async () => {
  const api = routineApi();
  render(<DailyRoutines />);
  const wake = await screen.findByRole('region', { name: 'Wake-up routines' });
  fireEvent.click(within(wake).getByRole('button', { name: 'Add' }));
  expect(await findLive('alert')).toHaveTextContent('Enter a routine name');
  expect(api.writes).toEqual([]);

  const input = within(wake).getByRole('textbox', { name: 'New wake-up routine name' });
  fireEvent.change(input, { target: { value: 'Duplicate' } });
  fireEvent.click(within(wake).getByRole('button', { name: 'Add' }));
  await waitFor(() =>
    expect(getLive('alert')).toHaveTextContent('This item is already registered'),
  );
  expect(
    within(region('Wake-up')).getByRole('textbox', { name: 'New wake-up routine name' }),
  ).toHaveValue('Duplicate');
});

test('routines can be reordered, renamed and archived after confirmation', async () => {
  const api = routineApi([
    { id: 1, name: 'Wake at 6', category: 'wake' },
    { id: 2, name: 'Drink water', category: 'wake' },
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
  expect(getLive('status')).toHaveTextContent('Past records are kept');
});

test('a routine changed elsewhere shows the English 404 and the list reloads', async () => {
  const api = routineApi([
    { id: 1, name: 'Wake at 6', category: 'wake' },
    { id: 2, name: 'Drink water', category: 'wake' },
  ]);
  render(<DailyRoutines />);
  await screen.findByText('Drink water');
  api.archiveElsewhere(2);
  fireEvent.click(screen.getByRole('button', { name: 'Move Drink water up' }));
  expect(await findLive('alert')).toHaveTextContent('Routine not found');
  await waitFor(() => expect(names('Wake-up')).toEqual(['Wake at 6']));
});

const twoRoutines = [
  { id: 1, name: 'Wake at 6', category: 'wake' },
  { id: 2, name: 'Drink water', category: 'wake' },
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
  await findLive('alert');
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
  api.archiveElsewhere(1);
  fireEvent.click(button('Save'));
  await findLive('alert');
  await waitFor(() =>
    expect(
      screen.queryByRole('textbox', { name: 'New name for Wake at 6' }),
    ).not.toBeInTheDocument(),
  );
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'New wake-up routine name' })).toHaveFocus(),
  );
});

test('moving a routine that has gone moves focus to the add field', async () => {
  const api = routineApi(twoRoutines);
  render(<DailyRoutines />);
  await screen.findByText('Drink water');
  api.archiveElsewhere(2);
  fireEvent.click(button('Move Drink water up'));
  await findLive('alert');
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'New wake-up routine name' })).toHaveFocus(),
  );
});

test('an archive that fails stays on its own row', async () => {
  routineApi([{ id: 1, name: 'Archive fails', category: 'wake' }, twoRoutines[1]]);
  render(<DailyRoutines />);
  await screen.findByText('Archive fails');
  fireEvent.click(button('Archive Archive fails'));
  fireEvent.click(button('Confirm archiving Archive fails'));
  await findLive('alert');
  await waitFor(() => expect(button('Rename Archive fails')).toHaveFocus());
});

test('moving a routine keeps focus on the same button', async () => {
  routineApi([...twoRoutines, { id: 3, name: 'Stretch', category: 'wake' }]);
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
  routineApi([...twoRoutines, { id: 3, name: 'Stretch', category: 'wake' }]);
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
  routineApi([{ id: 1, name: 'Wake at 6', category: 'wake' }]);
  render(<DailyRoutines />);
  await screen.findByText('Wake at 6');
  fireEvent.click(button('Archive Wake at 6'));
  fireEvent.click(button('Confirm archiving Wake at 6'));
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'New wake-up routine name' })).toHaveFocus(),
  );
});

test('adding a routine returns focus to the add field, ready for the next one', async () => {
  routineApi();
  render(<DailyRoutines />);
  const reading = await screen.findByRole('region', { name: 'Reading routines' });
  fireEvent.change(within(reading).getByRole('textbox', { name: 'New reading routine name' }), {
    target: { value: 'Read 10 pages' },
  });
  fireEvent.click(within(reading).getByRole('button', { name: 'Add' }));
  await screen.findByText('Read 10 pages');
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'New reading routine name' })).toHaveFocus(),
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
  const wake = screen.getByRole('textbox', { name: 'New wake-up routine name' });
  wake.focus();
  fireEvent.change(wake, { target: { value: 'Morning stretch' } });
  fireEvent.click(within(region('Wake-up')).getByRole('button', { name: 'Add' }));

  const reading = screen.getByRole('textbox', { name: 'New reading routine name' });
  reading.focus();
  release();
  await screen.findByText('Morning stretch');
  await flush();
  expect(reading).toHaveFocus();
});

test('a reload from elsewhere does not move focus', async () => {
  routineApi(twoRoutines);
  render(<DailyRoutines />);
  await screen.findByText('Wake at 6');
  const add = screen.getByRole('textbox', { name: 'New exercise routine name' });
  add.focus();
  const loads = vi.mocked(fetch).mock.calls.length;
  document.dispatchEvent(new Event('visibilitychange'));
  await flush();
  // The routines and the projects a routine can link to.
  expect(vi.mocked(fetch).mock.calls.length).toBe(loads + 2);
  expect(add).toHaveFocus();
});

test('on a touch screen no field takes focus, so no keyboard pops up unasked', async () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: query === '(pointer: coarse)' })),
  );
  routineApi([{ id: 1, name: 'Wake at 6', category: 'wake' }]);
  render(<DailyRoutines />);
  await screen.findByText('Wake at 6');
  fireEvent.click(button('Archive Wake at 6'));
  fireEvent.click(button('Confirm archiving Wake at 6'));
  await waitFor(() => expect(screen.queryByText('Wake at 6')).not.toBeInTheDocument());
  await flush();
  expect(screen.getByRole('textbox', { name: 'New wake-up routine name' })).not.toHaveFocus();
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
              projects: [{ id: 7, name: 'Reading log', url: 'https://books.example/' }],
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
  const writes = linkApi([{ id: 1, name: 'Read 30 min', category: 'reading' }]);
  render(<DailyRoutines />);
  const select = await linkSelect();
  expect(select).toHaveValue('');
  select.focus();
  fireEvent.change(select, { target: { value: '7' } });
  await screen.findByText("Linked a project to the routine 'Read 30 min'");
  expect(writes).toEqual([{ url: '/api/routines/1/project-link', body: { projectLinkId: 7 } }]);
  await waitFor(async () => expect(await linkSelect()).toHaveFocus());
});

test('a routine already linked shows its project, and unlinking sends null', async () => {
  const writes = linkApi([
    { id: 1, name: 'Read 30 min', category: 'reading', projectLinkId: 7 } as Seed,
  ]);
  render(<DailyRoutines />);
  const select = await linkSelect();
  await waitFor(() => expect(select).toHaveValue('7'));
  fireEvent.change(select, { target: { value: '' } });
  await screen.findByText("Unlinked the routine 'Read 30 min'");
  expect(writes).toEqual([{ url: '/api/routines/1/project-link', body: { projectLinkId: null } }]);
});

test('a link that fails shows the English error and leaves the choice as it was', async () => {
  linkApi([{ id: 1, name: 'Read 30 min', category: 'reading' }], { failLink: true });
  render(<DailyRoutines />);
  const select = await linkSelect();
  fireEvent.change(select, { target: { value: '7' } });
  expect(await findLive('alert')).toHaveTextContent('Routine or project not found');
  expect(await linkSelect()).toHaveValue('');
});

test('with no projects registered a routine offers no link', async () => {
  routineApi(twoRoutines);
  render(<DailyRoutines />);
  await screen.findByText('Wake at 6');
  await flush();
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
  fireEvent.change(screen.getByRole('textbox', { name: 'New wake-up routine name' }), {
    target: { value: 'Morning stretch' },
  });
  fireEvent.click(within(region('Wake-up')).getByRole('button', { name: 'Add' }));
  await flush();
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
  await flush();
  expect(screen.queryByRole('status', { name: /ing/ })).not.toBeInTheDocument();
  release();
  await waitFor(() => expect(button('Rename Drink water')).not.toBeDisabled());

  const again = holdWrites();
  fireEvent.click(button('Archive Wake at 6'));
  fireEvent.click(button('Confirm archiving Wake at 6'));
  await flush();
  expect(
    within(button('Confirm archiving Wake at 6')).getByRole('status', { name: 'Working' }),
  ).toBeInTheDocument();
  expect(screen.getAllByRole('status', { name: /ing/ })).toHaveLength(1);
  again();
  // The archive and the reload that follows finish inside the test.
  await waitFor(() => expect(screen.queryByText('Wake at 6')).not.toBeInTheDocument());
  await waitFor(() =>
    expect(screen.queryByRole('status', { name: /ing/ })).not.toBeInTheDocument(),
  );
  expect(screen.getByText('Drink water')).toBeVisible();
});

test('a failed project list says so instead of looking like no projects', async () => {
  routineApi(twoRoutines);
  const working = vi.mocked(fetch).getMockImplementation()!;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) =>
      url === '/api/project-links'
        ? Promise.resolve(
            new Response(JSON.stringify({ error: 'A server error occurred' }), { status: 500 }),
          )
        : working(url, init),
    ),
  );
  render(<DailyRoutines />);
  await screen.findByText('Wake at 6');
  await flush();
  expect(getLive('alert')).toHaveTextContent(
    'Could not load the projects a routine can link to. A server error occurred',
  );
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
});

test('a daily routine can be added on chosen weekdays, which the list then shows', async () => {
  const api = routineApi();
  render(<DailyRoutines />);
  const exercise = await screen.findByRole('region', { name: 'Exercise routines' });
  fireEvent.change(within(exercise).getByRole('textbox', { name: 'New exercise routine name' }), {
    target: { value: 'Run' },
  });
  for (const day of ['Wednesday', 'Monday', 'Friday'])
    fireEvent.click(within(exercise).getByRole('button', { name: day }));
  expect(within(exercise).getByRole('button', { name: 'Monday' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  fireEvent.click(within(exercise).getByRole('button', { name: 'Add' }));
  expect(await screen.findByText("Added the routine 'Run' to Exercise")).toBeInTheDocument();
  expect(api.writes[0].body).toEqual({
    name: 'Run',
    cadence: 'daily',
    category: 'exercise',
    weekdays: [1, 3, 5],
  });
  // The choice is cleared for the next routine.
  expect(within(exercise).getByRole('button', { name: 'Monday' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await waitFor(() => expect(within(exercise).getByText('Mon, Wed, Fri')).toBeInTheDocument());
});

test('a unit and target can be set when adding, and are shown in the list (#246)', async () => {
  const api = routineApi();
  render(<DailyRoutines />);
  const reading = await screen.findByRole('region', { name: 'Reading routines' });
  fireEvent.change(within(reading).getByRole('textbox', { name: 'New reading routine name' }), {
    target: { value: 'Read' },
  });
  // The target appears only once there is a unit.
  expect(within(reading).queryByRole('spinbutton')).toBeNull();
  fireEvent.change(within(reading).getByRole('textbox', { name: /^Unit for the new Reading/ }), {
    target: { value: ' pages ' },
  });
  fireEvent.change(within(reading).getByRole('spinbutton', { name: /^Target amount/ }), {
    target: { value: '20' },
  });
  fireEvent.click(within(reading).getByRole('button', { name: 'Add' }));
  expect(await screen.findByText("Added the routine 'Read' to Reading")).toBeInTheDocument();
  expect(api.writes[0].body).toEqual({
    name: 'Read',
    cadence: 'daily',
    category: 'reading',
    unit: 'pages',
    targetAmount: 20,
  });
  await waitFor(() => expect(within(reading).getByText('pages, target 20')).toBeInTheDocument());
});
