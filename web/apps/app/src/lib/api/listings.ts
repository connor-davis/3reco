import { useResource, idPath } from './resource';
import { queryString, type Page, type Paging } from './paging';
import type * as T from './types';

export interface ListingFilters extends Paging {
  q?: string;
  seller_id?: string;
  material_id?: string;
}
export function useListings(params: ListingFilters = {}) {
  return useResource<Page<T.Listing>>(
    ['listings', params],
    `/market/listings${queryString(params)}`
  );
}
export function useListing(id: string) {
  return useResource<T.Listing>(
    ['listings', id],
    `/market/listings/${idPath(id)}`,
    false,
    !!id
  );
}
export function useStoreListings(id: string, params: Paging = {}) {
  return useResource<Page<T.Listing>>(
    ['listings', 'store', id, params],
    `/stores/${idPath(id)}/listings${queryString(params)}`,
    false,
    !!id
  );
}
