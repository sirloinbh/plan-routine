import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { App } from './app';

const emptyChecklist = {
  date: '2026-10-26',
  today: '2026-10-26',
  previousDate: '2026-10-25',
  nextDate: null,
  period: { start: '2026-10-26', end: '2026-10-26' },
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

const pageData = (url: string) => {
  if (url.startsWith('/api/checklist')) return emptyChecklist;
  if (url.startsWith('/api/diary')) return emptyDiary;
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
  expect(screen.getByRole('heading', { level: 1, name: '대시보드' })).toBeInTheDocument();
  expect(await screen.findByText('서버 연결됨 · 2026-10-26')).toBeInTheDocument();
});

test('reports a server error as an alert', async () => {
  health({ error: '데이터베이스에 연결할 수 없습니다' }, 503);
  render(<App />);
  expect(await screen.findByRole('alert')).toHaveTextContent('데이터베이스에 연결할 수 없습니다');
});

test('each page has its own address and is marked in the main menu', async () => {
  health({ today: '2026-10-26' });
  render(<App />);
  const menu = screen.getByRole('navigation', { name: '주 메뉴' });
  fireEvent.click(within(menu).getByRole('link', { name: '하루 루틴' }));
  expect(window.location.pathname).toBe('/routines');
  expect(await screen.findByRole('heading', { level: 1, name: '하루 루틴' })).toBeInTheDocument();
  expect(within(menu).getByRole('link', { name: '하루 루틴' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  fireEvent.click(within(menu).getByRole('link', { name: '설정' }));
  expect(window.location.pathname).toBe('/settings');
  expect(await screen.findByRole('heading', { level: 1, name: '설정' })).toBeInTheDocument();
  expect(within(menu).getByRole('link', { name: '설정' })).toHaveAttribute('aria-current', 'page');
});

test('the main menu opens the daily checklist page', async () => {
  health({ today: '2026-10-26' });
  render(<App />);
  const menu = screen.getByRole('navigation', { name: '주 메뉴' });
  fireEvent.click(within(menu).getByRole('link', { name: '오늘 체크' }));
  expect(window.location.pathname).toBe('/today');
  expect(await screen.findByRole('heading', { level: 1, name: '오늘 체크' })).toBeInTheDocument();
  expect(await screen.findByText('체크할 루틴이 없습니다')).toBeInTheDocument();
  window.history.replaceState(null, '', '/');
});

test('the diary opens from the main menu and from the daily checklist page', async () => {
  health({ today: '2026-10-26' });
  render(<App />);
  const menu = screen.getByRole('navigation', { name: '주 메뉴' });
  fireEvent.click(within(menu).getByRole('link', { name: '오늘 체크' }));
  fireEvent.click(await screen.findByRole('link', { name: '오늘 일기 쓰기' }));
  expect(window.location.pathname).toBe('/diary');
  expect(await screen.findByRole('heading', { level: 1, name: '일기' })).toBeInTheDocument();
  expect(await screen.findByRole('textbox', { name: '하루 돌아보기' })).toBeInTheDocument();
  expect(within(menu).getByRole('link', { name: '일기' })).toHaveAttribute('aria-current', 'page');
  window.history.replaceState(null, '', '/');
});

test('the main menu opens the weekly routine page', async () => {
  health({ today: '2026-10-26' });
  render(<App />);
  const menu = screen.getByRole('navigation', { name: '주 메뉴' });
  fireEvent.click(within(menu).getByRole('link', { name: '주간 루틴' }));
  expect(window.location.pathname).toBe('/weekly');
  expect(await screen.findByRole('heading', { level: 1, name: '주간 루틴' })).toBeInTheDocument();
  expect(await screen.findByText('이번 주에 체크할 루틴이 없습니다')).toBeInTheDocument();
  window.history.replaceState(null, '', '/');
});

test('an unknown address falls back to the overview', async () => {
  health({ today: '2026-10-26' });
  window.history.replaceState(null, '', '/no-such-page');
  render(<App />);
  expect(await screen.findByRole('heading', { level: 1, name: '대시보드' })).toBeInTheDocument();
  expect(window.location.pathname).toBe('/');
});
