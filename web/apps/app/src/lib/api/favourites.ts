import { useAuth } from '../auth/use-auth';
import { useResource, useWrite, idPath } from './resource';
import { queryString, type Page, type Paging } from './paging';
import type * as T from './types';

/** Who may save and follow: any signed-in person who has finished setup. */
export function useCanSave() {
  const { user } = useAuth();
  return !!user && user.role !== 'guest';
}

export function useFavouriteIds() {
  return useResource<{ ids: string[] }>(
    ['favourites', 'ids'],
    '/favourites/ids',
    true,
    useCanSave()
  );
}
export function useFavouriteListings(params: Paging = {}) {
  return useResource<Page<T.Listing>>(
    ['favourites', 'list', params],
    `/favourites/${queryString(params)}`,
    true,
    useCanSave()
  );
}
export function useSaveListing() {
  return useWrite<string, T.Ok>(
    (id) => `/favourites/${idPath(id)}`,
    'PUT',
    [['favourites'], ['saved']],
    () => undefined
  );
}
export function useUnsaveListing() {
  return useWrite<string, T.Ok>(
    (id) => `/favourites/${idPath(id)}`,
    'DELETE',
    [['favourites'], ['saved']],
    () => undefined
  );
}

export function useFollowIds() {
  return useResource<{ ids: string[] }>(
    ['follows', 'ids'],
    '/follows/ids',
    true,
    useCanSave()
  );
}
export function useFollowedStores(params: Paging = {}) {
  return useResource<Page<T.Store>>(
    ['follows', 'list', params],
    `/follows/${queryString(params)}`,
    true,
    useCanSave()
  );
}
export function useFollowStore() {
  return useWrite<string, T.Ok>(
    (id) => `/follows/${idPath(id)}`,
    'PUT',
    [['follows'], ['saved']],
    () => undefined
  );
}
export function useUnfollowStore() {
  return useWrite<string, T.Ok>(
    (id) => `/follows/${idPath(id)}`,
    'DELETE',
    [['follows'], ['saved']],
    () => undefined
  );
}
