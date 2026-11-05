import { useEffect, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { replaceSession, useMe } from '../api/auth';
import { AuthContext } from './context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const me = useMe();
  const client = useQueryClient();

  useEffect(() => {
    const signedOut = () => {
      void replaceSession(client, null).then(() => {
        if (!window.location.pathname.endsWith('/sign-in'))
          window.location.assign('/sign-in');
      });
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
