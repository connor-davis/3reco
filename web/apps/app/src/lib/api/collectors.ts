import { useResource, useWrite, idPath } from './resource';
import { queryString, type Page, type Paging } from './paging';
import type * as T from './types';

export function useCollectors(params: Paging = {}) {
  return useResource<Page<T.Collector>>(
    ['collectors', params],
    `/collectors${queryString(params)}`,
    [],
    true
  );
}
export function useCollector(id: string) {
  return useResource<T.Collector>(
    ['collectors', id],
    `/collectors/${idPath(id)}`,
    [],
    true,
    !!id
  );
}
export function useCollectorSelection() {
  return useResource<T.Collector[]>(
    ['collectors', 'selection'],
    '/collectors/selection',
    [],
    true
  );
}
export function useCollectorStats(phone: string) {
  return useResource<T.CollectorStats>(
    ['collectors', 'stats', phone],
    `/collectors/stats${queryString({ phone })}`,
    ['transactions:me'],
    true,
    !!phone
  );
}
export function useCreateCollector() {
  return useWrite<T.CollectorInput, T.Created>('/collectors', 'POST', [
    ['collectors'],
  ]);
}
export function useUpdateCollector(id: string) {
  return useWrite<T.CollectorInput, T.Ok>(
    `/collectors/${idPath(id)}`,
    'PATCH',
    [['collectors']]
  );
}
export function useDeleteCollector(id: string) {
  return useWrite<{ confirmation_value: string }, T.Ok>(
    `/collectors/${idPath(id)}`,
    'DELETE',
    [['collectors']]
  );
}
