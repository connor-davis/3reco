import { useResource, idPath } from './resource';
import { queryString, type Page, type Paging } from './paging';
import type * as T from './types';

export interface ListingFilters extends Paging {
  q?: string;
  seller_id?: string;
  material_id?: string;
  /** Exact R/kg decimals, both ends included. */
  min_price?: string;
  max_price?: string;
  /** One of 10, 25, 50, 100. */
  max_km?: number;
}
export function useListings(
  params: ListingFilters = {},
  enabled = true,
  options: { keepPrevious?: boolean } = {}
) {
  return useResource<Page<T.Listing>>(
    ['listings', params],
    `/market/listings${queryString(params)}`,
    false,
    enabled,
    options
  );
}
export function useListing(id: string) {
  return useResource<T.Listing & { held_weight: string }>(
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
/** Whether the distance filter works, and if the caller has a point to start from. */
export function useDistanceStatus() {
  return useResource<{ enabled: boolean; has_origin: boolean }>(
    ['listings', 'distance'],
    '/market/distance'
  );
}
