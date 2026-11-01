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
          return reply(400, { error: '주소는 https:// 또는 사설 접속 주소만 쓸 수 있습니다' });
        const project = { id: String(nextId++), name: body!.name, url: body!.url };
        projects = [...projects, project];
        return reply(201, { project });
      }
      const id = path.split('/')[3];
      if (id === '500') return reply(500, { error: '서버 오류가 발생했습니다' });
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

const books = { id: '1', name: '독서 기록', url: 'https://books.example/' };
const money = { id: '2', name: '가계부', url: 'http://nas.local/' };

test('shows registered projects, or that there are none', async () => {
  api([books]);
  const { unmount } = render(<ProjectLinks />);
  await flush();
  expect(screen.getByText('독서 기록')).toBeInTheDocument();
  expect(screen.getByText('https://books.example/')).toBeInTheDocument();
  unmount();
  api();
  render(<ProjectLinks />);
  await flush();
  expect(screen.getByText('아직 등록한 프로젝트가 없습니다')).toBeInTheDocument();
});

test('adding sends the form, clears it, and returns focus to the name field', async () => {
  const writes = api();
  render(<ProjectLinks />);
  await flush();
  type('프로젝트 이름', '독서 기록');
  type('프로젝트 주소', 'https://books.example');
  fireEvent.click(button('추가'));
  await flush();
  expect(writes[0]).toEqual({
    method: 'POST',
    path: '/api/project-links',
    body: { name: '독서 기록', url: 'https://books.example' },
  });
  expect(screen.getByRole('status')).toHaveTextContent("'독서 기록' 프로젝트를 추가했습니다");
  expect(field('프로젝트 이름')).toHaveValue('');
  expect(field('프로젝트 주소')).toHaveValue('');
  expect(field('프로젝트 이름')).toHaveFocus();
  expect(screen.getByText('https://books.example')).toBeInTheDocument();
});

test('a refused address shows the Korean error and keeps what was typed', async () => {
  api();
  render(<ProjectLinks />);
  await flush();
  type('프로젝트 이름', '나쁜 주소');
  type('프로젝트 주소', 'javascript:alert(1)');
  fireEvent.click(button('추가'));
  await flush();
  expect(screen.getByRole('alert')).toHaveTextContent('https:// 또는 사설 접속 주소만');
  expect(field('프로젝트 주소')).toHaveValue('javascript:alert(1)');
});

test('removing asks first, then moves focus to the next project', async () => {
  const writes = api([books, money]);
  render(<ProjectLinks />);
  await flush();
  fireEvent.click(button('독서 기록 삭제'));
  expect(writes).toEqual([]);
  fireEvent.click(button('독서 기록 삭제 확인'));
  await flush();
  expect(writes[0]).toMatchObject({ method: 'DELETE', path: '/api/project-links/1' });
  expect(screen.queryByText('독서 기록')).not.toBeInTheDocument();
  expect(button('가계부 삭제')).toHaveFocus();

  fireEvent.click(button('가계부 삭제'));
  fireEvent.click(button('가계부 삭제 확인'));
  await flush();
  expect(field('프로젝트 이름')).toHaveFocus();
});

test('a removal that fails stays on its own row', async () => {
  api([{ ...books, id: '500' }]);
  render(<ProjectLinks />);
  await flush();
  fireEvent.click(button('독서 기록 삭제'));
  fireEvent.click(button('독서 기록 삭제 확인'));
  await flush();
  expect(screen.getByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다');
  expect(button('독서 기록 삭제')).toHaveFocus();
});

test('a checklist item opens its project in a new tab, safely', () => {
  render(
    <Checklist
      title="독서"
      items={[
        {
          id: '1',
          name: '30분 읽기',
          checked: false,
          linkName: '독서 기록',
          linkUrl: 'https://books.example/',
        },
        { id: '2', name: '메모하기', checked: false },
      ]}
      onToggle={() => {}}
    />,
  );
  const link = screen.getByRole('link', { name: '30분 읽기: 독서 기록 열기' });
  expect(link).toHaveAttribute('href', 'https://books.example/');
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  expect(screen.getAllByRole('link')).toHaveLength(1);
});

test('a checklist never renders an address that is not http or https', () => {
  render(
    <Checklist
      title="독서"
      items={[
        {
          id: '1',
          name: '30분 읽기',
          checked: false,
          linkName: '나쁜 주소',
          linkUrl: 'javascript:alert(1)',
        },
      ]}
      onToggle={() => {}}
    />,
  );
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(within(screen.getByRole('region')).getByText('30분 읽기')).toBeInTheDocument();
});
