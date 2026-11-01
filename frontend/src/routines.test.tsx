import { act, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { groupByCategory } from './routine-groups';
import { DailyRoutines, type Routine } from './routines';

// Focus follows a reload, which on a busy machine can outlast the default one second.
configure({ asyncUtilTimeout: 10_000 });

type Seed = { id: string; name: string; category: string };

// A fake routine API with state, like the server: add, move, rename, archive, and 404 for
// a routine that is gone. Moved here from backend/test/app-ui.test.ts (#27).
function routineApi(seed: Seed[] = []) {
  let routines: Routine[] = seed.map((r, i) => ({ ...r, cadence: 'daily', sortOrder: i + 1 }));
  let nextId = 100;
  const writes: { method: string; path: string; body?: unknown }[] = [];
  const reply = (status: number, body: unknown) =>
    Promise.resolve(new Response(JSON.stringify(body), { status }));
  const notFound = () => reply(404, { error: '루틴을 찾을 수 없습니다' });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const path = url.split('?')[0];
      if (method === 'GET') return reply(200, { routines });
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      writes.push({ method, path, body });
      const id = path.split('/')[3];
      const found = routines.find((r) => r.id === id);
      if (method === 'POST' && path === '/api/routines') {
        if (body.name === '중복') return reply(409, { error: '이미 등록된 항목입니다' });
        const sortOrder = routines.filter((r) => r.category === body.category).length + 1;
        routines = [...routines, { ...body, id: String(nextId++), sortOrder }];
        return reply(201, {});
      }
      if (!found) return notFound();
      if (path.endsWith('/move')) {
        const group = routines
          .filter((r) => r.category === found.category)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        const other = group[group.indexOf(found) + (body.direction === 'up' ? -1 : 1)];
        if (other) [found.sortOrder, other.sortOrder] = [other.sortOrder, found.sortOrder];
        return reply(200, {});
      }
      if (path.endsWith('/archive')) {
        if (found.name === '보관 실패') return reply(500, { error: '서버 오류가 발생했습니다' });
        routines = routines.filter((r) => r !== found);
        return reply(200, {});
      }
      if (body.name === '중복') return reply(409, { error: '이미 등록된 항목입니다' });
      if (body.name === '실패') return reply(500, { error: '서버 오류가 발생했습니다' });
      found.name = body.name;
      return reply(200, {});
    }),
  );
  return {
    writes,
    archiveElsewhere: (id: string) => (routines = routines.filter((r) => r.id !== id)),
  };
}

const region = (label: string) => screen.getByRole('region', { name: `${label} 루틴` });
const names = (label: string) =>
  within(region(label))
    .queryAllByRole('listitem')
    .map((li) => li.firstElementChild?.textContent);

