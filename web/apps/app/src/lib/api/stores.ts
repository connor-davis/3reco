import { useResource, idPath } from './resource';
import { queryString, type Page, type Paging } from './paging';
import type * as T from './types';

export function useStores(params: Paging & { q?: string } = {}) {
  return useResource<Page<T.Store>>(
    ['stores', params],
    `/stores${queryString(params)}`,
    ['market']
  );
}
export function useStore(id: string) {
  return useResource<T.Store>(
    ['stores', id],
    `/stores/${idPath(id)}`,
    ['market'],
    false,
    !!id
  );
}
