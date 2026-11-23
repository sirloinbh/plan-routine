import { screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { MoodStats } from './mood-stats';
import { render } from './test/render';

const week = (start: string, end: string, extra = {}) => ({
  start,
  end,
  checked: 0,
  total: 0,
  mood: null,
  energy: null,
  moodDays: 0,
  energyDays: 0,
  ...extra,
});

const answer = (body: unknown, status = 200) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })),
  );

test('shows each week with its completion rate and average scores, newest first', async () => {
  answer({
    today: '2026-10-22',
    weeks: [
      week('2026-10-11', '2026-10-17', { checked: 3, total: 4, mood: 3.5, energy: 4 }),
      week('2026-10-18', '2026-10-24', { checked: 1, total: 217, mood: 2, energy: null }),
    ],
  });
  render(<MoodStats />);
  const table = await screen.findByRole('table');
  const rows = within(table).getAllByRole('row').slice(1);
  expect(rows[0]).toHaveTextContent('Oct 18 – Oct 24');
  expect(rows[0]).toHaveTextContent('1%');
  expect(rows[0]).toHaveTextContent('2.0');
  expect(rows[0]).toHaveTextContent('–');
  expect(rows[1]).toHaveTextContent('75%');
  expect(rows[1]).toHaveTextContent('3.5');
  expect(rows[1]).toHaveTextContent('4.0');
});

test('a week with no routines shows a dash instead of a rate', async () => {
  answer({ today: '2026-10-22', weeks: [week('2026-10-18', '2026-10-24', { mood: 4 })] });
  render(<MoodStats />);
  const row = (await screen.findAllByRole('row'))[1];
  expect(row).toHaveTextContent('–');
  expect(row).not.toHaveTextContent('%');
});

test('with no scores at all it says how to add them', async () => {
  answer({ today: '2026-10-22', weeks: [week('2026-10-18', '2026-10-24')] });
  render(<MoodStats />);
  expect(await screen.findByText(/No scores yet/)).toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

test('a failed load shows the error and a retry button', async () => {
  answer({ error: 'A server error occurred' }, 500);
  render(<MoodStats />);
  expect(await screen.findByRole('button', { name: 'Try again' }, { timeout: 5000 })).toBeVisible();
});
