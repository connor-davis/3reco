import { useCanSave } from './favourites';
import { idPath, useResource, useWrite } from './resource';
import type { Created, Ok } from './types';

export interface SavedSearchInput {
  material_id: string;
  min_price: string;
  max_price: string;
}

export interface SavedSearch extends SavedSearchInput {
  id: string;
  material_name: string;
  created_at: string;
}

export function useSavedSearches() {
  return useResource<{ items: SavedSearch[] }>(
    ['saved-searches'],
    '/saved-searches',
    true,
    useCanSave()
  );
}

export function useSaveSearch() {
  return useWrite<SavedSearchInput, Created>('/saved-searches', 'POST', [
    ['saved-searches'],
  ]);
}

export function useDeleteSearch() {
  return useWrite<string, Ok>(
    (id) => `/saved-searches/${idPath(id)}`,
    'DELETE',
    [['saved-searches']],
    () => undefined
  );
}
