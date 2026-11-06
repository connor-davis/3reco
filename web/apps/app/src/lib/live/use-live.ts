import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/use-auth';
import { endSession } from '../api/auth';
import { LiveConnection } from './connection';

/**
 * Keeps one live socket open for the signed-in person and refreshes whatever
 * the server says changed. Call it once, in the app shell. A guest has not
 * finished setup and the server refuses their socket, so they get none.
 */
export function useLiveEvents() {
  const client = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id;
  const live = !!user?.role && user.role !== 'guest';

  useEffect(() => {
    if (!userId || !live) return;
    const connection = new LiveConnection(client, (reason) => {
      void endSession(client, reason);
    });
    connection.start();
    return () => connection.stop();
  }, [client, userId, live]);
}
