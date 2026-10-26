import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { DailyRoutines, groupByCategory, type Routine } from './routines';

const routine = (id: string, name: string, category: string, sortOrder: number): Routine => ({
  id,
  name,
  cadence: 'daily',
  category,
  sortOrder,
});

function api(routines: Routine[]) {
  const calls: { url: string; method: string; body?: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (method === 'GET') return new Response(JSON.stringify({ routines }), { status: 200 });
      return new Response(JSON.stringify({}), { status: 200 });
    }),
  );
  return calls;
}

test('groups routines by category in the backend order and by sort order inside a group', () => {
  const groups = groupByCategory([
    routine('2', '스트레칭', 'exercise', 2),
    routine('1', '물 한 잔', 'wake', 1),
    routine('3', '푸시업', 'exercise', 1),
  ]);
  expect(groups.map((g) => g.key)).toEqual([
    'wake',
    'exercise',
    'diet',
    'housework',
    'care',
    'study',
    'reading',
  ]);
  expect(groups[1].routines.map((r) => r.name)).toEqual(['푸시업', '스트레칭']);
});

test('shows each category with its routines and adds a routine to a category', async () => {
  const calls = api([routine('1', '물 한 잔', 'wake', 1)]);
  render(<DailyRoutines />);
  const wake = await screen.findByRole('region', { name: '기상 루틴' });
  expect(within(wake).getByRole('heading', { level: 2, name: /기상/ })).toBeInTheDocument();
  expect(within(wake).getByText('물 한 잔')).toBeInTheDocument();
  expect(
    within(screen.getByRole('region', { name: '독서 루틴' })).getByText('아직 루틴이 없습니다'),
  ).toBeInTheDocument();

  const reading = screen.getByRole('region', { name: '독서 루틴' });
  fireEvent.change(within(reading).getByRole('textbox', { name: '독서 새 루틴 이름' }), {
    target: { value: '10쪽 읽기' },
  });
  fireEvent.click(within(reading).getByRole('button', { name: '추가' }));
  expect(await screen.findByText("독서에 '10쪽 읽기' 루틴을 추가했습니다")).toBeInTheDocument();
  expect(calls.find((c) => c.method === 'POST')).toEqual({
    url: '/api/routines',
    method: 'POST',
    body: { name: '10쪽 읽기', cadence: 'daily', category: 'reading' },
  });
});

test('an empty name is not sent and is reported as an alert', async () => {
  const calls = api([]);
  render(<DailyRoutines />);
  const wake = await screen.findByRole('region', { name: '기상 루틴' });
  fireEvent.click(within(wake).getByRole('button', { name: '추가' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('루틴 이름을 입력해 주세요');
  expect(calls.filter((c) => c.method !== 'GET')).toEqual([]);
});

test('archiving asks for confirmation first', async () => {
  const calls = api([routine('7', '물 한 잔', 'wake', 1)]);
  render(<DailyRoutines />);
  fireEvent.click(await screen.findByRole('button', { name: '물 한 잔 보관' }));
  expect(calls.filter((c) => c.method === 'POST')).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: '물 한 잔 보관 확인' }));
  expect(
    await screen.findByText("'물 한 잔' 루틴을 보관했습니다. 지난 기록은 남아 있습니다"),
  ).toBeInTheDocument();
  expect(calls.find((c) => c.method === 'POST')?.url).toBe('/api/routines/7/archive');
});
