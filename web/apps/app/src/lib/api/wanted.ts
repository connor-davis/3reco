import { idPath, useResource, useWrite } from './resource';
import { queryString, type Page } from './paging';
import type { Created, Ok, Party } from './types';

/** A wanted post. The buyer is never in it: sellers see only these fields. */
export interface WantedPost {
  id: string;
  material_id: string;
  material_name: string;
  weight: string;
  max_price: string | null;
  area: string;
  status: 'open' | 'filled' | 'closed' | 'expired';
  expires_at: string;
  created_at: string;
  /** On the buyer's own list: replies still alive or won. */
  reply_count: number;
  /** On the seller's list: their own reply, once they made one. */
  my_request_id: string | null;
}

export interface WantedInput {
  material_id: string;
  weight: string;
  max_price: string;
  area: string;
  days: number;
}

export interface WantedReply {
  request_id: string;
  seller: Party;
  status: string;
  created_at: string;
}

export interface ReplyInput {
  id: string;
  weight: string;
  price: string;
  material_id: string;
}

/** The buyer's own posts. */
export function useMyWanted() {
  return useResource<Page<WantedPost>>(
    ['wanted', 'mine'],
    '/wanted/mine',
    true
  );
}

/** Open posts from other businesses. Only verified businesses may ask. */
export function useWantedBrowse(
  params: { material_id?: string; cursor?: string },
  enabled: boolean
) {
  return useResource<Page<WantedPost>>(
    ['wanted', 'browse', params],
    `/wanted${queryString(params)}`,
    true,
    enabled
  );
}

export function useWantedReplies(id: string, enabled: boolean) {
  return useResource<{ items: WantedReply[] }>(
    ['wanted', 'replies', id],
    `/wanted/${idPath(id)}/replies`,
    true,
    enabled
  );
}

export function useCreateWanted() {
  return useWrite<WantedInput, Created>('/wanted', 'POST', [['wanted']]);
}

export function useCloseWanted() {
  return useWrite<string, Ok>(
    (id) => `/wanted/${idPath(id)}/close`,
    'POST',
    [['wanted'], ['requests']],
    () => undefined
  );
}

export function useReplyToWanted() {
  return useWrite<ReplyInput, Created>(
    (input) => `/wanted/${idPath(input.id)}/replies`,
    'POST',
    [['wanted'], ['requests']],
    (input) => ({
      items: [
        {
          material_id: input.material_id,
          weight: input.weight,
          price: input.price,
        },
      ],
    })
  );
}
