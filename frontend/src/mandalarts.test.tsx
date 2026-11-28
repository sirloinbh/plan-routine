import { fireEvent, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { expect, test, vi } from 'vitest';

import { cellLabel } from './mandalart-cells';
import { MandalartGrid, Mandalarts, MandalartView } from './mandalarts';
import { findLive } from './test/live';
import { render } from './test/render';

const reply = (status: number, body: unknown) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(structuredClone(body)) });

const emptyCells = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ''));
// Main goal, sub-goal 1 (position 0) with its centre mirrored, and one action of sub-goal 1.
const filled = () => {
  const cells = emptyCells();
  cells[4][4] = 'Be healthy';
  cells[4][0] = 'Sleep well';
  cells[0][4] = 'Sleep well';
  cells[0][1] = 'In bed by 11';
  return cells;
};

function screens(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/mandalarts" element={<Mandalarts />} />
        <Route path="/mandalarts/:id" element={<MandalartView />} />
      </Routes>
    </MemoryRouter>,
  );
}

test('the list shows each Mandalart with its filled-cell count and a link to it', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      reply(200, {
        mandalarts: [
          { id: 3, title: 'Health', filledCount: 12, updatedAt: 'x' },
          { id: 2, title: 'Work', filledCount: 0, updatedAt: 'x' },
        ],
      }),
    ),
  );
  screens('/mandalarts');
  const list = await screen.findByRole('list', { name: 'Mandalarts' });
  expect(within(list).getByRole('link', { name: 'Health' })).toHaveAttribute(
    'href',
    '/mandalarts/3',
  );
  expect(within(list).getByText('12 of 81 cells filled')).toBeInTheDocument();
  expect(within(list).getByText('0 of 81 cells filled')).toBeInTheDocument();
});

test('the list says there are none, and can be retried after an error', async () => {
  const fetchMock = vi
    .fn()
    .mockImplementationOnce(() => reply(500, { error: 'A server error occurred' }))
    .mockImplementation(() => reply(200, { mandalarts: [] }));
  vi.stubGlobal('fetch', fetchMock);
  screens('/mandalarts');
  expect(await findLive('alert')).toHaveTextContent('A server error occurred');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('heading', { name: 'No Mandalarts yet' })).toBeInTheDocument();
});

test('the list shows a loading region before the first answer', () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => undefined)),
  );
  screens('/mandalarts');
  expect(screen.getByRole('region', { name: 'Loading Mandalarts' })).toHaveAttribute(
    'aria-busy',
    'true',
  );
});

test('opening a Mandalart shows all 81 cells with accessible names, the main goal and sub-goals marked', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn((path: string) => {
      expect(path).toBe('/api/mandalarts/5');
      return reply(200, { mandalart: { id: 5, title: 'Health', cells: filled() } });
    }),
  );
  screens('/mandalarts/5');
  const grid = await screen.findByTestId('mandalart-grid');
  expect(within(grid).getAllByRole('listitem')).toHaveLength(81);
  expect(within(grid).getAllByRole('list')).toHaveLength(9);
  const main = within(grid).getByRole('listitem', { name: 'Main goal: Be healthy' });
  expect(main.className).toContain('bg-foreground');
  const sub = within(grid).getByRole('listitem', { name: 'Sub-goal 1: Sleep well' });
  expect(sub.className).toContain('bg-muted');
  expect(
    within(grid).getByRole('listitem', { name: 'Sub-goal 1 (centre of its block): Sleep well' }),
  ).toBeInTheDocument();
  expect(
    within(grid).getByRole('listitem', { name: 'Action 2 of sub-goal 1: In bed by 11' }),
  ).toBeInTheDocument();
  expect(within(grid).getByRole('listitem', { name: 'Sub-goal 8: empty' })).toBeInTheDocument();
});

test('tapping a block zooms it in a dialog that can be closed', async () => {
  render(<MandalartGrid cells={filled()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Zoom in on Sub-goal 1: Sleep well' }));
  const dialog = await screen.findByRole('dialog', { name: 'Sub-goal 1: Sleep well' });
  expect(within(dialog).getAllByRole('listitem')).toHaveLength(9);
  expect(
    within(dialog).getByRole('listitem', { name: 'Action 2 of sub-goal 1: In bed by 11' }),
  ).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('a missing Mandalart and a bad address are errors, not a blank page', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => reply(404, { error: 'Mandalart not found' })),
  );
  const { unmount } = screens('/mandalarts/9');
  expect(await findLive('alert')).toHaveTextContent('Mandalart not found');
  expect(screen.getByRole('link', { name: 'Back to the Mandalart list' })).toHaveAttribute(
    'href',
    '/mandalarts',
  );
  unmount();
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  screens('/mandalarts/abc');
  expect(await findLive('alert')).toHaveTextContent('Invalid Mandalart ID');
  expect(fetchMock).not.toHaveBeenCalled();
});

test('cell names tell the role of each cell', () => {
  const cells = emptyCells();
  expect(cellLabel(cells, 4, 4)).toBe('Main goal: empty');
  expect(cellLabel(cells, 4, 5)).toBe('Sub-goal 5: empty');
  expect(cellLabel(cells, 8, 4)).toBe('Sub-goal 8 (centre of its block): empty');
  expect(cellLabel(cells, 2, 3)).toBe('Action 4 of sub-goal 3: empty');
});
