import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

type Node = { type: unknown; props: Record<string, unknown> & { children: unknown[] } };

// Minimal React stand-in: renders function components, supports useState/useEffect on the App.
type FetchInit = { method?: string; body?: string };
type FetchImpl = (
  path: string,
  init?: FetchInit,
) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

function mount(fetchImpl: FetchImpl) {
  const states: unknown[] = [];
  const effectDeps: unknown[][] = [];
  let cursor = 0;
  let pending: (() => void)[] = [];
  let element: Node | undefined;
  const react = {
    Fragment: 'fragment',
    createElement: (
      type: unknown,
      props: Record<string, unknown> | null,
      ...children: unknown[]
    ) => ({
      type,
      props: { ...(props ?? {}), children: children.flat() },
    }),
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in states))
        states[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
      return [
        states[index],
        (next: unknown) => {
          states[index] =
            typeof next === 'function' ? (next as (v: unknown) => unknown)(states[index]) : next;
        },
      ];
    },
    useEffect(effect: () => void, deps?: unknown[]) {
      const index = cursor++;
      const previous = effectDeps[index];
      if (!deps || !previous || deps.some((d, i) => d !== previous[i])) {
        effectDeps[index] = deps ?? [];
        pending.push(effect);
      }
    },
  };
  // Loads frontend/src modules (./x resolves to x.tsx or x.ts) with the stand-ins above.
  const modules = new Map<string, unknown>();
  const load = (file: string) => {
    if (modules.has(file)) return modules.get(file);
    const exports = {};
    modules.set(file, exports);
    const source = ts.transpileModule(
      readFileSync(new URL('../../frontend/src/' + file, import.meta.url), 'utf8'),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.React,
          esModuleInterop: true,
        },
      },
    ).outputText;
    runInNewContext(source, {
      exports,
      require: (name: string) => {
        if (name === 'react') return react;
        if (name === 'react-dom/client')
          return { createRoot: () => ({ render: (v: Node) => (element = v) }) };
        if (name === 'lucide-react') return new Proxy({}, { get: () => () => null });
        if (name.endsWith('.css')) return {};
        if (name.startsWith('./')) {
          const base = name.slice(2);
          const tsx = new URL('../../frontend/src/' + base + '.tsx', import.meta.url);
          return load(existsSync(tsx) ? base + '.tsx' : base + '.ts');
        }
        throw new Error('Unexpected import: ' + name);
      },
      document: { getElementById: () => ({}) },
      fetch: fetchImpl,
      console,
    });
    return exports;
  };
  load('main.tsx');
  const resolve = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(resolve);
    if (!node || typeof node !== 'object') return node;
    const { type, props } = node as Node;
    if (typeof type === 'function') return resolve(type(props));
    return { type, props: { ...props, children: props.children.map(resolve) } };
  };
  let tree: unknown;
  const render = () => {
    cursor = 0;
    tree = resolve(element);
  };
  const settle = async () => {
    for (let i = 0; i < 5; i++) {
      render();
      const effects = pending;
      pending = [];
      effects.forEach((effect) => effect());
      await new Promise((r) => setImmediate(r));
    }
    render();
  };
  const text = (node: unknown = tree): string =>
    Array.isArray(node)
      ? node.map(text).join('')
      : node && typeof node === 'object'
        ? text((node as Node).props.children)
        : node === null || node === undefined || node === false
          ? ''
          : String(node);
  const find = (match: (n: Node) => boolean, node: unknown = tree): Node[] => {
    if (Array.isArray(node)) return node.flatMap((child) => find(match, child));
    if (!node || typeof node !== 'object') return [];
    const current = node as Node;
    return [...(match(current) ? [current] : []), ...find(match, current.props.children)];
  };
  const click = async (label: string) => {
    const [button] = find((n) => n.type === 'button' && text(n).includes(label));
    assert.ok(button, 'button ' + label);
    (button.props.onClick as () => void)();
    await settle();
  };
  const byLabel = (type: string, label: string) => {
    const [node] = find((n) => n.type === type && n.props['aria-label'] === label);
    assert.ok(node, type + ' ' + label);
    return node;
  };
  const press = async (label: string) => {
    const button = byLabel('button', label);
    assert.ok(!button.props.disabled, 'enabled button ' + label);
    (button.props.onClick as () => void)();
    await settle();
  };
  const type = async (label: string, value: string) => {
    (byLabel('input', label).props.onChange as (e: unknown) => void)({ target: { value } });
    await settle();
  };
  const submit = async (label: string) => {
    (byLabel('form', label).props.onSubmit as (e: unknown) => void)({ preventDefault() {} });
    await settle();
  };
  return { settle, text, find, click, press, type, submit, byLabel };
}

