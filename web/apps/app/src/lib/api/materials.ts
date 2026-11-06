import { useResource, useWrite, idPath } from './resource';
import { queryString, type Page, type Paging } from './paging';
import type * as T from './types';

export function useMaterials(params: Paging = {}) {
  return useResource<Page<T.Material>>(
    ['materials', params],
    `/materials${queryString(params)}`
  );
}
export function useMaterial(id: string) {
  return useResource<T.Material>(
    ['materials', id],
    `/materials/${idPath(id)}`,
    false,
    !!id
  );
}
export function useCreateMaterial() {
  return useWrite<T.MaterialInput, T.Created>('/admin/materials', 'POST', []);
}
export function useUpdateMaterial(id: string) {
  return useWrite<Partial<T.MaterialInput>, T.Ok>(
    `/admin/materials/${idPath(id)}`,
    'PATCH',
    [['materials'], ['stock'], ['listings']]
  );
}
export function useDeleteMaterial() {
  return useWrite<string, T.Ok>(
    (id) => `/admin/materials/${idPath(id)}`,
    'DELETE',
    [['materials']],
    () => undefined
  );
}
