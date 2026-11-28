import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { expect, test, vi } from 'vitest';

import { emptyGrid, mirrorGrid } from './mandalart-cells';
import { Mandalarts, MandalartView } from './mandalarts';
import { findLive } from './test/live';
import { render } from './test/render';

type Stored = { id: number; title: string; cells: string[][] };
type Write = { method: string; path: string; body?: Record<string, unknown> };

const reply = (status: number, body: unknown) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(structuredClone(body)) });

// An in-memory copy of the Mandalart API, so a save is read back the way the server would send it.
function api(seed: Stored[] = [], options: { failSave?: string } = {}) {
  let items = seed.map((item) => ({ ...item, cells: mirrorGrid(item.cells) }));
  let nextId = 50;
  const writes: Write[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : undefined;
      if (method !== 'GET') writes.push({ method, path, body });
      const match = /^\/api\/mandalarts(?:\/(\d+))?(\/cells)?$/.exec(path);
      const id = match?.[1] ? Number(match[1]) : undefined;
      const found = items.find((item) => item.id === id);
      if (method === 'GET' && id === undefined)
        return reply(200, {
          mandalarts: items.map(({ id: itemId, title }) => ({
            id: itemId,
            title,
            filledCount: 0,
            updatedAt: 'x',
          })),
        });
      if (method === 'POST') {
        const created = { id: nextId++, title: String(body?.title), cells: emptyGrid() };
        items = [...items, created];
        return reply(201, { mandalart: created });
      }
      if (!found) return reply(404, { error: 'Mandalart not found' });
      if (method === 'GET') return reply(200, { mandalart: found });
      if (method === 'DELETE') {
        items = items.filter((item) => item !== found);
        return reply(200, { id });
      }
      if (options.failSave) return reply(400, { error: options.failSave });
      if (method === 'PATCH') found.title = String(body?.title);
      if (method === 'PUT') found.cells = mirrorGrid(body?.cells as string[][]);
      return reply(200, { mandalart: found });
    }),
  );
  return writes;
}

function screens(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/mandalarts" element={<Mandalarts />} />
        <Route path="/mandalarts/:id" element={<MandalartView />} />
      </Routes>
      <a href="/elsewhere">Elsewhere</a>
    </MemoryRouter>,
  );
}

const health = () => {
  const cells = emptyGrid();
  cells[4][4] = 'Be healthy';
  cells[4][0] = 'Sleep well';
  return { id: 5, title: 'Health', cells };
};
// Fields, cells and groups are found by their label text, not by role and name. A role query with a name works out the
// name of every one of the ~100 inputs and ~160 list items on the editor page: 40-150 ms when idle, and over the 1 s
// wait of findBy* on a busy machine.
const field = (label: string, scope: Pick<typeof screen, 'getByLabelText'> = screen) =>
  scope.getByLabelText<HTMLInputElement>(label, { selector: 'input' });
const type = (label: string, value: string, scope?: Pick<typeof screen, 'getByLabelText'>) =>
  fireEvent.change(field(label, scope), { target: { value } });

