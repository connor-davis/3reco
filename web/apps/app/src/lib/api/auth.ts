import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { api, ApiError, json } from './client';
import type { AuthUser, Ok, Session } from './types';

export const authKey = ['auth', 'me'] as const;

export async function replaceSession(
  client: QueryClient,
  user: AuthUser | null
) {
  await client.cancelQueries();
  client.removeQueries({
    predicate: (query) =>
      query.queryKey[0] !== 'auth' || query.queryKey[1] !== 'me',
  });
  client.setQueryData(authKey, user);
}

/** Drops the signed-in person and every private cache, then shows sign-in. */
export async function endSession(
  client: QueryClient,
  reason?: 'ended' | 'removed'
) {
  await replaceSession(client, null);

  if (!window.location.pathname.endsWith('/sign-in'))
    window.location.assign(reason ? `/sign-in?reason=${reason}` : '/sign-in');
}

export async function readMe(signal?: AbortSignal): Promise<AuthUser | null> {
  try {
    return (await api<{ user: AuthUser }>('/auth/me', { signal })).user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export function useMe() {
  return useQuery({
    queryKey: authKey,
    queryFn: ({ signal }) => readMe(signal),
    retry: false,
  });
}

export function useSessions() {
  const me = useMe();
  return useQuery({
    queryKey: ['auth', 'sessions'],
    queryFn: ({ signal }) =>
      api<{ sessions: Session[] }>('/auth/sessions', { signal }),
    enabled: !!me.data,
  });
}

function useAuthMutation<Input, Output>(
  path: string | ((input: Input) => string),
  method = 'POST',
  body: (input: Input) => unknown = (input) => input
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Input) =>
      api<Output>(
        typeof path === 'function' ? path(input) : path,
        json(method, body(input))
      ),
    onSuccess: async () => {
      // Read the new cookie before publishing the account change. A temporary
      // signed-out state would send a valid dashboard session back to sign-in.
      const user = await readMe();
      await replaceSession(client, user);
    },
  });
}

export function useSignIn() {
  return useAuthMutation<
    { email: string; password: string },
    { user: AuthUser }
  >('/auth/sign-in');
}
export function useSignOut() {
  return useAuthMutation<void, Ok>('/auth/sign-out');
}
export function useSwitchSession() {
  return useAuthMutation<string, Ok>(
    (id) => `/auth/sessions/${encodeURIComponent(id)}/switch`,
    'POST',
    () => undefined
  );
}
export function useRevokeSession() {
  return useAuthMutation<string, Ok>(
    (id) => `/auth/sessions/${encodeURIComponent(id)}`,
    'DELETE',
    () => undefined
  );
}
export function useSignOutAll() {
  return useAuthMutation<void, Ok>('/auth/sessions/sign-out-all');
}
export function useRevokeOtherSessions() {
  return useAuthMutation<void, Ok>('/auth/sessions/revoke-others');
}

export function useSignUp() {
  return useMutation({
    mutationFn: (input: {
      name: string;
      email: string;
      password: string;
      accepted_terms_version: string;
    }) => api<Ok>('/auth/sign-up', json('POST', input)),
  });
}
export function useSendVerification() {
  return useMutation({
    mutationFn: (email: string) =>
      api<Ok>('/auth/verify-email/send', json('POST', { email })),
  });
}
export function useVerifyEmail() {
  return useMutation({
    mutationFn: (token: string) =>
      api<Ok>('/auth/verify-email', json('POST', { token })),
  });
}
export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) =>
      api<Ok>('/auth/forgot-password', json('POST', { email })),
  });
}
export function useResetPassword() {
  return useAuthMutation<{ token: string; password: string }, Ok>(
    '/auth/reset-password'
  );
}
