import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import {
  usePushKey,
  useSubscribePush,
  useUnsubscribePush,
} from '@/lib/api/push';
import {
  alertState,
  disablePush,
  enablePush,
  isSubscribed,
  permission,
  pushSupported,
  type AlertState,
} from '@/lib/push/browser';

// Plain words for every state the switch can be in.
export const alertText: Record<AlertState, string> = {
  unsupported:
    'This browser cannot show phone alerts. Try Chrome, Edge or Firefox, or add 3REco to your home screen.',
  'server-off': 'Phone alerts are not switched on for 3REco yet.',
  denied:
    'Alerts are blocked in this browser. Allow notifications for 3REco in the browser settings, then come back.',
  on: 'On. You get the same alerts as the bell, even when 3REco is closed.',
  off: 'Off. Switch on to get the same alerts as the bell, even when 3REco is closed.',
};

export function PhoneAlerts() {
  const key = usePushKey();
  const subscribe = useSubscribePush();
  const unsubscribe = useUnsubscribePush();
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [perm, setPerm] = useState(permission());

  useEffect(() => {
    void isSubscribed().then(setSubscribed, () => setSubscribed(false));
  }, []);

  const state = alertState({
    supported: pushSupported(),
    serverEnabled: key.data?.enabled ?? false,
    permission: perm,
    subscribed,
  });
  const usable = state === 'on' || state === 'off';

  async function change(on: boolean) {
    setBusy(true);
    try {
      if (on) {
        const sub = await enablePush(key.data?.public_key ?? '');
        setPerm(permission());
        if (!sub) return;
        await subscribe.mutateAsync(sub);
        setSubscribed(true);
        toast.success('Phone alerts are on.');
      } else {
        const endpoint = await disablePush();
        if (endpoint) await unsubscribe.mutateAsync(endpoint);
        setSubscribed(false);
        toast.success('Phone alerts are off.');
      }
    } catch {
      toast.error('Could not change phone alerts. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <label htmlFor="phone-alerts" className="text-sm font-medium">
          Phone alerts
        </label>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {key.isPending ? 'Checking…' : alertText[state]}
        </p>
      </div>
      <Switch
        id="phone-alerts"
        checked={state === 'on'}
        disabled={!usable || busy}
        onCheckedChange={(on) => void change(on)}
      />
    </div>
  );
}
