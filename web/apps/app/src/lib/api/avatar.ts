import { useWrite, idPath } from './resource';
import type * as T from './types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, upload } from './client';

export function avatarUrl(id: string) {
  return `/api/users/${idPath(id)}/avatar`;
}
export function useUploadAvatar() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => api<T.Profile>('/profile/avatar', upload(file)),
    onSuccess: async () => {
      await Promise.all(
        ['profile', 'auth', 'stores', 'users'].map((key) =>
          client.invalidateQueries({ queryKey: [key] })
        )
      );
    },
  });
}
export function useDeleteAvatar() {
  return useWrite<void, T.Profile>('/profile/avatar', 'DELETE', [
    ['profile'],
    ['auth'],
    ['stores'],
    ['users'],
  ]);
}
