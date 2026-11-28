import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { Plans } from './plans';
import { findLive } from './test/live';
import { render } from './test/render';

configure({ reactStrictMode: true });

type Row = {
  id: number;
  horizon: string;
  periodStart: string;
  periodEnd: string;
  title: string;
  description: string | null;
  status: string;
};

const periods: Record<string, { start: string; end: string }> = {
  week: { start: '2026-10-18', end: '2026-10-24' },
  twelve_week: { start: '2026-10-18', end: '2027-01-09' },
  year: { start: '2026-10-18', end: '2027-10-16' },
  decade: { start: '2026-01-01', end: '2035-12-31' },
};

// A fake API with state, like the server: lists, adds, changes and deletes plans, and rejects an empty title.
function plansApi(seed: Row[] = []) {
  const rows = [...seed];
  let nextId = 100;
  let failDelete = false;
  const writes: { method: string; path: string; body?: Record<string, unknown> }[] = [];
  const reply = (status: number, body: unknown) =>
    Promise.resolve({
      ok: status < 400,
      status,
      json: () => Promise.resolve(structuredClone(body)),
    });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'GET') {
        const horizon = new URL(url, 'http://x').searchParams.get('horizon')!;
        return reply(200, {
          horizon,
          period: periods[horizon],
          plans: rows.filter((row) => row.horizon === horizon),
        });
      }
      const body = init?.body
        ? (JSON.parse(init.body as string) as Record<string, unknown>)
        : undefined;
      writes.push({ method, path: url, body });
      if (method === 'DELETE') {
        if (failDelete) return reply(500, { error: 'The server failed' });
        const id = Number(url.split('/').at(-1));
        rows.splice(
          rows.findIndex((row) => row.id === id),
          1,
        );
        return reply(200, { id });
      }
      if (!String(body?.title ?? '').trim())
        return reply(400, {
          error: 'Invalid request',
          fields: [{ path: 'title', message: 'Enter a title' }],
        });
      const horizon =
        (body?.horizon as string | undefined) ??
        rows.find((r) => `/api/plans/${r.id}` === url)!.horizon;
      const period = periods[horizon];
      if (method === 'POST') {
        const row: Row = {
          id: nextId++,
          horizon,
          periodStart: period.start,
          periodEnd: period.end,
          title: String(body?.title).trim(),
          description: String(body?.description ?? '').trim() || null,
          status: String(body?.status ?? 'planned'),
        };
        rows.push(row);
        return reply(201, { plan: row });
      }
      const row = rows.find((r) => `/api/plans/${r.id}` === url)!;
      Object.assign(row, { title: body?.title, status: body?.status });
      return reply(200, { plan: row });
    }),
  );
  return { rows, writes, failDelete: () => (failDelete = true) };
}

const plan = (id: number, horizon: string, title: string): Row => ({
  id,
  horizon,
  periodStart: periods[horizon].start,
  periodEnd: periods[horizon].end,
  title,
  description: null,
  status: 'planned',
});

afterEach(() => vi.unstubAllGlobals());

test('a plan added on a tab shows there after saving, without a reload', async () => {
  const api = plansApi();
  render(<Plans />);
  expect(await screen.findByText('No plans for this week yet')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add plan' }));
  const dialog = await screen.findByRole('dialog', { name: 'Add plan' });
  // The period start starts at the tab's period.
  expect(within(dialog).getByLabelText('Period start')).toHaveValue('2026-10-18');
  fireEvent.change(within(dialog).getByLabelText('Title'), {
    target: { value: ' Finish report ' },
  });
  fireEvent.change(within(dialog).getByLabelText('Status'), { target: { value: 'in_progress' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add plan' }));
  expect(await screen.findByText('Finish report')).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByText('In progress')).toBeInTheDocument();
  expect(await findLive('status')).toHaveTextContent('Added "Finish report"');
  expect(api.writes[0]).toMatchObject({
    method: 'POST',
    path: '/api/plans',
    body: { horizon: 'week', periodStart: '2026-10-18', status: 'in_progress' },
  });
});

test('a plan added for another horizon opens that tab', async () => {
  plansApi();
  render(<Plans />);
  fireEvent.click(await screen.findByRole('button', { name: 'Add plan' }));
  const dialog = await screen.findByRole('dialog', { name: 'Add plan' });
  fireEvent.change(within(dialog).getByLabelText('Horizon'), { target: { value: 'decade' } });
  expect(within(dialog).getByLabelText('Period start')).toHaveValue('');
  fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Own a home' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add plan' }));
  expect(await screen.findByText('Own a home')).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'Next 10 years' })).toBeChecked();
});

