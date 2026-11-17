import { useAuth } from '@/lib/auth/use-auth';
import { keysFor } from '@/lib/live/connection';
import { idPath, useResource, useWrite } from './resource';
import type { Ok } from './types';

export interface Block {
  id: string;
  party_id: string;
  name: string;
}

export function useBlocks() {
  const { user } = useAuth();
  return useResource<{ items: Block[] }>(
    ['blocks', user?.active_business_id],
    '/blocks',
    true,
    !!user?.active_business_id
  );
}

export function useBlock() {
  return useWrite<string, Ok>(
    (id) => `/blocks/${idPath(id)}`,
    'PUT',
    keysFor('block'),
    () => undefined
  );
}

export function useUnblock() {
  return useWrite<string, Ok>(
    (id) => `/blocks/${idPath(id)}`,
    'DELETE',
    keysFor('block'),
    () => undefined
  );
}
