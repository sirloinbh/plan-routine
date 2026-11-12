import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { Checklist } from './checklist';
import { ProjectLinks } from './project-links';

type Project = { id: string; name: string; url: string };

const reply = (status: number, body: unknown) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(structuredClone(body)) });

function api(seed: Project[] = []) {
  let projects = seed;
  let nextId = 100;
  const writes: { method: string; path: string; body?: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'GET') return reply(200, { projects });
      const body = init?.body
        ? (JSON.parse(String(init.body)) as { name: string; url: string })
        : undefined;
      writes.push({ method, path, body });
      if (method === 'POST') {
        if (body!.url.startsWith('javascript:'))
          return reply(400, { error: 'The URL must be https:// or a private access address' });
        const project = { id: String(nextId++), name: body!.name, url: body!.url };
        projects = [...projects, project];
        return reply(201, { project });
      }
      const id = path.split('/')[3];
      if (id === '500') return reply(500, { error: 'A server error occurred' });
      projects = projects.filter((project) => project.id !== id);
      return reply(200, { id });
    }),
  );
  return writes;
}

const flush = () => act(() => new Promise((resolve) => setTimeout(resolve)));
const button = (name: string) => screen.getByRole('button', { name });
const field = (name: string) => screen.getByRole('textbox', { name });
const type = (name: string, value: string) => fireEvent.change(field(name), { target: { value } });

const books = { id: '1', name: 'Reading log', url: 'https://books.example/' };
const money = { id: '2', name: 'Budget', url: 'http://nas.local/' };

test('shows registered projects, or that there are none', async () => {
  api([books]);
  const { unmount } = render(<ProjectLinks />);
  await flush();
  expect(screen.getByText('Reading log')).toBeInTheDocument();
  expect(screen.getByText('https://books.example/')).toBeInTheDocument();
  unmount();
  api();
  render(<ProjectLinks />);
  await flush();
  expect(screen.getByText('No projects registered yet')).toBeInTheDocument();
});

test('adding sends the form, clears it, and returns focus to the name field', async () => {
  const writes = api();
  render(<ProjectLinks />);
  await flush();
  type('Project name', 'Reading log');
  type('Project URL', 'https://books.example');
  fireEvent.click(button('Add'));
  await flush();
  expect(writes[0]).toEqual({
    method: 'POST',
    path: '/api/project-links',
    body: { name: 'Reading log', url: 'https://books.example' },
  });
  expect(screen.getByRole('status')).toHaveTextContent("Added the project 'Reading log'");
  expect(field('Project name')).toHaveValue('');
  expect(field('Project URL')).toHaveValue('');
  expect(field('Project name')).toHaveFocus();
  expect(screen.getByText('https://books.example')).toBeInTheDocument();
});

test('a refused address shows the English error and keeps what was typed', async () => {
  api();
  render(<ProjectLinks />);
  await flush();
  type('Project name', 'Bad URL');
  type('Project URL', 'javascript:alert(1)');
  fireEvent.click(button('Add'));
  await flush();
  expect(screen.getByRole('alert')).toHaveTextContent(
    'The URL must be https:// or a private access address',
  );
  expect(field('Project URL')).toHaveValue('javascript:alert(1)');
  expect(field('Project URL')).toHaveFocus();
});

test('removing asks first, then moves focus to the next project', async () => {
  const writes = api([books, money]);
  render(<ProjectLinks />);
  await flush();
  fireEvent.click(button('Delete Reading log'));
  expect(writes).toEqual([]);
  fireEvent.click(button('Confirm deleting Reading log'));
  await flush();
  expect(writes[0]).toMatchObject({ method: 'DELETE', path: '/api/project-links/1' });
  expect(screen.queryByText('Reading log')).not.toBeInTheDocument();
  expect(button('Delete Budget')).toHaveFocus();

  fireEvent.click(button('Delete Budget'));
  fireEvent.click(button('Confirm deleting Budget'));
  await flush();
  expect(field('Project name')).toHaveFocus();
});

test('a removal that fails stays on its own row', async () => {
  api([{ ...books, id: '500' }]);
  render(<ProjectLinks />);
  await flush();
  fireEvent.click(button('Delete Reading log'));
  fireEvent.click(button('Confirm deleting Reading log'));
  await flush();
  expect(screen.getByRole('alert')).toHaveTextContent('A server error occurred');
  expect(button('Delete Reading log')).toHaveFocus();
});

test('a checklist item opens its project in a new tab, safely', () => {
  render(
    <Checklist
      title="Reading"
      items={[
        {
          id: '1',
          name: 'Read 30 min',
          checked: false,
          linkName: 'Reading log',
          linkUrl: 'https://books.example/',
        },
        { id: '2', name: 'Take notes', checked: false },
      ]}
      onToggle={() => {}}
    />,
  );
  const link = screen.getByRole('link', { name: 'Read 30 min: Open Reading log' });
  expect(link).toHaveAttribute('href', 'https://books.example/');
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  expect(screen.getAllByRole('link')).toHaveLength(1);
});

test('a checklist never renders an address that is not http or https', () => {
  render(
    <Checklist
      title="Reading"
      items={[
        {
          id: '1',
          name: 'Read 30 min',
          checked: false,
          linkName: 'Bad URL',
          linkUrl: 'javascript:alert(1)',
        },
      ]}
      onToggle={() => {}}
    />,
  );
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(within(screen.getByRole('region')).getByText('Read 30 min')).toBeInTheDocument();
});

test('a list that fails to load does not claim there are none, and can be retried', async () => {
  api([books]);
  const working = vi.mocked(fetch).getMockImplementation()!;
  let fail = true;
  vi.stubGlobal(
    'fetch',
    vi.fn((path: string, init?: RequestInit) => {
      if (!fail) return working(path, init);
      fail = false;
      return reply(500, { error: 'A server error occurred' });
    }),
  );
  render(<ProjectLinks />);
  await flush();
  expect(screen.getByRole('alert')).toHaveTextContent('A server error occurred');
  expect(screen.queryByText('No projects registered yet')).not.toBeInTheDocument();
  fireEvent.click(button('Reload projects'));
  await flush();
  expect(screen.getByText('Reading log')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('removing spins only that delete button, not the add button', async () => {
  api([books]);
  const working = vi.mocked(fetch).getMockImplementation()!;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn((path: string, init?: RequestInit) =>
      (init?.method ?? 'GET') === 'GET'
        ? working(path, init)
        : gate.then(() => working(path, init)),
    ),
  );
  render(<ProjectLinks />);
  await flush();
  fireEvent.click(button('Delete Reading log'));
  fireEvent.click(button('Confirm deleting Reading log'));
  await flush();
  expect(
    within(button('Confirm deleting Reading log')).getByRole('status', { name: 'Working' }),
  ).toBeInTheDocument();
  expect(screen.queryByRole('status', { name: 'Saving' })).not.toBeInTheDocument();
  release();
  await flush();
});
