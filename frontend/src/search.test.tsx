import { act, fireEvent, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, test, vi } from 'vitest';

import { Search } from './search';
import { getLive } from './test/live';
import { render } from './test/render';

const result = (date: string, snippet: string, field = 'body') => ({ date, field, snippet });

function api(options: { total?: number; fail?: boolean } = {}) {
  const urls: string[] = [];
  const reply = (status: number, value: unknown) =>
    Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(value) });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      urls.push(url);
      if (url.startsWith('/api/routines'))
        return reply(200, { routines: [{ id: 7, name: 'Morning run' }] });
      if (url.startsWith('/api/records/'))
        return reply(200, {
          diary: {
            body: 'The whole body',
            goodNote: 'A good note',
            regretNote: null,
            tomorrowNote: null,
          },
        });
      if (options.fail) return reply(500, { error: 'Server error' });
      const offset = Number(new URL(url, 'http://x').searchParams.get('offset'));
      const total = options.total ?? 2;
      return reply(200, {
        limit: 20,
        offset,
        total,
        results:
          total === 0
            ? []
            : [result('2026-10-20', '…late coffee…'), result('2026-10-10', 'Slept', 'goodNote')],
      });
    }),
  );
  return urls;
}

const renderSearch = () =>
  render(
    <MemoryRouter>
      <Search />
    </MemoryRouter>,
  );
const tick = () => new Promise((resolve) => setTimeout(resolve));
const flush = () =>
  act(async () => {
    await tick();
    await tick();
  });
const searchCalls = (urls: string[]) => urls.filter((url) => url.startsWith('/api/search'));
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Search' }));

test('nothing is searched until the form is submitted, and an empty form says what is needed', async () => {
  const urls = api();
  renderSearch();
  await flush();
  expect(searchCalls(urls)).toEqual([]);
  submit();
  await flush();
  expect(getLive('alert')).toHaveTextContent('Enter a word to search for or choose a routine');
  expect(searchCalls(urls)).toEqual([]);
});

test('a search sends the filters and lists dates, fields and snippets newest first', async () => {
  const urls = api();
  renderSearch();
  await flush();
  fireEvent.change(screen.getByLabelText('Search text'), { target: { value: ' coffee ' } });
  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-01' } });
  fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-10-21' } });
  submit();
  await flush();
  expect(searchCalls(urls)).toEqual([
    '/api/search?q=coffee&from=2026-10-01&to=2026-10-21&limit=20&offset=0',
  ]);
  expect(screen.getByRole('heading', { name: '2 entries, newest first' })).toBeVisible();
  const items = screen.getAllByRole('listitem').filter((item) => item.querySelector('h3'));
  expect(items.map((item) => item.querySelector('h3')?.textContent)).toEqual([
    'October 20, 2026',
    'October 10, 2026',
  ]);
  expect(within(items[0]).getByText('…late coffee…')).toBeVisible();
  expect(within(items[1]).getByText(/What went well:/)).toBeVisible();
});

test('submitting the same search again asks the server again', async () => {
  const urls = api();
  renderSearch();
  await flush();
  fireEvent.change(screen.getByLabelText('Search text'), { target: { value: 'coffee' } });
  submit();
  await flush();
  submit();
  await flush();
  expect(searchCalls(urls)).toHaveLength(2);
});

test('each result date links to that day on the Records page', async () => {
  api();
  renderSearch();
  await flush();
  fireEvent.change(screen.getByLabelText('Search text'), { target: { value: 'coffee' } });
  submit();
  await flush();
  expect(screen.getByRole('link', { name: 'October 20, 2026' })).toHaveAttribute(
    'href',
    '/records?date=2026-10-20',
  );
  expect(screen.getByRole('link', { name: 'October 10, 2026' })).toHaveAttribute(
    'href',
    '/records?date=2026-10-10',
  );
});

test('a routine filter sends the routine and the chosen result', async () => {
  const urls = api();
  renderSearch();
  await flush();
  expect(screen.getByLabelText('On days the routine was')).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Daily routine'), { target: { value: '7' } });
  fireEvent.change(screen.getByLabelText('On days the routine was'), {
    target: { value: 'done' },
  });
  submit();
  await flush();
  expect(searchCalls(urls)).toEqual(['/api/search?routineId=7&result=done&limit=20&offset=0']);
});

test('a start date after the end date is refused before any request', async () => {
  const urls = api();
  renderSearch();
  await flush();
  fireEvent.change(screen.getByLabelText('Search text'), { target: { value: 'a' } });
  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-10' } });
  fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-10-01' } });
  submit();
  await flush();
  expect(getLive('alert')).toHaveTextContent('The start date must not be after the end date');
  expect(searchCalls(urls)).toEqual([]);
});

test('no match shows an empty state', async () => {
  api({ total: 0 });
  renderSearch();
  await flush();
  fireEvent.change(screen.getByLabelText('Search text'), { target: { value: 'zzz' } });
  submit();
  await flush();
  expect(screen.getByText('No matching entries')).toBeVisible();
});

test('the next and previous buttons page through the results', async () => {
  const urls = api({ total: 45 });
  renderSearch();
  await flush();
  fireEvent.change(screen.getByLabelText('Search text'), { target: { value: 'a' } });
  submit();
  await flush();
  expect(screen.getByText('Showing 1–2 of 45')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await flush();
  expect(searchCalls(urls).at(-1)).toBe('/api/search?q=a&limit=20&offset=20');
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
  await flush();
  expect(searchCalls(urls).at(-1)).toBe('/api/search?q=a&limit=20&offset=0');
});

test('opening a result loads the whole entry of that day only then', async () => {
  const urls = api();
  renderSearch();
  await flush();
  fireEvent.change(screen.getByLabelText('Search text'), { target: { value: 'coffee' } });
  submit();
  await flush();
  expect(urls.some((url) => url.startsWith('/api/records/'))).toBe(false);
  const summary = screen.getByText('Show the whole entry of October 20, 2026');
  const details = summary.closest('details')!;
  details.open = true;
  fireEvent(details, new Event('toggle'));
  await flush();
  expect(urls).toContain('/api/records/2026-10-20');
  expect(screen.getByText('The whole body')).toBeVisible();
  expect(screen.getByText('A good note')).toBeVisible();
});

test('a failed search shows the server message and a retry', async () => {
  api({ fail: true });
  renderSearch();
  await flush();
  fireEvent.change(screen.getByLabelText('Search text'), { target: { value: 'a' } });
  submit();
  await flush();
  expect(getLive('alert')).toHaveTextContent('Server error');
  expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
});
