import { useResource, useWrite, idPath } from './resource';
import { queryString, type Page, type Paging } from './paging';
import type * as T from './types';

export function useAdminUsers(params: Paging = {}) {
  return useResource<Page<T.AdminUser>>(
    ['admin', 'users', params],
    `/admin/users${queryString(params)}`,
    true
  );
}
export function useActivity(
  params: Paging & { table?: string; action?: string } = {}
) {
  return useResource<Page<T.ActivityLine>>(
    ['admin', 'activity', params],
    `/admin/activity${queryString(params)}`,
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
export function useSetBusinessVerified() {
  return useWrite<{ id: string; verified: boolean }, T.Ok>(
    ({ id }) => `/admin/users/${idPath(id)}/business-verification`,
    'PUT',
    [['admin'], ['users'], ['collectors']],
    ({ verified }) => ({ verified })
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
