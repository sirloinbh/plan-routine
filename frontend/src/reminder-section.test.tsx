import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { ReminderSection } from './reminder-section';
import { getLive } from './test/live';
import { render } from './test/render';

type Settings = {
  pushEnabled: boolean;
  reminderOn: boolean;
  reminderTime: string;
  subscriptionCount: number;
};

const reply = (status: number, body: unknown) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as Response);

// A fake server with the contract of backend #308.
function pushApi(initial: Partial<Settings> = {}, publicKey: string | null = 'AQAB') {
  let settings: Settings = {
    pushEnabled: true,
    reminderOn: false,
    reminderTime: '21:00',
    subscriptionCount: 0,
    ...initial,
  };
  const calls: { method: string; path: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const { pathname } = new URL(url, 'http://localhost');
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, path: pathname, body });
      if (pathname === '/api/push/settings' && method === 'GET') return reply(200, settings);
      if (pathname === '/api/push/settings' && method === 'PUT') {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.reminderTime))
          return reply(400, { error: 'The time must be between 00:00 and 23:59' });
        settings = { ...settings, ...body };
        return reply(200, settings);
      }
      if (pathname === '/api/push/public-key')
        return reply(200, { enabled: publicKey !== null, publicKey });
      if (pathname === '/api/push/subscription' && method === 'PUT') {
        settings = { ...settings, subscriptionCount: settings.subscriptionCount + 1 };
        return reply(200, { subscribed: true, subscriptionCount: settings.subscriptionCount });
      }
      if (pathname === '/api/push/subscription' && method === 'DELETE') {
        settings = { ...settings, subscriptionCount: Math.max(settings.subscriptionCount - 1, 0) };
        return reply(200, { subscribed: false, subscriptionCount: settings.subscriptionCount });
      }
      throw new Error(`Unexpected request ${method} ${url}`);
    }),
  );
  return { calls };
}

// A browser with push: one service worker registration whose push manager holds at most one subscription.
function browser(
  options: {
    permission?: NotificationPermission;
    request?: NotificationPermission;
    subscribed?: boolean;
  } = {},
) {
  let subscription: {
    endpoint: string;
    toJSON: () => unknown;
    unsubscribe: () => Promise<boolean>;
  } | null = options.subscribed ? makeSubscription() : null;
  function makeSubscription() {
    return {
      endpoint: 'https://push.example/abc',
      toJSON: () => ({ endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } }),
      unsubscribe: vi.fn(() => {
        subscription = null;
        return Promise.resolve(true);
      }),
    };
  }
  const subscribe = vi.fn(() => {
    subscription = makeSubscription();
    return Promise.resolve(subscription);
  });
  const registration = {
    pushManager: { getSubscription: () => Promise.resolve(subscription), subscribe },
  };
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistration: () => Promise.resolve(registration),
      ready: Promise.resolve(registration),
    },
  });
  vi.stubGlobal('PushManager', class {});
  const requestPermission = vi.fn(() => Promise.resolve(options.request ?? 'granted'));
  vi.stubGlobal('Notification', { permission: options.permission ?? 'default', requestPermission });
  return { subscribe, requestPermission };
}

