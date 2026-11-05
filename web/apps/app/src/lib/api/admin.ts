import { useResource, useWrite, idPath } from './resource';
import { queryString, type Page, type Paging } from './paging';
import type * as T from './types';

export function useAdminUsers(params: Paging = {}) {
  return useResource<Page<T.AdminUser>>(
    ['admin', 'users', params],
    `/admin/users${queryString(params)}`,
    ['admin:users'],
    true
  );
}
export function usePrivacyEvents(params: Paging = {}) {
  return useResource<Page<T.PrivacyEvent>>(
    ['admin', 'privacy-events', params],
    `/admin/privacy-events${queryString(params)}`,
    [],
    true
  );
}
export function useSetUserRole(id: string) {
  return useWrite<{ role: T.Role }, T.Ok>(
    `/admin/users/${idPath(id)}/role`,
    'PATCH',
    [['admin'], ['users']]
  );
}
export function useDeleteUser() {
  return useWrite<string, T.Ok>(
    (id) => `/admin/users/${idPath(id)}`,
    'DELETE',
    [['admin'], ['users'], ['stores'], ['stats']],
    () => undefined
  );
}
