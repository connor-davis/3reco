import { useResource, useWrite, idPath } from './resource';
import { queryString, type Page, type Paging } from './paging';
import type * as T from './types';
import { useLiveTopics } from '../live/use-live';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/use-auth';
import { api } from './client';

// Message cursors move forward from the oldest message. Keep every page so
// live invalidation can reach the newest messages without losing history.
export function useMessageHistory(id: string) {
  const { user } = useAuth();
  useLiveTopics(id ? [`request:${id}`] : [], [['messages', 'history', id]]);
  return useInfiniteQuery({
    queryKey: ['messages', 'history', id, user?.id],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api<Page<T.Message>>(
        `/requests/${idPath(id)}/messages${queryString({ cursor: pageParam, limit: 100 })}`,
        { signal }
      ),
    getNextPageParam: (page) =>
      page.has_more ? (page.next_cursor ?? undefined) : undefined,
    enabled: !!id && !!user,
  });
}
export function useThreadHistory() {
  const { user } = useAuth();
  const query = useInfiniteQuery({
    queryKey: ['messages', 'inbox', 'history', user?.id],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api<Page<T.Thread>>(
        `/messages/inbox${queryString({ cursor: pageParam, limit: 100 })}`,
        { signal }
      ),
    getNextPageParam: (page) =>
      page.has_more ? (page.next_cursor ?? undefined) : undefined,
    enabled: !!user,
  });
  useLiveTopics(
    user
      ? [
          `requests:${user.id}`,
          ...(query.data?.pages.flatMap((page) =>
            page.items.map((thread) => `request:${thread.request_id}`)
          ) ?? []),
        ]
      : [],
    [['messages', 'inbox']]
  );
  return query;
}

export function useMessages(id: string, params: Paging = {}) {
  return useResource<Page<T.Message>>(
    ['messages', id, params],
    `/requests/${idPath(id)}/messages${queryString(params)}`,
    [`request:${id}`],
    true,
    !!id
  );
}
// Badges and previews read the same first page as the paged inbox list.
export function useInbox(params: Pick<Paging, 'limit'> = {}) {
  const query = useThreadHistory();
  const page = query.data?.pages[0];
  return {
    ...query,
    data: page
      ? { ...page, items: page.items.slice(0, params.limit ?? 100) }
      : undefined,
  };
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
    ['messages', 'inbox'],
  ]);
}
