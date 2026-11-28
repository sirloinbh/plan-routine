import { configure, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { Plans } from './plans';
import { findLive } from './test/live';
import { render } from './test/render';

configure({ reactStrictMode: true });

const plan = (id: number, horizon: string, title: string, extra: object = {}) => ({
  id,
  horizon,
  periodStart: '2026-10-18',
  periodEnd: '2026-10-24',
  title,
  description: null,
  status: 'planned',
  ...extra,
});

const periods = {
  week: { start: '2026-10-18', end: '2026-10-24' },
  twelve_week: { start: '2026-10-18', end: '2027-01-09' },
  year: { start: '2026-10-18', end: '2027-10-16' },
  decade: { start: '2026-01-01', end: '2035-12-31' },
} as const;

type Row = ReturnType<typeof plan>;

function plansApi(rows: Row[], failFirst = false) {
  let failing = failFirst;
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      urls.push(url);
      const horizon = new URL(url, 'http://x').searchParams.get('horizon') as keyof typeof periods;
      if (failing) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: 'The server failed' }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            horizon,
            period: periods[horizon],
            plans: rows.filter((row) => row.horizon === horizon),
          }),
      });
    }),
  );
  return { urls, recover: () => (failing = false) };
}

afterEach(() => vi.unstubAllGlobals());

test('shows four tabs and starts on this week with its period range', async () => {
  const { urls } = plansApi([plan(1, 'week', 'Finish the report')]);
  render(<Plans />);
  const tabs = screen.getByRole('radiogroup', { name: 'Plan horizon' });
  expect(
    within(tabs)
      .getAllByRole('radio')
      .map((tab) => tab.textContent),
  ).toEqual(['This week', 'This 12 weeks', 'This year', 'Next 10 years']);
  expect(await screen.findByText('Finish the report')).toBeInTheDocument();
  // Once in the tab header and once on the plan.
  expect(screen.getAllByText('October 18, 2026 to October 24, 2026')).toHaveLength(2);
  expect(urls[0]).toBe('/api/plans?horizon=week');
});

test('each tab lists only the plans of its horizon, with status, description and period', async () => {
  plansApi([
    plan(1, 'week', 'Week plan'),
    plan(2, 'twelve_week', 'Quarter plan', {
      status: 'in_progress',
      description: 'Ship the app',
      periodEnd: '2027-01-09',
    }),
    plan(3, 'year', 'Year plan', { status: 'done', periodEnd: '2027-10-16' }),
    plan(4, 'decade', 'Decade plan', {
      status: 'dropped',
      periodStart: '2026-01-01',
      periodEnd: '2035-12-31',
    }),
  ]);
  render(<Plans />);
  expect(await screen.findByText('Week plan')).toBeInTheDocument();
  expect(screen.queryByText('Quarter plan')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('radio', { name: 'This 12 weeks' }));
  const quarter = (await screen.findByText('Quarter plan')).closest('li')!;
  expect(within(quarter).getByText('In progress')).toBeInTheDocument();
  expect(within(quarter).getByText('Ship the app')).toBeInTheDocument();
  expect(within(quarter).getByText('October 18, 2026 to January 9, 2027')).toBeInTheDocument();
  expect(screen.queryByText('Week plan')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('radio', { name: 'This year' }));
  expect(await screen.findByText('Year plan')).toBeInTheDocument();
  expect(screen.getByText('Done')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('radio', { name: 'Next 10 years' }));
  expect(await screen.findByText('Decade plan')).toBeInTheDocument();
  expect(screen.getByText('Dropped')).toBeInTheDocument();
  expect(screen.getAllByText('January 1, 2026 to December 31, 2035')).toHaveLength(2);
});

test('an empty tab shows its own empty state', async () => {
  plansApi([]);
  render(<Plans />);
  expect(await screen.findByText('No plans for this week yet')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('radio', { name: 'Next 10 years' }));
  expect(await screen.findByText('No plans for the next 10 years yet')).toBeInTheDocument();
});

test('shows a loading region first', () => {
  plansApi([]);
  render(<Plans />);
  expect(screen.getByRole('region', { name: 'Loading plans' })).toHaveAttribute(
    'aria-busy',
    'true',
  );
});

test('a failed load shows the error and a retry button that loads the plans', async () => {
  const api = plansApi([plan(1, 'week', 'Finish the report')], true);
  render(<Plans />);
  expect(await findLive('alert')).toHaveTextContent('The server failed');
  api.recover();
  fireEvent.click(screen.getByRole('button', { name: 'Reload plans' }));
  expect(await screen.findByText('Finish the report')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Reload plans' })).not.toBeInTheDocument();
});
