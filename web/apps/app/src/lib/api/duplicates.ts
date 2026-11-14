import { useResource, useWrite, idPath } from './resource';
import type { Transaction, Ok } from './types';

export interface DuplicateGroup {
  kind: 'exact' | 'possible';
  original_id: string;
  trades: Transaction[];
}
export interface DuplicateReview {
  groups: DuplicateGroup[];
  marked: Transaction[];
}

const changed = [
  ['admin'],
  ['transactions'],
  ['stock'],
  ['dashboards'],
  ['stats'],
  ['collectors'],
];

export function useDuplicates() {
  return useResource<DuplicateReview>(
    ['admin', 'duplicates'],
    '/admin/duplicates',
    true
  );
}
export function useMarkDuplicate() {
  return useWrite<{ id: string; original_id: string }, Ok>(
    ({ id }) => `/admin/duplicates/${idPath(id)}/mark`,
    'POST',
    changed,
    ({ original_id }) => ({ original_id })
  );
}
export function useUndoDuplicate() {
  return useWrite<string, Ok>(
    (id) => `/admin/duplicates/${idPath(id)}/undo`,
    'POST',
    changed,
    () => ({})
  );
}
export function useDismissDuplicates() {
  return useWrite<{ ids: string[] }, Ok>('/admin/duplicates/dismiss', 'POST', [
    ['admin'],
  ]);
}
