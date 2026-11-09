import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/use-auth';
import { endSession, readMe } from '../api/auth';
import { LiveConnection } from './connection';

/**
 * Keeps one live socket open for the signed-in person and refreshes whatever
 * the server says changed. Call it once, in the app shell. A guest's socket
 * hears only about their own account, so a new role shows without a reload.
 */
export function useLiveEvents() {
  const client = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    const connection = new LiveConnection(
      client,
      (reason) => {
        void endSession(client, reason);
      },
      () => readMe().then(Boolean)
    );
    connection.start();
    return () => connection.stop();
  }, [client, userId]);
}
