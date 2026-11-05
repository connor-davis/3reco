import { useResource, useWrite } from './resource';
import type * as T from './types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, download, json } from './client';
import { replaceSession } from './auth';

export function usePrivacyNotice() {
  return useResource<T.Notice>(
    ['privacy', 'notice'],
    '/privacy/notice',
    [],
    true
  );
}
export function useAcceptPrivacyNotice() {
  return useWrite<void, T.Ok>('/privacy/notice/accept', 'POST', [['privacy']]);
}
export function useDownloadMyData() {
  return useMutation({
    mutationFn: () => download('/privacy/export', '3reco-my-data.json'),
  });
}
export function useDeleteAccount() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (password: string) =>
      api<T.Ok>('/privacy/delete', json('POST', { password })),
    onSuccess: async () => {
      await replaceSession(client, null);
    },
  });
}