// jsdom has none; a switch inside a form reads it.
beforeEach(() => {
  Reflect.deleteProperty(navigator, 'serviceWorker');
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

test('saves the reminder switch and time as one setting', async () => {
  browser();
  const api = pushApi();
  render(<ReminderSection />);
  const time = await screen.findByLabelText('Time (Korea time)');
  expect(time).toHaveValue('21:00');
  fireEvent.click(screen.getByRole('switch', { name: 'Remind me about unchecked daily routines' }));
  fireEvent.change(time, { target: { value: '20:30' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save reminder' }));

  expect(await screen.findByText(/Saved. You will be reminded at 20:30/)).toBeInTheDocument();
  expect(api.calls.filter((call) => call.method === 'PUT')).toEqual([
    {
      method: 'PUT',
      path: '/api/push/settings',
      body: { reminderOn: true, reminderTime: '20:30' },
    },
  ]);
});

test('a time that is not valid is not sent', async () => {
  browser();
  const api = pushApi();
  render(<ReminderSection />);
  fireEvent.change(await screen.findByLabelText('Time (Korea time)'), { target: { value: '' } });
  expect(screen.getByText('Choose a time')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save reminder' })).toBeDisabled();
  expect(api.calls.some((call) => call.method === 'PUT')).toBe(false);
});

test('a server refusal of the setting is shown', async () => {
  browser();
  pushApi();
  render(<ReminderSection />);
  await screen.findByLabelText('Time (Korea time)');
  vi.mocked(fetch).mockImplementationOnce(() =>
    reply(400, { error: 'The time must be between 00:00 and 23:59' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save reminder' }));
  expect(await screen.findByText('The time must be between 00:00 and 23:59')).toBeInTheDocument();
});

test('turning notifications on asks permission, subscribes with the public key and tells the server', async () => {
  const push = browser();
  const api = pushApi({}, 'AQAB');
  render(<ReminderSection />);
  fireEvent.click(await screen.findByRole('button', { name: 'Turn on notifications' }));

  expect(await screen.findByText('Notifications are on for this device')).toBeInTheDocument();
  expect(push.requestPermission).toHaveBeenCalledOnce();
  const options = push.subscribe.mock.calls[0] as unknown as [
    { userVisibleOnly: boolean; applicationServerKey: Uint8Array },
  ];
  expect(options[0].userVisibleOnly).toBe(true);
  expect([...options[0].applicationServerKey]).toEqual([1, 0, 1]);
  expect(api.calls).toContainEqual({
    method: 'PUT',
    path: '/api/push/subscription',
    body: { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } },
  });
  expect(await screen.findByText('1 device receives reminders')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Turn off notifications' })).toBeInTheDocument();
});

test('a refused permission subscribes to nothing', async () => {
  const push = browser({ request: 'denied' });
  const api = pushApi();
  render(<ReminderSection />);
  fireEvent.click(await screen.findByRole('button', { name: 'Turn on notifications' }));
  expect(await screen.findByText('Notifications were not allowed')).toBeInTheDocument();
  expect(screen.getByText(/Notifications are blocked for this site/)).toBeInTheDocument();
  expect(push.subscribe).not.toHaveBeenCalled();
  expect(api.calls.some((call) => call.path === '/api/push/subscription')).toBe(false);
});

test('a site that is already blocked explains how to allow it and offers no button', async () => {
  browser({ permission: 'denied' });
  pushApi();
  render(<ReminderSection />);
  expect(
    await screen.findByText(/Allow them in the browser settings, then reload/),
  ).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Turn on notifications' })).not.toBeInTheDocument();
});

test('turning notifications off removes the subscription on the server and in the browser', async () => {
  browser({ permission: 'granted', subscribed: true });
  const api = pushApi({ subscriptionCount: 1 });
  render(<ReminderSection />);
  fireEvent.click(await screen.findByRole('button', { name: 'Turn off notifications' }));

  expect(await screen.findByText('Notifications are off for this device')).toBeInTheDocument();
  expect(api.calls).toContainEqual({
    method: 'DELETE',
    path: '/api/push/subscription',
    body: { endpoint: 'https://push.example/abc' },
  });
  expect(screen.getByRole('button', { name: 'Turn on notifications' })).toBeInTheDocument();
});

test('without server keys it says so and offers no controls', async () => {
  browser();
  pushApi({ pushEnabled: false });
  render(<ReminderSection />);
  expect(await screen.findByText(/not set up on the server yet/)).toBeInTheDocument();
  expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Turn on notifications' })).not.toBeInTheDocument();
});

test('a server that loses its keys after the page loaded refuses with its own message', async () => {
  browser();
  pushApi({}, null);
  render(<ReminderSection />);
  fireEvent.click(await screen.findByRole('button', { name: 'Turn on notifications' }));
  await waitFor(() =>
    expect(getLive('alert')).toHaveTextContent('Push reminders are not set up on the server'),
  );
});

test('a browser without push says what to do and still lets the time be saved', async () => {
  pushApi();
  render(<ReminderSection />);
  expect(await screen.findByText(/This browser cannot receive notifications/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save reminder' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: 'Turn on notifications' })).not.toBeInTheDocument();
});

test('a failed load shows the error and a retry button', async () => {
  browser();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => reply(500, { error: 'A server error occurred' })),
  );
  render(<ReminderSection />);
  expect(await screen.findByRole('button', { name: 'Try again' }, { timeout: 5000 })).toBeVisible();
});

test('focus stays on the device button when notifications are turned on and off', async () => {
  browser();
  pushApi();
  render(<ReminderSection />);
  const on = await screen.findByRole('button', { name: 'Turn on notifications' });
  on.focus();
  fireEvent.click(on);
  const off = await screen.findByRole('button', { name: 'Turn off notifications' });
  await waitFor(() => expect(off).toHaveFocus());

  fireEvent.click(off);
  const again = await screen.findByRole('button', { name: 'Turn on notifications' });
  await waitFor(() => expect(again).toHaveFocus());
});
