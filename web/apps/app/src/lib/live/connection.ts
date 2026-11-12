import type { QueryClient, QueryKey } from '@tanstack/react-query';

// The close code the server sends when a sign-in ended (see the Go hub).
export const sessionEndedCode = 4401;
export const accountRemovedReason = 'account-removed';

// A burst of events for one key (a chat flurry) refetches it once.
const settleMs = 300;

/**
 * The query keys a change of this kind may have made stale. An id adds the
 * one detail query that names it. The server already decided this person may
 * hear the event; the refetch goes through the normal checked routes.
 */
export function keysFor(kind: string, id?: string): QueryKey[] {
  switch (kind) {
    case 'notification':
      return [['notifications']];
    case 'stock':
      return [['stock']];
    case 'listing':
      return [
        ['listings'],
        ['stores'],
        ['reviews'],
        ['cart'],
        ...(id ? [['stock', id]] : []),
      ];
    case 'cart':
      return [['cart']];
    case 'request':
      return [
        ['requests', 'incoming'],
        ['requests', 'outgoing'],
        ['messages', 'inbox'],
        ['dashboards'],
        ...(id
          ? [
              ['requests', id],
              ['messages', id],
              ['messages', 'history', id],
            ]
          : []),
      ];
    case 'transaction':
      return [
        ['transactions'],
        ['dashboards'],
        ['stats'],
        ['collectors'],
        ['reviews'],
      ];
    case 'user':
      return [
        ['admin'],
        ['users'],
        ['dashboards'],
        ['stores'],
        ['auth'],
        ['collectors'],
      ];
    case 'material':
      return [['materials'], ['listings'], ['stats']];
    case 'collector':
      return [['collectors']];
    case 'review':
      return [['reviews']];
    default:
      return [];
  }
}

// One socket per signed-in tab. It joins as the signed-in person, subscribes
// to nothing, and turns each {kind, id} event into query invalidations.
export class LiveConnection {
  private socket?: WebSocket;
  private timer?: ReturnType<typeof setTimeout>;
  private attempts = 0;
  private hasConnected = false;
  private stopped = false;
  private pending = new Map<string, ReturnType<typeof setTimeout>>();
  private client: QueryClient;
  private onEnded?: (reason: 'ended' | 'removed') => void;
  private stillSignedIn?: () => Promise<boolean>;

  // onEnded runs when the server says this sign-in is over. stillSignedIn is
  // asked when the socket drops without that word, so a sign-in that ended
  // while the page was cut off is noticed now, not after the next reconnect.
  constructor(
    client: QueryClient,
    onEnded?: (reason: 'ended' | 'removed') => void,
    stillSignedIn?: () => Promise<boolean>
  ) {
    this.client = client;
    this.onEnded = onEnded;
    this.stillSignedIn = stillSignedIn;
  }

  start() {
    if (!this.socket && !this.timer) this.connect();
  }

  private invalidateAll() {
    for (const timer of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
    void this.client.invalidateQueries();
  }

  private invalidate(key: QueryKey) {
    const name = JSON.stringify(key);
    if (this.pending.has(name)) return;
    this.pending.set(
      name,
      setTimeout(() => {
        this.pending.delete(name);
        void this.client.invalidateQueries({ queryKey: key });
      }, settleMs)
    );
  }

  private connect() {
    this.timer = undefined;
    this.stopped = false;
    const url = new URL('/api/live', window.location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(url);
    this.socket = socket;

    socket.onopen = () => {
      this.attempts = 0;
      // Only a reconnect needs to recover events lost while disconnected.
      if (this.hasConnected) this.invalidateAll();
      this.hasConnected = true;
    };
    socket.onmessage = (event) => {
      let message: { type?: string; kind?: string; id?: string };
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (message.type === 'resync') {
        this.invalidateAll();
      } else if (message.type === 'changed' && message.kind) {
        for (const key of keysFor(message.kind, message.id))
          this.invalidate(key);
      }
    };
    socket.onerror = () => socket.close();
    socket.onclose = (event) => {
      if (this.stopped) return;
      this.socket = undefined;

      // The server closes with this code for an ended, removed or guest
      // session. Reconnecting would only be refused, so sign out instead.
      if (event.code === sessionEndedCode) {
        this.stop();
        this.onEnded?.(
          event.reason === accountRemovedReason ? 'removed' : 'ended'
        );
        return;
      }

      void this.stillSignedIn?.()
        .then((signedIn) => {
          if (signedIn || this.stopped) return;
          this.stop();
          this.onEnded?.('ended');
        })
        .catch(() => undefined);

      const delay =
        Math.min(30000, 1000 * 2 ** this.attempts++) + Math.random() * 250;
      this.timer = setTimeout(() => this.connect(), delay);
    };
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = undefined;
    for (const timer of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
      this.socket = undefined;
    }
  }
}
