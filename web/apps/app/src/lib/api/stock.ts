import { useResource, useWrite, idPath } from './resource';
import { queryString, type Page, type Paging } from './paging';
import type * as T from './types';

export function useStock(params: Paging = {}) {
  return useResource<Page<T.StockItem>>(
    ['stock', params],
    `/stock${queryString(params)}`,
    ['stock:me'],
    true
  );
}
export function useStockItem(id: string) {
  return useResource<T.StockItem>(
    ['stock', id],
    `/stock/${idPath(id)}`,
    ['stock:me', 'market'],
    false,
    !!id
  );
}
export function useCreateStock() {
  return useWrite<T.StockInput, T.Created>('/stock', 'POST', [
    ['stock'],
    ['listings'],
    ['stores'],
  ]);
}
export function useUpdateStock(id: string) {
  return useWrite<T.StockPatch, T.Ok>(`/stock/${idPath(id)}`, 'PATCH', [
    ['stock'],
    ['listings'],
    ['stores'],
  ]);
}
export function useDeleteStock() {
  return useWrite<string, T.Ok>(
    (id) => `/stock/${idPath(id)}`,
    'DELETE',
    [['stock'], ['listings'], ['stores']],
    () => undefined
  );
}
