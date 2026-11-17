import { useResource, useWrite } from './resource';
import type { Ok } from './types';

export interface PushKey {
  enabled: boolean;
  public_key: string;
}

export function usePushKey() {
  return useResource<PushKey>(['push-key'], '/push/key', true);
}

export function useSubscribePush() {
  return useWrite<PushSubscriptionJSON, Ok>('/push/subscriptions', 'POST', []);
}

export function useUnsubscribePush() {
  return useWrite<string, Ok>('/push/unsubscribe', 'POST', [], (endpoint) => ({
    endpoint,
  }));
}
