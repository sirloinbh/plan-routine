import { act, fireEvent, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { getLive } from './test/live';
import { render } from './test/render';
import { WeeklyReview } from './weekly-review';

const thisWeek = {
  today: '2026-10-22',
  week: { start: '2026-10-18', end: '2026-10-24' },
  previousWeek: '2026-10-11',
  nextWeek: null,
  rate: { checked: 3, total: 5 },
  mostMissed: [
    { id: 1, name: 'Run', cadence: 'daily', missed: 2, total: 4 },
    { id: 2, name: 'Clean', cadence: 'weekly', missed: 1, total: 1 },
  ],
  notes: { wentWell: 'Ran twice', toChange: null },
};
const lastWeek = {
  ...thisWeek,
  week: { start: '2026-10-11', end: '2026-10-17' },
  previousWeek: '2026-10-04',
  nextWeek: '2026-10-18',
  rate: { checked: 0, total: 0 },
  mostMissed: [],
  notes: { wentWell: null, toChange: 'Sleep earlier' },
};

function api(failSave = false) {
  const calls: { url: string; method: string; body?: unknown }[] = [];
  const reply = (status: number, value: unknown) =>
    Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(value) });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (method === 'PUT')
        return failSave ? reply(400, { error: 'Too long' }) : reply(200, { notes: {} });
      return reply(200, url.includes('week=2026-10-11') ? lastWeek : thisWeek);
    }),
  );
  return calls;
}

const tick = () => new Promise((resolve) => setTimeout(resolve));
const flush = () =>
  act(async () => {
    await tick();
    await tick();
  });

test('shows the rate, the most-missed routines and the saved notes', async () => {
  api();
  render(<WeeklyReview />);
  await flush();
  expect(screen.getByText('60%')).toBeVisible();
  expect(screen.getByText('3 of 5 daily and weekly routine checks')).toBeVisible();
  const missed = within(screen.getByRole('region', { name: 'Most missed routines' }));
  expect(missed.getAllByRole('listitem').map((row) => row.textContent)).toEqual([
    'Runmissed 2 of 4',
    'Cleanmissed 1 of 1',
  ]);
  expect(screen.getByLabelText('What went well')).toHaveValue('Ran twice');
  expect(screen.getByLabelText('What to change next week')).toHaveValue('');
  // This week has no next week.
  expect(screen.getByRole('button', { name: /Next week/ })).toBeDisabled();
});

test('moves to the previous week, shows its notes, and says when nothing was recorded', async () => {
  const calls = api();
  render(<WeeklyReview />);
  await flush();
  fireEvent.click(screen.getByRole('button', { name: /Previous week/ }));
  await flush();
  expect(calls.at(-1)?.url).toBe('/api/weekly-review?week=2026-10-11');
  expect(screen.getByText('No records this week')).toBeVisible();
  expect(screen.getByText('Nothing was missed')).toBeVisible();
  expect(screen.getByLabelText('What to change next week')).toHaveValue('Sleep earlier');
  expect(screen.getByLabelText('What went well')).toHaveValue('');
  expect(screen.getByRole('button', { name: /Next week/ })).toBeEnabled();
});

test('saves both notes for the week on screen', async () => {
  const calls = api();
  render(<WeeklyReview />);
  await flush();
  fireEvent.change(screen.getByLabelText('What to change next week'), {
    target: { value: 'Stretch daily' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save notes' }));
  await flush();
  const put = calls.find((call) => call.method === 'PUT');
  expect(put?.url).toBe('/api/weekly-review/2026-10-18');
  expect(put?.body).toEqual({ wentWell: 'Ran twice', toChange: 'Stretch daily' });
  expect(getLive('status')).toHaveTextContent('Saved the notes');
});

test('a failed save shows the server message and keeps the text', async () => {
  api(true);
  render(<WeeklyReview />);
  await flush();
  fireEvent.change(screen.getByLabelText('What went well'), { target: { value: 'New text' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save notes' }));
  await flush();
  expect(getLive('alert')).toHaveTextContent('Too long');
  expect(screen.getByLabelText('What went well')).toHaveValue('New text');
});

test('a note over the limit cannot be saved', async () => {
  const calls = api();
  render(<WeeklyReview />);
  await flush();
  fireEvent.change(screen.getByLabelText('What went well'), {
    target: { value: 'a'.repeat(1001) },
  });
  expect(screen.getByText('1001/1000')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Save notes' })).toBeDisabled();
  expect(calls.some((call) => call.method === 'PUT')).toBe(false);
});

test('a failed load offers a retry', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Server error' }),
      }),
    ),
  );
  render(<WeeklyReview />);
  await flush();
  expect(getLive('alert')).toHaveTextContent('Server error');
  expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
});
