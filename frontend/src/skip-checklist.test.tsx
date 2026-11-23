import { act, fireEvent, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { progressText } from './checklist-progress';
import { DailyChecklist } from './daily-checklist';
import { render } from './test/render';
import { unexpectedRequest } from './test/unexpected-request';

const today = '2026-10-22';

// A fake checklist API with the skip rules of the server: a skip is refused (409) for a checked item.
function skipApi(options: { checkedElsewhere?: boolean } = {}) {
  const skips = new Map<number, string | null>();
  const calls: { method: string; path: string; body: unknown }[] = [];
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
            { id: 1, name: 'Wake at 6', cadence: 'daily', category: 'wake', sortOrder: 0 },
            { id: 2, name: 'Squats', cadence: 'daily', category: 'wake', sortOrder: 1 },
          ].map((item) => ({
            ...item,
            checked: false,
            skipped: skips.has(item.id),
            skipReason: skips.get(item.id) ?? null,
          })),
        });
      const skip = /^\/api\/routines\/(\d+)\/skips\//.exec(pathname);
      if (!skip || (method !== 'PUT' && method !== 'DELETE')) unexpectedRequest(method, url);
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, path: pathname, body });
      if (options.checkedElsewhere && method === 'PUT')
        return reply(409, { error: 'This period is checked. Uncheck it before skipping it' });
      const id = Number(skip?.[1]);
      if (method === 'PUT') skips.set(id, body.reason || null);
      else skips.delete(id);
      return reply(200, {});
    }),
  );
  return { calls };
}

const tick = () => new Promise((resolve) => setTimeout(resolve));
const flush = () =>
  act(async () => {
    await tick();
    await tick();
  });

test('progress leaves skipped items out of the total', () => {
  expect(
    progressText([{ checked: true }, { checked: false, skipped: true }, { checked: false }]),
  ).toBe('1/2');
});

test('skipping with a reason shows it and takes the item out of the total', async () => {
  const api = skipApi();
  render(<DailyChecklist />);
  fireEvent.click(await screen.findByRole('button', { name: 'Skip: Squats' }));
  fireEvent.change(screen.getByLabelText('Reason for skipping Squats (optional)'), {
    target: { value: '  Knee hurts ' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
  await flush();

  expect(api.calls).toEqual([
    { method: 'PUT', path: `/api/routines/2/skips/${today}`, body: { reason: 'Knee hurts' } },
  ]);
  expect(screen.getByText('Skipped: Knee hurts')).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Squats' })).toBeDisabled();
  expect(screen.getByText('0/1 done overall')).toBeInTheDocument();
});

test('a skip can be made without a reason and removed again', async () => {
  const api = skipApi();
  render(<DailyChecklist />);
  fireEvent.click(await screen.findByRole('button', { name: 'Skip: Wake at 6' }));
  fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
  await flush();
  expect(screen.getByText('Skipped')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Remove skip: Wake at 6' }));
  await flush();
  expect(api.calls.map((call) => call.method)).toEqual(['PUT', 'DELETE']);
  expect(screen.getByRole('checkbox', { name: 'Wake at 6' })).toBeEnabled();
  expect(screen.getByText('0/2 done overall')).toBeInTheDocument();
});

test('the reason box stops at 200 characters and cancel closes it', async () => {
  skipApi();
  render(<DailyChecklist />);
  fireEvent.click(await screen.findByRole('button', { name: 'Skip: Squats' }));
  expect(screen.getByLabelText('Reason for skipping Squats (optional)')).toHaveAttribute(
    'maxlength',
    '200',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('button', { name: 'Skip: Squats' })).toBeInTheDocument();
});

test('a refused skip shows the server message and leaves the item unskipped', async () => {
  skipApi({ checkedElsewhere: true });
  render(<DailyChecklist />);
  fireEvent.click(await screen.findByRole('button', { name: 'Skip: Squats' }));
  fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
  await flush();
  expect(
    screen.getByText('This period is checked. Uncheck it before skipping it'),
  ).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Squats' })).toBeEnabled();
});