const healthy = async () => ({ ok: true, json: async () => ({ ok: true, today: '2026-10-19' }) });

// The backend-only deploy repository (subtree) has no frontend sources; the umbrella CI runs these.
const frontendMissing = !existsSync(new URL('../../frontend/src/main.tsx', import.meta.url));
const uiTest = frontendMissing ? test.skip : test;

uiTest('the shell shows the app title, navigation and a connected status', async () => {
  const ui = mount(healthy);
  await ui.settle();
  assert.match(ui.text(), /계획·실천·루틴·피드백/);
  assert.ok(ui.find((n) => n.type === 'nav').length === 1);
  const status = ui.find((n) => n.props.role === 'status');
  assert.match(ui.text(status), /서버 연결됨 · 2026-10-19/);
});

uiTest('an unreachable API shows a Korean alert instead of a crash', async () => {
  const ui = mount(async () => {
    throw new Error('offline');
  });
  await ui.settle();
  const alert = ui.find((n) => n.props.role === 'alert');
  assert.match(ui.text(alert), /서버에 연결할 수 없습니다/);
});

uiTest('navigation switches the page heading', async () => {
  const ui = mount(healthy);
  await ui.settle();
  await ui.click('설정');
  assert.match(ui.text(ui.find((n) => n.type === 'h1')), /설정/);
});

// In-memory stand-in for the routine API, recording every write request.
function routineApi(initial: { id: string; name: string; category: string }[] = []) {
  let routines = initial.map((routine, index) => ({
    ...routine,
    cadence: 'daily',
    sortOrder: index,
  }));
  let nextId = 100;
  const writes: { method: string; path: string; body: unknown }[] = [];
  const reply = (status: number, data: unknown) => ({
    ok: status < 400,
    json: async () => data,
  });
  const fetchImpl: FetchImpl = async (path, init) => {
    if (path === '/api/health') return reply(200, { ok: true, today: '2026-10-22' });
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(init.body) as Record<string, string>) : undefined;
    if (method === 'GET' && path === '/api/routines?cadence=daily') return reply(200, { routines });
    writes.push({ method, path, body });
    if (method === 'POST' && path === '/api/routines') {
      if (body?.name === '중복') return reply(409, { error: '이미 등록된 항목입니다' });
      const sortOrder = routines.filter((r) => r.category === body?.category).length;
      const routine = {
        id: String(nextId++),
        name: body!.name,
        cadence: 'daily',
        category: body!.category,
        sortOrder,
      };
      routines = [...routines, routine];
      return reply(201, { routine });
    }
    const [, , , id, action] = path.split('/');
    const target = routines.find((r) => r.id === id);
    if (!target) return reply(404, { error: '루틴을 찾을 수 없습니다' });
    if (method === 'PATCH') target.name = body!.name;
    if (action === 'archive') routines = routines.filter((r) => r !== target);
    if (action === 'move') {
      const group = routines
        .filter((r) => r.category === target.category)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const index = group.indexOf(target);
      const other = group[body!.direction === 'up' ? index - 1 : index + 1];
      if (other) [target.sortOrder, other.sortOrder] = [other.sortOrder, target.sortOrder];
    }
    // Same response shapes as the real API: move returns the reordered group.
    if (action === 'move')
      return reply(200, {
        routines: routines
          .filter((r) => r.category === target.category)
          .sort((a, b) => a.sortOrder - b.sortOrder),
      });
    return reply(200, { routine: target });
  };
  // Simulates a change made elsewhere (another tab) without a request from this page.
  const archiveElsewhere = (id: string) => {
    routines = routines.filter((r) => r.id !== id);
  };
  return { fetchImpl, writes, archiveElsewhere };
}

async function openRoutines(api: ReturnType<typeof routineApi>) {
  const ui = mount(api.fetchImpl);
  await ui.settle();
  await ui.click('하루 루틴');
  return ui;
}

