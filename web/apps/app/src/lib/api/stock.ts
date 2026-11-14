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

const photoKeys = [['stock'], ['listings'], ['stores']] as const;

/** Adds one photo to a stock line; the id comes with the call so it also works right after create. */
export function useAddStockPhoto() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) =>
      api<T.StockItem>(`/stock/${idPath(id)}/photos`, upload(file)),
    onSuccess: async () => {
      await Promise.all(
        photoKeys.map((queryKey) => client.invalidateQueries({ queryKey }))
      );
    },
  });
}
export function useDeleteStockPhoto(id: string) {
  return useWrite<string, T.StockItem>(
    (photoId) => `/stock/${idPath(id)}/photos/${idPath(photoId)}`,
    'DELETE',
    photoKeys
  );
}
/** Saves the photo order; the first id is the cover. */
export function useReorderStockPhotos(id: string) {
  return useWrite<string[], T.StockItem>(
    `/stock/${idPath(id)}/photos/order`,
    'PUT',
    photoKeys,
    (ids) => ({ ids })
  );
}