test('groups routines by category in the backend order and by sort order inside a group', () => {
  const groups = groupByCategory([
    { id: '2', name: '스트레칭', cadence: 'daily', category: 'exercise', sortOrder: 2 },
    { id: '1', name: '물 한 잔', cadence: 'daily', category: 'wake', sortOrder: 1 },
    { id: '3', name: '푸시업', cadence: 'daily', category: 'exercise', sortOrder: 1 },
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

test('the daily routine page lists all seven categories with empty states', async () => {
  routineApi();
  render(<DailyRoutines />);
  for (const label of ['기상', '운동', '식단', '가사', '관리', '공부', '독서']) {
    const group = await screen.findByRole('region', { name: `${label} 루틴` });
    expect(within(group).getByRole('heading', { level: 2, name: new RegExp(label) })).toBeVisible();
    expect(within(group).getByText('아직 루틴이 없습니다')).toBeInTheDocument();
  }
});

test('adding a routine posts it to its category and shows it in the list', async () => {
  const api = routineApi();
  render(<DailyRoutines />);
  const reading = await screen.findByRole('region', { name: '독서 루틴' });
  fireEvent.change(within(reading).getByRole('textbox', { name: '독서 새 루틴 이름' }), {
    target: { value: '10쪽 읽기' },
  });
  fireEvent.click(within(reading).getByRole('button', { name: '추가' }));
  expect(await screen.findByText("독서에 '10쪽 읽기' 루틴을 추가했습니다")).toBeInTheDocument();
  expect(api.writes).toEqual([
    {
      method: 'POST',
      path: '/api/routines',
      body: { name: '10쪽 읽기', cadence: 'daily', category: 'reading' },
    },
  ]);
  await waitFor(() => expect(names('독서')).toEqual(['10쪽 읽기']));
  expect(within(region('독서')).getByRole('textbox', { name: '독서 새 루틴 이름' })).toHaveValue(
    '',
  );
});

test('an empty name or a server error shows a Korean alert and keeps the draft', async () => {
  const api = routineApi();
  render(<DailyRoutines />);
  const wake = await screen.findByRole('region', { name: '기상 루틴' });
  fireEvent.click(within(wake).getByRole('button', { name: '추가' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('루틴 이름을 입력해 주세요');
  expect(api.writes).toEqual([]);

  const input = within(wake).getByRole('textbox', { name: '기상 새 루틴 이름' });
  fireEvent.change(input, { target: { value: '중복' } });
  fireEvent.click(within(wake).getByRole('button', { name: '추가' }));
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('이미 등록된 항목입니다'),
  );
  expect(within(region('기상')).getByRole('textbox', { name: '기상 새 루틴 이름' })).toHaveValue(
    '중복',
  );
});

test('routines can be reordered, renamed and archived after confirmation', async () => {
  const api = routineApi([
    { id: '1', name: '6시 기상', category: 'wake' },
    { id: '2', name: '물 한 잔', category: 'wake' },
  ]);
  render(<DailyRoutines />);
  await screen.findByText('6시 기상');
  expect(names('기상')).toEqual(['6시 기상', '물 한 잔']);
  expect(screen.getByRole('button', { name: '6시 기상 위로 이동' })).toBeDisabled();

  fireEvent.click(screen.getByRole('button', { name: '물 한 잔 위로 이동' }));
  await waitFor(() => expect(names('기상')).toEqual(['물 한 잔', '6시 기상']));
  expect(api.writes.at(-1)).toEqual({
    method: 'POST',
    path: '/api/routines/2/move',
    body: { direction: 'up' },
  });

  fireEvent.click(screen.getByRole('button', { name: '6시 기상 이름 수정' }));
  fireEvent.change(screen.getByRole('textbox', { name: '6시 기상 새 이름' }), {
    target: { value: '6시 30분 기상' },
  });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(names('기상')).toEqual(['물 한 잔', '6시 30분 기상']));
  expect(api.writes.at(-1)).toEqual({
    method: 'PATCH',
    path: '/api/routines/1',
    body: { name: '6시 30분 기상' },
  });

  // The first press only asks for confirmation; nothing is archived yet.
  fireEvent.click(screen.getByRole('button', { name: '물 한 잔 보관' }));
  expect(api.writes.at(-1)?.method).toBe('PATCH');
  fireEvent.click(screen.getByRole('button', { name: '물 한 잔 보관 확인' }));
  await waitFor(() => expect(names('기상')).toEqual(['6시 30분 기상']));
  expect(api.writes.at(-1)).toEqual({
    method: 'POST',
    path: '/api/routines/2/archive',
    body: undefined,
  });
  expect(screen.getByRole('status')).toHaveTextContent('지난 기록은 남아 있습니다');
});

test('a routine changed elsewhere shows the Korean 404 and the list reloads', async () => {
  const api = routineApi([
    { id: '1', name: '6시 기상', category: 'wake' },
    { id: '2', name: '물 한 잔', category: 'wake' },
  ]);
  render(<DailyRoutines />);
  await screen.findByText('물 한 잔');
  api.archiveElsewhere('2');
  fireEvent.click(screen.getByRole('button', { name: '물 한 잔 위로 이동' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('루틴을 찾을 수 없습니다');
  await waitFor(() => expect(names('기상')).toEqual(['6시 기상']));
});

const twoRoutines = [
  { id: '1', name: '6시 기상', category: 'wake' },
  { id: '2', name: '물 한 잔', category: 'wake' },
];
const button = (name: string) => screen.getByRole('button', { name });

test('saving a rename returns focus to its edit button', async () => {
  routineApi(twoRoutines);
  render(<DailyRoutines />);
  await screen.findByText('6시 기상');
  fireEvent.click(button('6시 기상 이름 수정'));
  const input = screen.getByRole('textbox', { name: '6시 기상 새 이름' });
  expect(input).toHaveFocus();
  fireEvent.change(input, { target: { value: '일찍 기상' } });
  fireEvent.click(button('저장'));
  await waitFor(() => expect(button('일찍 기상 이름 수정')).toHaveFocus());
});

test('cancelling a rename returns focus to its edit button', async () => {
  routineApi(twoRoutines);
  render(<DailyRoutines />);
  await screen.findByText('6시 기상');
  fireEvent.click(button('6시 기상 이름 수정'));
  fireEvent.click(button('취소'));
  await waitFor(() => expect(button('6시 기상 이름 수정')).toHaveFocus());
});

test('a rename that fails keeps the form and returns focus to its field', async () => {
  routineApi(twoRoutines);
  render(<DailyRoutines />);
  await screen.findByText('6시 기상');
  fireEvent.click(button('6시 기상 이름 수정'));
  const input = screen.getByRole('textbox', { name: '6시 기상 새 이름' });
  fireEvent.change(input, { target: { value: '중복' } });
  input.blur();
  fireEvent.click(button('저장'));
  await screen.findByRole('alert');
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: '6시 기상 새 이름' })).toHaveFocus(),
  );
  expect(screen.getByRole('textbox', { name: '6시 기상 새 이름' })).toHaveValue('중복');
});

test('renaming a routine that has gone moves focus to the add field', async () => {
  const api = routineApi(twoRoutines);
  render(<DailyRoutines />);
  await screen.findByText('6시 기상');
  fireEvent.click(button('6시 기상 이름 수정'));
  api.archiveElsewhere('1');
  fireEvent.click(button('저장'));
  await screen.findByRole('alert');
  await waitFor(() =>
    expect(screen.queryByRole('textbox', { name: '6시 기상 새 이름' })).not.toBeInTheDocument(),
  );
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: '기상 새 루틴 이름' })).toHaveFocus(),
  );
});

