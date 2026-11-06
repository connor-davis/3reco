import { useResource, useWrite, idPath } from './resource';
import { queryString, type Page, type Paging } from './paging';
import type * as T from './types';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/use-auth';
import { api } from './client';

// Start with recent messages; the next cursor reaches older history on demand.
export function useMessageHistory(id: string) {
  const { user } = useAuth();
  return useInfiniteQuery({
    queryKey: ['messages', 'history', id, user?.id],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api<Page<T.Message>>(
        `/requests/${idPath(id)}/messages${queryString({ cursor: pageParam, limit: 30 })}`,
        { signal }
      ),
    getNextPageParam: (page) =>
      page.has_more ? (page.next_cursor ?? undefined) : undefined,
    enabled: !!id && !!user,
  });
}
export function useThreadHistory(q = '', filter = 'all') {
  const { user } = useAuth();
  const admin = user?.role === 'admin';
  const query = useInfiniteQuery({
    queryKey: ['messages', 'inbox', 'history', user?.id, admin, q, filter],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }): Promise<Page<T.Thread>> => {
      const params = queryString({ cursor: pageParam, limit: 30, q, filter });
      if (!admin) return api(`/messages/inbox${params}`, { signal });

      const page = await api<Page<T.AdminThread>>(`/messages/all${params}`, {
        signal,
      });
      return {
        ...page,
        items: page.items.map((thread) => ({
          ...thread,
          other: {
            id: thread.request_id,
            name: `${thread.buyer.name} ↔ ${thread.seller.name}`,
          },
          unread_count: 0,
        })),
      };
    },
    getNextPageParam: (page) =>
      page.has_more ? (page.next_cursor ?? undefined) : undefined,
    enabled: !!user,
  });
  return query;
}

export function useMessages(id: string, params: Paging = {}) {
  return useResource<Page<T.Message>>(
    ['messages', id, params],
    `/requests/${idPath(id)}/messages${queryString(params)}`,
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
