// The browser side of phone alerts: what this browser can do, and the
// permission and subscription steps. Permission is asked only inside
// enablePush, which runs when the person presses the switch.

export type AlertState =
  | 'unsupported' // this browser cannot do phone alerts
  | 'server-off' // the server has no keys
  | 'denied' // the person blocked notifications in the browser
  | 'on'
  | 'off';

export interface AlertFacts {
  supported: boolean;
  serverEnabled: boolean;
  permission: NotificationPermission | 'unsupported';
  subscribed: boolean;
}

export function alertState(facts: AlertFacts): AlertState {
  if (!facts.supported) return 'unsupported';
  if (!facts.serverEnabled) return 'server-off';
  if (facts.subscribed && facts.permission === 'granted') return 'on';
  if (facts.permission === 'denied') return 'denied';
  return 'off';
}

export function pushSupported(
  win: Pick<Window, 'navigator'> & Partial<Window> = window
) {
  return (
    'serviceWorker' in win.navigator &&
    'PushManager' in win &&
    'Notification' in win
  );
}

export function permission(): NotificationPermission | 'unsupported' {
  return 'Notification' in window ? Notification.permission : 'unsupported';
}

async function registration() {
  return navigator.serviceWorker.getRegistration('/');
}

export async function isSubscribed() {
  if (!pushSupported()) return false;
  const reg = await registration();
  return !!(await reg?.pushManager.getSubscription());
}

// The key the server signs with arrives as URL-safe base64.
function keyBytes(key: string) {
  const padded = key
    .padEnd(Math.ceil(key.length / 4) * 4, '=')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

// Asks the browser for permission, then subscribes. Returns what the server
// must keep, or null when the person said no.
export async function enablePush(publicKey: string) {
  if ((await Notification.requestPermission()) !== 'granted') return null;
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(publicKey),
    }));
  return sub.toJSON();
}

// Stops this browser's alerts and returns the address the server must forget.
export async function disablePush() {
  const sub = await (await registration())?.pushManager.getSubscription();
  if (!sub) return null;
  const { endpoint } = sub;
  await sub.unsubscribe();
  return endpoint;
}
