import { act, fireEvent, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { DailyChecklist } from './daily-checklist';
import { render } from './test/render';
import { unexpectedRequest } from './test/unexpected-request';

const today = '2026-10-22';

// The checklist of an N-per-week routine: its box is today's check, and the week total follows it.
// (The shared checklist code serves every cadence, so the daily page stands in for the weekly one.)
function weekApi() {
  let checked = false;
  let weekChecks = 2;
  const reply = (status: number, body: unknown) =>
    Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const { pathname } = new URL(url, 'http://localhost');
      if (method === 'GET' && pathname === '/api/checklist')
        return reply(200, {
          date: today,
          today,
          previousDate: null,
          nextDate: null,
          period: { start: today, end: today },
          items: [
            {
              id: 1,
              name: 'Read',
              cadence: 'daily',
              category: 'reading',
              sortOrder: 1,
              checked,
              timesPerWeek: 3,
              weekChecks,
            },
          ],
        });
      if (
        /^\/api\/routines\/1\/checks\//.test(pathname) &&
        (method === 'PUT' || method === 'DELETE')
      ) {
        checked = method === 'PUT';
        weekChecks += checked ? 1 : -1;
        return reply(200, {});
      }
      return unexpectedRequest(method, url);
    }),
  );
}

const tick = () => new Promise((resolve) => setTimeout(resolve));
const flush = () =>
  act(async () => {
    await tick();
    await tick();
  });

test('checking today adds to the week count, and the routine is done at N', async () => {
  weekApi();
  render(<DailyChecklist />);
  expect(await screen.findByText('2/3 this week')).toBeInTheDocument();
  expect(screen.getByText('0/1 done overall')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('checkbox', { name: /Read/ }));
  await flush();
  expect(screen.getByText('3/3 this week')).toBeInTheDocument();
  expect(screen.getByText('1/1 done overall')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('checkbox', { name: /Read/ }));
  await flush();
  expect(screen.getByText('2/3 this week')).toBeInTheDocument();
  expect(screen.getByText('0/1 done overall')).toBeInTheDocument();
});
