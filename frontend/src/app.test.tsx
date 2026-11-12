import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { App } from './app';

const emptyChecklist = {
  date: '2026-10-26',
  today: '2026-10-26',
  previousDate: '2026-10-25',
  nextDate: null,
  period: { start: '2026-10-26', end: '2026-10-26' },
  remainingDays: 0,
  endsSoon: false,
  items: [],
};

const emptyDiary = {
  date: '2026-10-26',
  today: '2026-10-26',
  previousDate: '2026-10-25',
  nextDate: null,
  progress: { checked: 0, total: 0 },
  entry: null,
};

const emptyGoals = {
  today: '2026-10-26',
  remainingWeeks: 12,
  current: { period: { start: '2026-10-25', end: '2027-01-16' }, goals: [] },
  past: [],
};

const emptyMonth = {
  today: '2026-10-26',
  month: '2026-10',
  previousMonth: '2026-09',
  nextMonth: null,
  days: [{ date: '2026-10-26', checked: 0, total: 0, hasDiary: false }],
};
const emptyDay = {
  date: '2026-10-26',
  today: '2026-10-26',
  progress: { checked: 0, total: 0 },
  routines: [],
  diary: null,
};

const emptyStats = {
  today: '2026-10-26',
  daily: { weeks: [], months: [] },
  weekly: [],
  fourWeek: [],
  twelveWeek: [],
  items: [],
};

const pageData = (url: string) => {
  if (url.startsWith('/api/stats')) return emptyStats;
  if (url.startsWith('/api/records/')) return emptyDay;
  if (url.startsWith('/api/records')) return emptyMonth;
  if (url.startsWith('/api/goals')) return emptyGoals;
  if (url.startsWith('/api/checklist')) return emptyChecklist;
  if (url.startsWith('/api/diary')) return emptyDiary;
  if (url.startsWith('/api/project-links')) return { projects: [] };
  return { routines: [] };
};

// /api/health answers with `body`; the routine, checklist and diary pages get empty data.
const health = (body: object, status = 200) =>
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(
        url === '/api/health'
          ? new Response(JSON.stringify(body), { status })
          : new Response(JSON.stringify(pageData(url)), { status: 200 }),
      ),
    ),
  );

test('shows the server date from /api/health on the overview', async () => {
  health({ today: '2026-10-26' });
  render(<App />);
  expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
  expect(await screen.findByText('Server connected · 2026-10-26')).toBeInTheDocument();
});

