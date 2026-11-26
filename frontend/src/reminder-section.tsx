import { type FormEvent, useEffect, useState } from 'react';

import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Notice } from './components/ui/notice';
import { Spinner } from './components/ui/spinner';
import { Switch } from './components/ui/switch';
import { requestJson } from './lib/api';
import { apiKey, useApiMutation, useApiQuery } from './lib/query';
import { errorText, useNotice } from './lib/use-notice';
import { LoadingRegion } from './loading-region';
import { RetryButton } from './retry-button';

type PushSettings = {
  pushEnabled: boolean;
  reminderOn: boolean;
  reminderTime: string;
  subscriptionCount: number;
};
type PublicKey = { enabled: boolean; publicKey: string | null };
type Saved = { subscribed: boolean; subscriptionCount: number };
type TestResult = { sent: number; removed: number; failed: number };

const settingsPath = '/api/push/settings';
const keyPath = '/api/push/public-key';
const subscriptionPath = '/api/push/subscription';
const testPath = '/api/push/test';
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

// What this browser can do. iPhone Safari only has these once the app is added to the home screen.
const canPush = () =>
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

// The VAPID public key arrives as base64url; PushManager.subscribe wants its bytes.
function keyBytes(key: string) {
  const base64 = key
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(Math.ceil(key.length / 4) * 4, '=');
  const raw = atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

// The registration of the app's service worker, if it runs (it does not in development).
async function registration() {
  const found = await navigator.serviceWorker.getRegistration();
  return found ? navigator.serviceWorker.ready : null;
}

// Evening reminders about unchecked routines, sent as web push (#249). The setting belongs to the account;
// the subscription belongs to this device, so each device turns its own notifications on.
export function ReminderSection() {
  const settingsQuery = useApiQuery<PushSettings>(apiKey(settingsPath), settingsPath, {
    staleTime: 0,
  });
  const settings = settingsQuery.data;
  const { notice, status, error, clear } = useNotice();
  const [reminderOn, setReminderOn] = useState(false);
  const [reminderTime, setReminderTime] = useState('21:00');
  // Seeded once from the server's answer, so a later refresh cannot overwrite what is being typed.
  const [seeded, setSeeded] = useState(false);
  if (settings && !seeded) {
    setSeeded(true);
    setReminderOn(settings.reminderOn);
    setReminderTime(settings.reminderTime);
  }
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    canPush() ? Notification.permission : 'default',
  );
  // undefined while looking; null when this device has no subscription.
  const [endpoint, setEndpoint] = useState<string | null | undefined>(undefined);
  const [deviceBusy, setDeviceBusy] = useState(false);
  // Which device button shows the spinner; deviceBusy still blocks all of them.
  const [testing, setTesting] = useState(false);
  const supported = canPush();

  useEffect(() => {
    if (!supported) return;
    let current = true;
    void (async () => {
      try {
        const ready = await navigator.serviceWorker.getRegistration();
        const subscription = await ready?.pushManager.getSubscription();
        if (current) setEndpoint(subscription?.endpoint ?? null);
      } catch {
        if (current) setEndpoint(null);
      }
    })();
    return () => {
      current = false;
    };
  }, [supported]);

  const save = useApiMutation<PushSettings, { reminderOn: boolean; reminderTime: string }>(
    (body) => ({ path: settingsPath, method: 'PUT', body }),
    { invalidate: [apiKey(settingsPath)] },
  );
  const timeValid = timePattern.test(reminderTime);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!timeValid || save.isPending) return;
    clear();
    save.mutate(
      { reminderOn, reminderTime },
      {
        onSuccess: () =>
          status(
            reminderOn
              ? `Saved. You will be reminded at ${reminderTime} (Korea time)`
              : 'Saved. Reminders are off',
          ),
        onError: (cause) => error(cause),
      },
    );
  };

  // The buttons are not disabled while working (a disabled button loses keyboard focus); repeat presses are ignored.
  const turnOn = async () => {
    if (deviceBusy) return;
    setDeviceBusy(true);
    clear();
    try {
      const { enabled, publicKey } = await requestJson<PublicKey>(keyPath);
      if (!enabled || !publicKey) {
        error('Push reminders are not set up on the server');
        return;
      }
      const asked = await Notification.requestPermission();
      setPermission(asked);
      if (asked !== 'granted') {
        // A refusal also changes the status text below, which says how to allow it again.
        error('Notifications were not allowed');
        return;
      }
      const ready = await registration();
      if (!ready) {
        error('The background service of the app is not running. Reload the page and try again');
        return;
      }
      const subscription =
        (await ready.pushManager.getSubscription()) ??
        (await ready.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes(publicKey),
        }));
      await requestJson<Saved>(subscriptionPath, { method: 'PUT', body: subscription.toJSON() });
      setEndpoint(subscription.endpoint);
      await settingsQuery.refetch();
      status('Notifications are on for this device');
    } catch (cause) {
      error(cause, 'Could not turn on notifications');
    } finally {
      setDeviceBusy(false);
    }
  };

  const turnOff = async () => {
    if (deviceBusy) return;
    setDeviceBusy(true);
    clear();
    try {
      const ready = await navigator.serviceWorker.getRegistration();
      const subscription = await ready?.pushManager.getSubscription();
      if (subscription) {
        // The server forgets it first: a subscription removed only in the browser would keep getting messages.
        await requestJson<Saved>(subscriptionPath, {
          method: 'DELETE',
          body: { endpoint: subscription.endpoint },
        });
        await subscription.unsubscribe();
      }
      setEndpoint(null);
      await settingsQuery.refetch();
      status('Notifications are off for this device');
    } catch (cause) {
      error(cause, 'Could not turn off notifications');
    } finally {
      setDeviceBusy(false);
    }
  };

  // #323: one push to every subscribed device now, so the whole path can be checked without waiting for the evening.
  const sendTest = async () => {
    if (deviceBusy) return;
    setDeviceBusy(true);
    setTesting(true);
    clear();
    try {
      const result = await requestJson<TestResult>(testPath, { method: 'POST' });
      if (result.removed > 0) await settingsQuery.refetch();
      if (result.sent > 0)
        status(
          result.sent === 1
            ? 'Test notification sent. It should appear in a few seconds'
            : `Test notification sent to ${result.sent} devices. It should appear in a few seconds`,
        );
      else
        error(
          'The test notification could not be delivered. Turn notifications off and on again on this device',
        );
    } catch (cause) {
      error(cause, 'Could not send a test notification');
    } finally {
      setDeviceBusy(false);
      setTesting(false);
    }
  };

  let body;
  if (!settings) {
    body = settingsQuery.isError ? (
      <div className="flex flex-col items-start gap-3">
        <Notice notice={{ kind: 'error', text: errorText(settingsQuery.error) }} />
        <RetryButton onClick={() => void settingsQuery.refetch()}>Try again</RetryButton>
      </div>
    ) : (
      <LoadingRegion label="Loading reminder settings" />
    );
  } else if (!settings.pushEnabled) {
    body = (
      <p className="text-body-sm text-muted-foreground">
        Reminders are not set up on the server yet, so they cannot be turned on.
      </p>
    );
  } else {
    body = (
      <>
        <form className="flex flex-col gap-4" onSubmit={submit} aria-label="Reminder time">
          <div className="flex items-center gap-3">
            <Switch id="reminder-on" checked={reminderOn} onCheckedChange={setReminderOn} />
            <Label htmlFor="reminder-on" className="font-normal">
              Remind me about unchecked daily routines
            </Label>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reminder-time">Time (Korea time)</Label>
            <Input
              id="reminder-time"
              type="time"
              className="w-40"
              value={reminderTime}
              aria-invalid={!timeValid}
              onChange={(event) => setReminderTime(event.target.value)}
            />
            {!timeValid && (
              <p className="text-caption font-semibold text-destructive">Choose a time</p>
            )}
          </div>
          <Button type="submit" className="self-start" disabled={!timeValid}>
            {save.isPending && <Spinner size="sm" label="Saving" />}
            Save reminder
          </Button>
        </form>
        <div className="flex flex-col items-start gap-2">
          <h3 className="text-body-sm font-semibold">This device</h3>
          {!supported ? (
            <p className="text-body-sm text-muted-foreground">
              This browser cannot receive notifications. On an iPhone, add the app to the home
              screen first and open it from there.
            </p>
          ) : permission === 'denied' && !endpoint ? (
            <p className="text-body-sm text-muted-foreground">
              Notifications are blocked for this site. Allow them in the browser settings, then
              reload this page.
            </p>
          ) : endpoint ? (
            <>
              <p className="text-body-sm text-muted-foreground">
                Notifications are on for this device.
              </p>
              {/* The same shape as the "off" branch below, so the toggle button stays one element and keeps focus. */}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  aria-busy={deviceBusy}
                  onClick={() => void turnOff()}
                >
                  {deviceBusy && !testing && <Spinner size="sm" label="Working" />}
                  Turn off notifications
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  aria-busy={deviceBusy}
                  onClick={() => void sendTest()}
                >
                  {testing && <Spinner size="sm" label="Sending" />}
                  Send a test notification
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-body-sm text-muted-foreground">
                {endpoint === undefined
                  ? 'Checking this device…'
                  : 'Notifications are off for this device, so no reminder will reach it.'}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={endpoint === undefined}
                  aria-busy={deviceBusy}
                  onClick={() => void turnOn()}
                >
                  {deviceBusy && <Spinner size="sm" label="Working" />}
                  Turn on notifications
                </Button>
              </div>
            </>
          )}
          <p className="text-caption text-muted-foreground">
            {settings.subscriptionCount === 1
              ? '1 device receives reminders'
              : `${settings.subscriptionCount} devices receive reminders`}
          </p>
        </div>
      </>
    );
  }

  return (
    <Card role="region" aria-label="Evening reminder">
      <CardHeader>
        <CardTitle>Evening reminder</CardTitle>
        <CardDescription>
          A notification at the time you choose, only when daily routines for today are still
          unchecked. Skipped routines do not count.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {body}
        <Notice notice={notice} className="wrap-anywhere" />
      </CardContent>
    </Card>
  );
}
