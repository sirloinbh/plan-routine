import { act, fireEvent, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { DailyChecklist } from './daily-checklist';
import { render } from './test/render';
import { unexpectedRequest } from './test/unexpected-request';

const today = '2026-10-22';

// A fake checklist with one routine that records pages, and the server's amount rules.
function amountApi() {
  let checked = true;
  let amount: number | null = 12;
  const puts: unknown[] = [];
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
              name: 'Reading',
              cadence: 'daily',
              category: 'reading',
              sortOrder: 1,
              checked,
              unit: 'pages',
              targetAmount: 20,
              amount,
            },
          ],
        });
      if (
        /^\/api\/routines\/1\/checks\//.test(pathname) &&
        (method === 'PUT' || method === 'DELETE')
      ) {
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        if (method === 'DELETE') {
          checked = false;
          amount = null;
        } else {
          checked = true;
          if (body && 'amount' in body) amount = body.amount;
        }
        puts.push({ method, body });
        return reply(200, {});
      }
      return unexpectedRequest(method, url);
    }),
  );
  return { puts };
}

const tick = () => new Promise((resolve) => setTimeout(resolve));
const flush = () =>
  act(async () => {
    await tick();
    await tick();
  });

test('a checked routine with a unit shows its target and saved amount, and saves a new one', async () => {
  const api = amountApi();
  render(<DailyChecklist />);
  expect(await screen.findByText('Target 20 pages')).toBeInTheDocument();
  const input = screen.getByRole('spinbutton', { name: 'Amount of Reading in pages' });
  expect(input).toHaveValue(12);

  fireEvent.change(input, { target: { value: '25.5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save amount: Reading' }));
  await flush();
  expect(api.puts).toEqual([{ method: 'PUT', body: { amount: 25.5 } }]);
  expect(screen.getByText('Saved the amount of Reading')).toBeInTheDocument();
  expect(screen.getByRole('spinbutton', { name: 'Amount of Reading in pages' })).toHaveValue(25.5);
  // Reaching or missing the target changes nothing: the routine is done either way.
  expect(screen.getByText('1/1 done overall')).toBeInTheDocument();
});

test('an empty amount clears it, and unchecking removes the amount box', async () => {
  const api = amountApi();
  render(<DailyChecklist />);
  const input = await screen.findByRole('spinbutton', { name: 'Amount of Reading in pages' });
  fireEvent.change(input, { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save amount: Reading' }));
  await flush();
  expect(api.puts[0]).toEqual({ method: 'PUT', body: { amount: null } });

  fireEvent.click(screen.getByRole('checkbox', { name: /Reading/ }));
  await flush();
  expect(screen.queryByRole('spinbutton', { name: 'Amount of Reading in pages' })).toBeNull();
});
