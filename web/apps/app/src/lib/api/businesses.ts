import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import { useAuthMutation, useMe } from './auth';
import type { AuthUser, BusinessRole } from './types';

export interface Workspace {
  id: string;
  name: string;
  role: BusinessRole;
  has_logo: boolean;
}

export function useMyBusinesses() {
  const me = useMe();
  return useQuery({
    queryKey: ['businesses', 'mine'],
    queryFn: ({ signal }) => api<Workspace[]>('/businesses/mine', { signal }),
    enabled: me.data?.role === 'business',
  });
}

export function useSelectBusiness() {
  return useAuthMutation<string, { user: AuthUser }>(
    (id) => `/businesses/${encodeURIComponent(id)}/select`,
    'POST',
    () => undefined
  );
}