test('moving a routine that has gone moves focus to the add field', async () => {
  const api = routineApi(twoRoutines);
  render(<DailyRoutines />);
  await screen.findByText('물 한 잔');
  api.archiveElsewhere('2');
  fireEvent.click(button('물 한 잔 위로 이동'));
  await screen.findByRole('alert');
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: '기상 새 루틴 이름' })).toHaveFocus(),
  );
});

test('an archive that fails stays on its own row', async () => {
  routineApi([{ id: '1', name: '보관 실패', category: 'wake' }, twoRoutines[1]]);
  render(<DailyRoutines />);
  await screen.findByText('보관 실패');
  fireEvent.click(button('보관 실패 보관'));
  fireEvent.click(button('보관 실패 보관 확인'));
  await screen.findByRole('alert');
  await waitFor(() => expect(button('보관 실패 이름 수정')).toHaveFocus());
});

test('moving a routine keeps focus on the same button', async () => {
  routineApi([...twoRoutines, { id: '3', name: '스트레칭', category: 'wake' }]);
  render(<DailyRoutines />);
  await screen.findByText('스트레칭');
  fireEvent.click(button('스트레칭 위로 이동'));
  await waitFor(() => expect(names('기상')).toEqual(['6시 기상', '스트레칭', '물 한 잔']));
  await waitFor(() => expect(button('스트레칭 위로 이동')).toHaveFocus());
});

test('a routine moved to the end of its group hands focus to the other direction', async () => {
  routineApi(twoRoutines);
  render(<DailyRoutines />);
  await screen.findByText('물 한 잔');
  // The pressed button keeps focus while disabled, as some browsers do; that is not moving on.
  button('물 한 잔 위로 이동').focus();
  fireEvent.click(button('물 한 잔 위로 이동'));
  await waitFor(() => expect(names('기상')).toEqual(['물 한 잔', '6시 기상']));
  expect(button('물 한 잔 위로 이동')).toBeDisabled();
  await waitFor(() => expect(button('물 한 잔 아래로 이동')).toHaveFocus());
});

test('archiving moves focus to the next routine, then the previous one', async () => {
  routineApi([...twoRoutines, { id: '3', name: '스트레칭', category: 'wake' }]);
  render(<DailyRoutines />);
  await screen.findByText('스트레칭');
  fireEvent.click(button('물 한 잔 보관'));
  fireEvent.click(button('물 한 잔 보관 확인'));
  await waitFor(() => expect(button('스트레칭 이름 수정')).toHaveFocus());

  fireEvent.click(button('스트레칭 보관'));
  fireEvent.click(button('스트레칭 보관 확인'));
  await waitFor(() => expect(button('6시 기상 이름 수정')).toHaveFocus());
});

