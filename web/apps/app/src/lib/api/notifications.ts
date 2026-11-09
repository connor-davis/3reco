import { useResource, useWrite, idPath } from './resource';
import { queryString, type Page, type Paging } from './paging';
import type * as T from './types';
import { useAuth } from '../auth/use-auth';

export function useNotifications(params: Paging = {}) {
  return useResource<Page<T.Notification>>(
    ['notifications', params],
    `/notifications/${queryString(params)}`,
    true
  );
}
export function useUnreadCount() {
  const { user } = useAuth();
  return useResource<{ count: number }>(
    ['notifications', 'unread-count'],
    '/notifications/unread-count',
    true,
    !!user && user.role !== 'guest'
  );
}
export function useReadNotification() {
  return useWrite<string, T.Ok>(
    (id) => `/notifications/${idPath(id)}/read`,
    'PATCH',
    [['notifications']],
    () => undefined
  );
}
export function useReadAllNotifications() {
  return useWrite<void, T.Ok>('/notifications/read-all', 'POST', [
    ['notifications'],
  ]);
}
export function useDismissNotification() {
  return useWrite<string, T.Ok>(
    (id) => `/notifications/${idPath(id)}`,
    'DELETE',
    [['notifications']],
    () => undefined
  );
}
export function useDismissAllNotifications() {
  return useWrite<void, T.Ok>('/notifications/', 'DELETE', [['notifications']]);
}
