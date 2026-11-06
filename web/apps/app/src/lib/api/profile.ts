import { useResource, useWrite, idPath } from './resource';
import { queryString, type Page, type Paging } from './paging';
import type * as T from './types';

export function useProfile() {
  return useResource<T.Profile>(['profile'], '/profile', true);
}
export function useOptionalProfile() {
  return useResource<T.PublicUser | null>(
    ['profile', 'optional'],
    '/profile/optional'
  );
}
export function useUser(id: string) {
  return useResource<T.PublicUser>(
    ['users', id],
    `/users/${idPath(id)}`,
    false,
    !!id
  );
}
export function useCollectorUsers(params: Paging = {}) {
  return useResource<Page<T.PublicUser>>(
    ['users', 'collectors', params],
    `/users${queryString({ ...params, role: 'collector' })}`,
    true
  );
}
/** Finishes setup. A guest sends the role they chose; others send nothing. */
export function useFinishSetup() {
  return useWrite<{ role?: 'collector' | 'business' }, T.Ok>(
    '/profile/setup',
    'POST',
    [['profile'], ['auth'], ['stores'], ['users']]
  );
}
export function useUpdateProfile() {
  return useWrite<T.ProfileInput, T.Ok>('/profile', 'PATCH', [
    ['profile'],
    ['auth'],
    ['stores'],
    ['users'],
  ]);
}