test('a new Mandalart needs a title, is created with it and opens ready to fill in', async () => {
  const writes = api();
  screens('/mandalarts');
  fireEvent.click(await screen.findByRole('button', { name: 'New Mandalart' }));
  const dialog = await screen.findByRole('dialog', { name: 'New Mandalart' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
  expect(await within(dialog).findByText('Enter a title')).toBeInTheDocument();
  expect(writes).toEqual([]);
  type('Title', ' Health ', within(dialog));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
  // The editor is ready when its main goal field is there; the heading is then already on the page.
  expect(await screen.findByLabelText('Main goal', { selector: 'input' })).toHaveValue('');
  expect(screen.getByRole('heading', { name: 'Editing Health' })).toBeInTheDocument();
  expect(writes[0]).toMatchObject({ method: 'POST', body: { title: ' Health ' } });
});

test('editing a sub-goal updates its copy in the matching block before saving, and one save sends the whole grid', async () => {
  const writes = api([health()]);
  screens('/mandalarts/5');
  fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
  expect(await screen.findByLabelText('Main goal', { selector: 'input' })).toHaveValue(
    'Be healthy',
  );
  expect(screen.queryByText('You have unsaved changes')).not.toBeInTheDocument();

  type('Sub-goal 2', 'Eat well');
  expect(screen.getByLabelText('Sub-goal 2 (centre of its block): Eat well')).toBeInTheDocument();
  const group = screen
    .getByText('Sub-goal 2: Eat well', { selector: 'legend' })
    .closest('fieldset')!;
  type('Action 3 of sub-goal 2', 'No sugar', within(group));
  expect(screen.getByText('You have unsaved changes')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText('Saved the Mandalart')).toBeInTheDocument();
  const put = writes.find((write) => write.method === 'PUT');
  const sent = put?.body?.cells as string[][];
  expect(put?.path).toBe('/api/mandalarts/5/cells');
  expect(sent[4][1]).toBe('Eat well');
  expect(sent[1][4]).toBe('Eat well');
  expect(sent[1][2]).toBe('No sugar');
  expect(writes.some((write) => write.method === 'PATCH')).toBe(false);
  // Back in the grid view, the saved grid.
  expect(await screen.findByLabelText('Action 3 of sub-goal 2: No sugar')).toBeInTheDocument();
});

test('a changed title is saved too, a blank title is refused before any request', async () => {
  const writes = api([health()]);
  screens('/mandalarts/5');
  fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
  type('Title', '   ');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText('Enter a title')).toBeInTheDocument();
  expect(writes).toEqual([]);
  type('Title', 'Fitness');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText('Saved the Mandalart')).toBeInTheDocument();
  expect(writes.map((write) => write.method)).toEqual(['PUT', 'PATCH']);
  expect(writes[1].body).toEqual({ title: 'Fitness' });
  expect(await screen.findByRole('heading', { name: 'Fitness' })).toBeInTheDocument();
});

test('a refused save keeps what was typed and shows the server message', async () => {
  api([health()], { failSave: 'A cell must be 100 characters or fewer' });
  screens('/mandalarts/5');
  fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
  type('Main goal', 'Be very healthy');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await findLive('alert')).toHaveTextContent('A cell must be 100 characters or fewer');
  expect(field('Main goal')).toHaveValue('Be very healthy');
});

test('cancelling asks before dropping typed input, and a link inside the app asks too', async () => {
  api([health()]);
  screens('/mandalarts/5');
  fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
  // Nothing typed: Cancel leaves at once.
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(await screen.findByRole('button', { name: 'Edit' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  type('Main goal', 'Changed');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  const discard = await screen.findByRole('dialog', { name: 'Discard your changes?' });
  fireEvent.click(within(discard).getByRole('button', { name: 'Cancel' }));
  expect(field('Main goal')).toHaveValue('Changed');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.click(
    within(await screen.findByRole('dialog', { name: 'Discard your changes?' })).getByRole(
      'button',
      { name: 'Discard' },
    ),
  );
  expect(await screen.findByRole('button', { name: 'Edit' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  type('Main goal', 'Changed again');
  const link = screen.getByRole('link', { name: 'Elsewhere' });
  expect(fireEvent.click(link)).toBe(false);
  expect(await screen.findByRole('dialog', { name: 'Leave without saving?' })).toBeInTheDocument();
});

test('delete asks first, then removes the Mandalart and returns to the list', async () => {
  const writes = api([health()]);
  screens('/mandalarts/5');
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  const dialog = await screen.findByRole('dialog', { name: 'Delete "Health"?' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(writes).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  fireEvent.click(
    within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }),
  );
  expect(await screen.findByRole('heading', { name: 'No Mandalarts yet' })).toBeInTheDocument();
  expect(writes).toEqual([{ method: 'DELETE', path: '/api/mandalarts/5', body: undefined }]);
});