uiTest('the daily routine page lists all seven categories with empty states', async () => {
  const ui = await openRoutines(routineApi());
  const sections = ui.find(
    (n) => n.type === 'section' && /루틴$/.test(String(n.props['aria-label'])),
  );
  assert.deepEqual(
    sections.map((n) => n.props['aria-label']),
    ['기상', '운동', '식단', '가사', '관리', '공부', '독서'].map((label) => label + ' 루틴'),
  );
  assert.equal(ui.find((n) => n.props.className === 'muted').length, 7);
});

uiTest('adding a routine posts it to its category and shows it in the list', async () => {
  const api = routineApi();
  const ui = await openRoutines(api);
  await ui.type('운동 새 루틴 이름', '  스쿼트 30회 ');
  await ui.submit('운동 루틴 추가');
  assert.deepEqual(api.writes, [
    {
      method: 'POST',
      path: '/api/routines',
      body: { name: '스쿼트 30회', cadence: 'daily', category: 'exercise' },
    },
  ]);
  assert.match(ui.text(ui.byLabel('section', '운동 루틴')), /스쿼트 30회/);
  assert.match(
    ui.text(ui.find((n) => n.props.role === 'status')),
    /운동에 '스쿼트 30회' 루틴을 추가했습니다/,
  );
  assert.equal(ui.byLabel('input', '운동 새 루틴 이름').props.value, '');
});

uiTest('an empty name or a server error shows a Korean alert and keeps the draft', async () => {
  const api = routineApi();
  const ui = await openRoutines(api);
  await ui.submit('기상 루틴 추가');
  assert.equal(api.writes.length, 0);
  assert.match(ui.text(ui.find((n) => n.props.role === 'alert')), /루틴 이름을 입력해 주세요/);
  await ui.type('기상 새 루틴 이름', '중복');
  await ui.submit('기상 루틴 추가');
  assert.match(ui.text(ui.find((n) => n.props.role === 'alert')), /이미 등록된 항목입니다/);
  assert.equal(ui.byLabel('input', '기상 새 루틴 이름').props.value, '중복');
});

uiTest('routines can be reordered, renamed and archived after confirmation', async () => {
  const api = routineApi([
    { id: '1', name: '6시 기상', category: 'wake' },
    { id: '2', name: '물 한 잔', category: 'wake' },
  ]);
  const ui = await openRoutines(api);
  const wakeNames = () =>
    ui.find((n) => n.props.className === 'routine-name').map((n) => ui.text(n));
  assert.deepEqual(wakeNames(), ['6시 기상', '물 한 잔']);
  assert.equal(ui.byLabel('button', '6시 기상 위로 이동').props.disabled, true);

  await ui.press('물 한 잔 위로 이동');
  assert.deepEqual(api.writes.at(-1), {
    method: 'POST',
    path: '/api/routines/2/move',
    body: { direction: 'up' },
  });
  assert.deepEqual(wakeNames(), ['물 한 잔', '6시 기상']);

  await ui.press('6시 기상 이름 수정');
  await ui.type('6시 기상 새 이름', '6시 30분 기상');
  await ui.submit('6시 기상 이름 수정');
  assert.deepEqual(api.writes.at(-1), {
    method: 'PATCH',
    path: '/api/routines/1',
    body: { name: '6시 30분 기상' },
  });
  assert.deepEqual(wakeNames(), ['물 한 잔', '6시 30분 기상']);

  // The first press only asks for confirmation; nothing is archived yet.
  await ui.press('물 한 잔 보관');
  assert.equal(api.writes.at(-1)?.method, 'PATCH');
  await ui.press('물 한 잔 보관 확인');
  assert.deepEqual(api.writes.at(-1), {
    method: 'POST',
    path: '/api/routines/2/archive',
    body: undefined,
  });
  assert.deepEqual(wakeNames(), ['6시 30분 기상']);
  assert.match(ui.text(ui.find((n) => n.props.role === 'status')), /지난 기록은 남아 있습니다/);
});

uiTest('a routine changed elsewhere shows the Korean 404 and the list reloads', async () => {
  const api = routineApi([
    { id: '1', name: '6시 기상', category: 'wake' },
    { id: '2', name: '물 한 잔', category: 'wake' },
  ]);
  const ui = await openRoutines(api);
  api.archiveElsewhere('2');
  await ui.press('물 한 잔 위로 이동');
  assert.match(ui.text(ui.find((n) => n.props.role === 'alert')), /루틴을 찾을 수 없습니다/);
  assert.deepEqual(
    ui.find((n) => n.props.className === 'routine-name').map((n) => ui.text(n)),
    ['6시 기상'],
  );
});