test('a rejected save keeps the typed values and shows the message next to the field', async () => {
  const api = plansApi();
  render(<Plans />);
  fireEvent.click(await screen.findByRole('button', { name: 'Add plan' }));
  const dialog = await screen.findByRole('dialog', { name: 'Add plan' });
  fireEvent.change(within(dialog).getByLabelText(/Description/), {
    target: { value: 'Some detail' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add plan' }));
  expect(await within(dialog).findByText('Enter a title')).toBeInTheDocument();
  expect(within(dialog).getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true');
  expect(within(dialog).getByLabelText(/Description/)).toHaveValue('Some detail');
  expect(screen.getByRole('dialog', { name: 'Add plan' })).toBeInTheDocument();
  // Typing in the field clears its message.
  fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Now valid' } });
  expect(within(dialog).queryByText('Enter a title')).not.toBeInTheDocument();
  expect(api.writes).toHaveLength(1);
});

test('editing a plan changes it on the page', async () => {
  const api = plansApi([plan(1, 'week', 'Old title')]);
  render(<Plans />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Old title' }));
  const dialog = await screen.findByRole('dialog', { name: 'Edit plan' });
  expect(within(dialog).getByLabelText('Title')).toHaveValue('Old title');
  // The horizon of a saved plan cannot change.
  expect(within(dialog).getByLabelText('Horizon')).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'New title' } });
  fireEvent.change(within(dialog).getByLabelText('Status'), { target: { value: 'done' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByText('New title')).toBeInTheDocument();
  expect(screen.queryByText('Old title')).not.toBeInTheDocument();
  expect(screen.getByText('Done')).toBeInTheDocument();
  expect(api.writes[0]).toMatchObject({
    method: 'PATCH',
    path: '/api/plans/1',
    body: { title: 'New title', status: 'done' },
  });
});

test('deleting asks for confirmation and removes the plan', async () => {
  const api = plansApi([plan(1, 'week', 'Doomed'), plan(2, 'week', 'Kept')]);
  render(<Plans />);
  fireEvent.click(await screen.findByRole('button', { name: 'Delete Doomed' }));
  const dialog = await screen.findByRole('dialog', { name: 'Delete this plan?' });
  // Cancel changes nothing.
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(api.writes).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Delete Doomed' }));
  const again = await screen.findByRole('dialog', { name: 'Delete this plan?' });
  fireEvent.click(within(again).getByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(screen.queryByText('Doomed')).not.toBeInTheDocument());
  expect(screen.getByText('Kept')).toBeInTheDocument();
  expect(api.writes[0]).toMatchObject({ method: 'DELETE', path: '/api/plans/1' });
  expect(await findLive('status')).toHaveTextContent('Deleted "Doomed"');
});

test('a failed delete keeps the plan and announces the error', async () => {
  const api = plansApi([plan(1, 'week', 'Stays')]);
  api.failDelete();
  render(<Plans />);
  fireEvent.click(await screen.findByRole('button', { name: 'Delete Stays' }));
  const dialog = await screen.findByRole('dialog', { name: 'Delete this plan?' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
  expect(await findLive('alert')).toHaveTextContent('The server failed');
  expect(screen.getByText('Stays')).toBeInTheDocument();
});
