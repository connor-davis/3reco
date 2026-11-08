import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/use-auth';
import { endSession, readMe } from '../api/auth';
import { LiveConnection } from './connection';

/** How often a guest's session is rechecked; a guest has no socket to hear removal. */
export const GUEST_RECHECK_MS = 30_000;

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
  const guest = !!userId && !live;

  // A removed guest holds no socket, so ask the server now and then instead.
  useEffect(() => {
    if (!guest) return;
    const timer = setInterval(() => {
      void readMe()
        .then((me) => (me ? undefined : endSession(client, 'ended')))
        .catch(() => undefined);
    }, GUEST_RECHECK_MS);
    return () => clearInterval(timer);
  }, [client, guest]);

  useEffect(() => {
    if (!userId || !live) return;
    const connection = new LiveConnection(client, (reason) => {
      void endSession(client, reason);
    });
    connection.start();
    return () => connection.stop();
  }, [client, userId, live]);
}
