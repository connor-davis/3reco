import type { QueryClient, QueryKey } from '@tanstack/react-query';

export type Status = 'connecting' | 'connected' | 'denied' | 'disconnected';
type Listener = { keys: readonly QueryKey[]; status: (status: Status) => void };

// Each query client has one active connection for its current account.
export class LiveConnection {
  private socket?: WebSocket;
  private timer?: ReturnType<typeof setTimeout>;
  private attempts = 0;
  private hasConnected = false;
  private stopped = false;
  private topics = new Map<string, Set<Listener>>();
  private denied = new Set<string>();
  private client: QueryClient;

  constructor(client: QueryClient) {
    this.client = client;
  }

  private send(type: string, topic: string) {
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify({ type, topic }));
  }

  subscribe(topic: string, listener: Listener) {
    const listeners = this.topics.get(topic) ?? new Set<Listener>();
    const first = listeners.size === 0;
    listeners.add(listener);
    this.topics.set(topic, listeners);
    if (first && this.socket?.readyState === WebSocket.OPEN)
      this.send('subscribe', topic);
    listener.status(
      this.denied.has(topic)
        ? 'denied'
        : this.socket?.readyState === WebSocket.OPEN
          ? 'connected'
          : 'connecting'
    );
    if (!this.socket && !this.timer) this.connect();

    return () => {
      listeners.delete(listener);
      if (!listeners.size) {
        this.send('unsubscribe', topic);
        this.topics.delete(topic);
        this.denied.delete(topic);
      }
      if (!this.topics.size) this.stop();
    };
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
      this.denied.clear();
      for (const [topic, listeners] of this.topics) {
        this.send('subscribe', topic);
        for (const listener of listeners) listener.status('connected');
      }
      // Only a reconnect needs to recover events lost while disconnected.
      if (this.hasConnected) void this.client.invalidateQueries();
      this.hasConnected = true;
    };
    socket.onmessage = (event) => {
      let message: { type?: string; topic?: string };
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (message.type === 'resync') {
        void this.client.invalidateQueries();
        return;
      }
      if (!message.topic) return;
      const listeners = this.topics.get(message.topic);
      if (message.type === 'denied') {
        this.denied.add(message.topic);
        this.send('unsubscribe', message.topic);
        for (const listener of listeners ?? []) listener.status('denied');
      } else if (
        message.type === 'changed' &&
        !this.denied.has(message.topic)
      ) {
        // Several mounted consumers can share one query and topic.
        const keys = new Map<string, QueryKey>();
        for (const listener of listeners ?? []) {
          for (const key of listener.keys) keys.set(JSON.stringify(key), key);
        }
        for (const key of keys.values())
          void this.client.invalidateQueries({ queryKey: key });
      }
    };
    socket.onerror = () => socket.close();
    socket.onclose = () => {
      if (this.stopped) return;
      this.socket = undefined;
      for (const listeners of this.topics.values()) {
        for (const listener of listeners) listener.status('disconnected');
      }
      const delay =
        Math.min(30000, 1000 * 2 ** this.attempts++) + Math.random() * 250;
      this.timer = setTimeout(() => this.connect(), delay);
    };
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
      this.socket = undefined;
    }
  }
}