test('archiving the last routine of a group moves focus to the add field', async () => {
  routineApi([{ id: '1', name: '6시 기상', category: 'wake' }]);
  render(<DailyRoutines />);
  await screen.findByText('6시 기상');
  fireEvent.click(button('6시 기상 보관'));
  fireEvent.click(button('6시 기상 보관 확인'));
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: '기상 새 루틴 이름' })).toHaveFocus(),
  );
});

test('adding a routine returns focus to the add field, ready for the next one', async () => {
  routineApi();
  render(<DailyRoutines />);
  const reading = await screen.findByRole('region', { name: '독서 루틴' });
  fireEvent.change(within(reading).getByRole('textbox', { name: '독서 새 루틴 이름' }), {
    target: { value: '10쪽 읽기' },
  });
  fireEvent.click(within(reading).getByRole('button', { name: '추가' }));
  await screen.findByText('10쪽 읽기');
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: '독서 새 루틴 이름' })).toHaveFocus(),
  );
});

test('a change does not take focus back once the user has moved on', async () => {
  routineApi(twoRoutines);
  render(<DailyRoutines />);
  await screen.findByText('6시 기상');
  // Answers wait until released, as on a slow connection.
  const working = vi.mocked(fetch).getMockImplementation()!;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => gate.then(() => working(url, init))),
  );
  const wake = screen.getByRole('textbox', { name: '기상 새 루틴 이름' });
  wake.focus();
  fireEvent.change(wake, { target: { value: '기지개' } });
  fireEvent.click(within(region('기상')).getByRole('button', { name: '추가' }));

  const reading = screen.getByRole('textbox', { name: '독서 새 루틴 이름' });
  reading.focus();
  release();
  await screen.findByText('기지개');
  await act(() => new Promise((resolve) => setTimeout(resolve)));
  expect(reading).toHaveFocus();
});

test('a reload from elsewhere does not move focus', async () => {
  routineApi(twoRoutines);
  render(<DailyRoutines />);
  await screen.findByText('6시 기상');
  const add = screen.getByRole('textbox', { name: '운동 새 루틴 이름' });
  add.focus();
  const loads = vi.mocked(fetch).mock.calls.length;
  document.dispatchEvent(new Event('visibilitychange'));
  await act(() => new Promise((resolve) => setTimeout(resolve)));
  expect(vi.mocked(fetch).mock.calls.length).toBe(loads + 1);
  expect(add).toHaveFocus();
});

test('on a touch screen no field takes focus, so no keyboard pops up unasked', async () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: query === '(pointer: coarse)' })),
  );
  routineApi([{ id: '1', name: '6시 기상', category: 'wake' }]);
  render(<DailyRoutines />);
  await screen.findByText('6시 기상');
  fireEvent.click(button('6시 기상 보관'));
  fireEvent.click(button('6시 기상 보관 확인'));
  await waitFor(() => expect(screen.queryByText('6시 기상')).not.toBeInTheDocument());
  await act(() => new Promise((resolve) => setTimeout(resolve)));
  expect(screen.getByRole('textbox', { name: '기상 새 루틴 이름' })).not.toHaveFocus();
});

test('a routine can be linked to a registered project, or the choice stays hidden', async () => {
  const writes = routineApi([{ id: '1', name: '30분 읽기', category: 'reading' }]);
  const working = vi.mocked(fetch).getMockImplementation()!;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) =>
      url === '/api/project-links'
        ? Promise.resolve(
            new Response(
              JSON.stringify({
                projects: [{ id: '7', name: '독서 기록', url: 'https://books.example/' }],
              }),
            ),
          )
        : url.endsWith('/project-link')
          ? Promise.resolve(new Response(JSON.stringify({ routine: {} })))
          : working(url, init),
    ),
  );
  render(<DailyRoutines />);
  const select = await screen.findByRole('combobox', { name: '30분 읽기 연결할 프로젝트' });
  expect(select).toHaveValue('');
  fireEvent.change(select, { target: { value: '7' } });
  await screen.findByText("'30분 읽기' 루틴에 프로젝트를 연결했습니다");
  const sent = vi.mocked(fetch).mock.calls.find(([url]) => String(url).endsWith('/project-link'));
  expect(sent?.[0]).toBe('/api/routines/1/project-link');
  expect(JSON.parse(String(sent?.[1]?.body))).toEqual({ projectLinkId: '7' });
  expect(writes).toBeDefined();
});

test('with no projects registered a routine offers no link', async () => {
  routineApi(twoRoutines);
  render(<DailyRoutines />);
  await screen.findByText('6시 기상');
  await act(() => new Promise((resolve) => setTimeout(resolve)));
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
});
