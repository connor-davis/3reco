import { useEffect, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { endSession, readMe, useMe } from '../api/auth';
import { AuthContext } from './context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const me = useMe();
  const client = useQueryClient();

  useEffect(() => {
    // One 401 from some other route can be a cookie that is still arriving.
    // Only /api/auth/me saying "no session" signs the person out.
    const signedOut = () => {
      void readMe()
        .then((user) => (user ? undefined : endSession(client)))
        .catch(() => undefined);
    };
    window.addEventListener('api:unauthorized', signedOut);
    return () => window.removeEventListener('api:unauthorized', signedOut);
  }, [client]);

  return (
    <AuthContext.Provider
      value={{
        user: me.data ?? null,
        isLoading: me.isPending,
        error: me.error,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
