import { useCanSave } from './favourites';
import { idPath, useResource, useWrite } from './resource';
import type { Created, Ok } from './types';

export interface QuickReply {
  id: string;
  body: string;
  created_at: string;
}

// The list is one per person and loads when a chat opens and after each
// change. It has no live events and no polling.
export function useQuickReplies() {
  return useResource<{ items: QuickReply[] }>(
    ['quick-replies'],
    '/quick-replies',
    true,
    useCanSave()
  );
}

export function useCreateQuickReply() {
  return useWrite<string, Created>(
    '/quick-replies',
    'POST',
    [['quick-replies']],
    (body) => ({ body })
  );
}

export function useUpdateQuickReply() {
  return useWrite<{ id: string; body: string }, Ok>(
    ({ id }) => `/quick-replies/${idPath(id)}`,
    'PATCH',
    [['quick-replies']],
    ({ body }) => ({ body })
  );
}

export function useDeleteQuickReply() {
  return useWrite<string, Ok>(
    (id) => `/quick-replies/${idPath(id)}`,
    'DELETE',
    [['quick-replies']],
    () => undefined
  );
}
