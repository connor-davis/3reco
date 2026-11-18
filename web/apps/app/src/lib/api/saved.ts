import { useInfiniteQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/use-auth';
import { api } from './client';
import { useCanSave } from './favourites';
import { nextPage, queryString, type Page } from './paging';
import type { SavedSearch } from './saved-searches';
import type { Listing, Store } from './types';

export type SavedKind = 'listing' | 'search' | 'store';
export type SavedFilter = 'all' | SavedKind;

/** One row of the Saved page. The payload matches `kind`. */
export interface SavedItem {
  kind: SavedKind;
  id: string;
  saved_at: string;
  listing?: Listing;
  search?: SavedSearch;
  store?: Store;
}

export type SavedCounts = Record<SavedKind, number>;

export interface SavedPage extends Page<SavedItem> {
  counts: SavedCounts;
}

/** The caller's saved listings, searches and followed stores, newest first. */
export function useSaved(type: SavedFilter = 'all') {
  const { user } = useAuth();
  const params = { type };
  return useInfiniteQuery({
    queryKey: ['saved', params, user?.id],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api<SavedPage>(`/saved${queryString({ ...params, cursor: pageParam })}`, {
        signal,
      }),
    getNextPageParam: nextPage,
    // A refusal (4xx) will not change on a retry; only server trouble does.
    retry: (count: number, error: Error) =>
      count < 2 && !('status' in error && Number(error.status) < 500),
    enabled: useCanSave() && !!user,
  });
}