test('reports a server error as an alert', async () => {
  health({ error: 'Cannot connect to the database' }, 503);
  render(<App />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Cannot connect to the database');
});

test('each page has its own address and is marked in the main menu', async () => {
  health({ today: '2026-10-26' });
  render(<App />);
  const menu = screen.getByRole('navigation', { name: 'Main menu' });
  fireEvent.click(within(menu).getByRole('link', { name: 'Daily routines' }));
  expect(window.location.pathname).toBe('/routines');
  expect(
    await screen.findByRole('heading', { level: 1, name: 'Daily routines' }),
  ).toBeInTheDocument();
  expect(within(menu).getByRole('link', { name: 'Daily routines' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  fireEvent.click(within(menu).getByRole('link', { name: 'Settings' }));
  expect(window.location.pathname).toBe('/settings');
  expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
  expect(within(menu).getByRole('link', { name: 'Settings' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('the main menu opens the daily checklist page', async () => {
  health({ today: '2026-10-26' });
  render(<App />);
  const menu = screen.getByRole('navigation', { name: 'Main menu' });
  fireEvent.click(within(menu).getByRole('link', { name: 'Today' }));
  expect(window.location.pathname).toBe('/today');
  expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument();
  expect(await screen.findByText('No routines to check')).toBeInTheDocument();
  window.history.replaceState(null, '', '/');
});

test('the diary opens from the main menu and from the daily checklist page', async () => {
  health({ today: '2026-10-26' });
  render(<App />);
  const menu = screen.getByRole('navigation', { name: 'Main menu' });
  fireEvent.click(within(menu).getByRole('link', { name: 'Today' }));
  fireEvent.click(await screen.findByRole('link', { name: "Write today's diary" }));
  expect(window.location.pathname).toBe('/diary');
  expect(await screen.findByRole('heading', { level: 1, name: 'Diary' })).toBeInTheDocument();
  expect(
    await screen.findByRole('textbox', { name: 'Looking back on the day' }),
  ).toBeInTheDocument();
  expect(within(menu).getByRole('link', { name: 'Diary' })).toHaveAttribute('aria-current', 'page');
  window.history.replaceState(null, '', '/');
});

test('the main menu opens the weekly routine page', async () => {
  health({ today: '2026-10-26' });
  render(<App />);
  const menu = screen.getByRole('navigation', { name: 'Main menu' });
  fireEvent.click(within(menu).getByRole('link', { name: 'Weekly routines' }));
  expect(window.location.pathname).toBe('/weekly');
  expect(
    await screen.findByRole('heading', { level: 1, name: 'Weekly routines' }),
  ).toBeInTheDocument();
  expect(await screen.findByText('No routines to check for this week')).toBeInTheDocument();
  window.history.replaceState(null, '', '/');
});

test('the main menu opens the four-week routine page', async () => {
  health({ today: '2026-10-26' });
  render(<App />);
  const menu = screen.getByRole('navigation', { name: 'Main menu' });
  fireEvent.click(within(menu).getByRole('link', { name: '4-week routines' }));
  expect(window.location.pathname).toBe('/four-week');
  expect(
    await screen.findByRole('heading', { level: 1, name: '4-week routines' }),
  ).toBeInTheDocument();
  expect(await screen.findByText('No routines to check for these 4 weeks')).toBeInTheDocument();
  window.history.replaceState(null, '', '/');
});

test('the daily checklist page shows unfinished four-week routines near the period end', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            url === '/api/checklist?cadence=four_week'
              ? {
                  ...emptyChecklist,
                  endsSoon: true,
                  remainingDays: 3,
                  items: [{ id: '7', name: 'Wash bedding', checked: false }],
                }
              : url === '/api/health'
                ? { today: '2026-10-26' }
                : pageData(url),
          ),
          { status: 200 },
        ),
      ),
    ),
  );
  window.history.replaceState(null, '', '/today');
  render(<App />);
  expect(await screen.findByRole('checkbox', { name: 'Wash bedding' })).toBeInTheDocument();
  expect(
    screen.getByRole('region', { name: '4-week routines ending soon checklist' }),
  ).toBeVisible();
  window.history.replaceState(null, '', '/');
});

test('the main menu opens the twelve-week page', async () => {
  health({ today: '2026-10-26' });
  render(<App />);
  const menu = screen.getByRole('navigation', { name: 'Main menu' });
  fireEvent.click(within(menu).getByRole('link', { name: '12-week routines' }));
  expect(window.location.pathname).toBe('/twelve-week');
  expect(
    await screen.findByRole('heading', { level: 1, name: '12-week routines' }),
  ).toBeInTheDocument();
  expect(await screen.findByText('No goals yet')).toBeInTheDocument();
  window.history.replaceState(null, '', '/');
});

test('the main menu opens the records page', async () => {
  health({ today: '2026-10-26' });
  render(<App />);
  const menu = screen.getByRole('navigation', { name: 'Main menu' });
  fireEvent.click(within(menu).getByRole('link', { name: 'Records' }));
  expect(window.location.pathname).toBe('/records');
  expect(await screen.findByRole('heading', { level: 1, name: 'Records' })).toBeInTheDocument();
  expect(await screen.findByText('No records for this day')).toBeInTheDocument();
  window.history.replaceState(null, '', '/');
});

test('the main menu opens the stats page', async () => {
  health({ today: '2026-10-26' });
  render(<App />);
  const menu = screen.getByRole('navigation', { name: 'Main menu' });
  fireEvent.click(within(menu).getByRole('link', { name: 'Completion rates' }));
  expect(window.location.pathname).toBe('/stats');
  expect(
    await screen.findByRole('heading', { level: 1, name: 'Completion rates' }),
  ).toBeInTheDocument();
  expect(await screen.findByText('No history yet')).toBeInTheDocument();
  window.history.replaceState(null, '', '/');
});

test('an unknown address falls back to the overview', async () => {
  health({ today: '2026-10-26' });
  window.history.replaceState(null, '', '/no-such-page');
  render(<App />);
  expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
  expect(window.location.pathname).toBe('/');
});

test('the real page is an area a retry button can hand focus to', async () => {
  let failing = true;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url === '/api/health')
        return Promise.resolve(new Response(JSON.stringify({ today: '2026-10-26' })));
      if (url.startsWith('/api/diary') && failing) {
        failing = false;
        return Promise.resolve(
          new Response(JSON.stringify({ error: 'A server error occurred' }), { status: 500 }),
        );
      }
      return Promise.resolve(new Response(JSON.stringify(pageData(url))));
    }),
  );
  window.history.replaceState(null, '', '/diary');
  render(<App />);
  const retry = await screen.findByRole('button', { name: 'Try again' });
  retry.focus();
  fireEvent.click(retry);
  await screen.findByRole('textbox', { name: 'Looking back on the day' });
  expect(screen.getByRole('region', { name: 'Diary' })).toHaveFocus();
  window.history.replaceState(null, '', '/');
});
