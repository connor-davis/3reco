import { useResource, useWrite, idPath } from './resource';
import type { Transaction, Ok } from './types';

export interface DuplicateTrade extends Transaction {
  /** Per line, in order: another trade in the group has the same line. */
  shared_lines: boolean[];
  /** Another trade in the group has exactly the same lines. */
  exact_copy: boolean;
  /** The trade this one can be deleted as a copy of; empty when it cannot. */
  contained_in: string;
}
export interface DuplicateGroup {
  original_id: string;
  trades: DuplicateTrade[];
}
export interface DuplicateReview {
  groups: DuplicateGroup[];
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
export function useDeleteDuplicate() {
  return useWrite<{ id: string; original_id: string }, Ok>(
    ({ id }) => `/admin/duplicates/${idPath(id)}/delete`,
    'POST',
    changed,
    ({ original_id }) => ({ original_id })
  );
}
export function useDismissDuplicates() {
  return useWrite<{ ids: string[] }, Ok>('/admin/duplicates/dismiss', 'POST', [
    ['admin'],
  ]);
}
