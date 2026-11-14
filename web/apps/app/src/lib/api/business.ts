import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, download, upload } from './client';
import { useResource, useWrite } from './resource';
import type * as T from './types';

/** The active business. A person still setting one up gets an empty one. */
export function useBusiness(enabled = true) {
  return useResource<T.BusinessProfile>(
    ['business'],
    '/business',
    true,
    enabled
  );
}
const keys = [['business'], ['auth'], ['stores'], ['profile']] as const;
/** Saves business details; the first save by a new business person opens it. */
export function useUpdateBusiness() {
  return useWrite<T.BusinessInput, T.Ok>('/business', 'PATCH', keys);
}
export function useUploadLogo() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => api<T.Ok>('/business/logo', upload(file)),
    onSuccess: async () => {
      await Promise.all(
        [...keys, ['listings']].map((queryKey) =>
          client.invalidateQueries({ queryKey })
        )
      );
    },
  });
}
export function useDeleteLogo() {
  return useWrite<void, T.Ok>('/business/logo', 'DELETE', [
    ...keys,
    ['listings'],
  ]);
}
export function useDownloadBusinessData() {
  return useMutation({
    mutationFn: () => download('/business/export', '3reco-business-data.json'),
  });
}
