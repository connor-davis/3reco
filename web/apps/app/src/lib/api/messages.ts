import { useResource, useWrite, idPath } from './resource';
import { queryString, type Page, type Paging } from './paging';
import type * as T from './types';
import { useLiveTopics } from '../live/use-live';

export function useMessages(id: string, params: Paging = {}) {
  return useResource<Page<T.Message>>(
    ['messages', id, params],
    `/requests/${idPath(id)}/messages${queryString(params)}`,
    [`request:${id}`],
    true,
    !!id
  );
}
export function useInbox(params: Paging = {}) {
  const query = useResource<Page<T.Thread>>(
    ['messages', 'inbox', params],
    `/messages/inbox${queryString(params)}`,
    ['requests:me'],
    true
  );
  useLiveTopics(
    query.data?.items.map((thread) => `request:${thread.request_id}`) ?? [],
    [['messages', 'inbox']]
  );
  return query;
}
export function useSendMessage(id: string) {
  return useWrite<{ content: string }, T.Created & { created_at: string }>(
    `/requests/${idPath(id)}/messages`,
    'POST',
    [['messages'], ['notifications']]
  );
}
export function useReadMessages(id: string) {
  return useWrite<void, T.Ok>(`/requests/${idPath(id)}/messages/read`, 'POST', [
    ['messages'],
  ]);
}
