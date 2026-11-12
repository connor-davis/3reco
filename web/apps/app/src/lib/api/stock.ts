import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, upload } from './client';
import { useResource, useWrite, idPath } from './resource';
import { queryString, type Page, type Paging } from './paging';
import type * as T from './types';

export function useStock(params: Paging = {}) {
  return useResource<Page<T.StockItem>>(
    ['stock', params],
    `/stock${queryString(params)}`,
    true
  );
}
export function useStockItem(id: string) {
  return useResource<T.StockItem>(
    ['stock', id],
    `/stock/${idPath(id)}`,
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

export function useUploadStockImage(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (file: File) =>
      api<T.StockItem>(`/stock/${idPath(id)}/image`, upload(file)),
    onSuccess: async () => {
      await Promise.all(
        ['stock', 'listings', 'stores'].map((key) =>
          client.invalidateQueries({ queryKey: [key] })
        )
      );
    },
  });
}
export function useDeleteStockImage(id: string) {
  return useWrite<void, T.StockItem>(`/stock/${idPath(id)}/image`, 'DELETE', [
    ['stock'],
    ['listings'],
    ['stores'],
  ]);
}
