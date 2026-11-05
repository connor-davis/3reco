import { useEffect, useState } from 'react';
import {
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { useAuth } from '../auth/use-auth';

import { LiveConnection, type Status } from './connection';

const connections = new WeakMap<
  QueryClient,
  { user: string; live: LiveConnection }
>();

export function useLive(topic: string | undefined, keys: readonly QueryKey[]) {
  return useLiveTopics(topic ? [topic] : [], keys);
}

export function useLiveTopics(topics: string[], keys: readonly QueryKey[]) {
  const client = useQueryClient();
  const { user } = useAuth();
  const [status, setStatus] = useState<Status>('disconnected');
  // Stable serialisation avoids re-subscribing when a caller passes an array literal.
  const encodedKeys = JSON.stringify(keys);
  const encodedTopics = JSON.stringify(topics);

  useEffect(() => {
    const topicList = JSON.parse(encodedTopics) as string[];
    if (!user || !topicList.length) return;
    let connection = connections.get(client);
    if (!connection || connection.user !== user.id) {
      connection?.live.stop();
      connection = { user: user.id, live: new LiveConnection(client) };
      connections.set(client, connection);
    }
    const releases = topicList.map((topic) =>
      connection.live.subscribe(topic, {
        keys: JSON.parse(encodedKeys) as QueryKey[],
        status: setStatus,
      })
    );
    return () => {
      for (const release of releases) release();
    };
  }, [client, user, encodedTopics, encodedKeys]);

  return status;
}
