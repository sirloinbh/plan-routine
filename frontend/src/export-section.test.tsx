import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { ExportSection } from './export-section';
import { getLive } from './test/live';
import { render } from './test/render';

const file = (name: string) =>
  Promise.resolve({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-disposition': `attachment; filename="${name}"` }),
    blob: () => Promise.resolve(new Blob(['data'])),
  });

const refusal = (status: number, body: unknown) =>
  Promise.resolve({
    ok: false,
    status,
    headers: new Headers(),
    json: () => Promise.resolve(body),
  });

const saved: string[] = [];

function setup(fetchMock: (path: string) => Promise<unknown>) {
  saved.length = 0;
  vi.stubGlobal('fetch', vi.fn(fetchMock));
  URL.createObjectURL = vi.fn(() => 'blob:test');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    saved.push(this.download);
  });
}

afterEach(() => vi.restoreAllMocks());

test('each button downloads its file under the name the server gave', async () => {
  setup((path) => file(`name-of${path.replaceAll('/', '-')}`));
  render(<ExportSection />);
  fireEvent.click(screen.getByRole('button', { name: 'Checks (CSV)' }));
  await waitFor(() => expect(saved).toEqual(['name-of-api-export-checks.csv']));
  expect(getLive('status')).toHaveTextContent('Downloaded name-of-api-export-checks.csv');
  fireEvent.click(screen.getByRole('button', { name: 'All data (JSON)' }));
  await waitFor(() => expect(saved).toHaveLength(2));
  expect(fetch).toHaveBeenLastCalledWith('/api/export');
});

test('a refused download saves nothing and says why', async () => {
  setup(() => refusal(500, { error: 'A server error occurred' }));
  render(<ExportSection />);
  fireEvent.click(screen.getByRole('button', { name: 'Diary (CSV)' }));
  expect(await screen.findByText('A server error occurred')).toBeInTheDocument();
  expect(saved).toEqual([]);
});

test('an ended sign-in is named', async () => {
  setup(() => refusal(401, { error: 'unauthorized' }));
  render(<ExportSection />);
  fireEvent.click(screen.getByRole('button', { name: 'Diary (CSV)' }));
  expect(await screen.findByText(/sign-in has ended/)).toBeInTheDocument();
});

test('an unreachable server is reported and the buttons work again', async () => {
  setup(() => Promise.reject(new TypeError('failed')));
  render(<ExportSection />);
  fireEvent.click(screen.getByRole('button', { name: 'Checks (CSV)' }));
  expect(await screen.findByText('Cannot reach the server')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Checks (CSV)' })).toBeEnabled();
});
