import { idPath } from './resource';
import type * as T from './types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, upload, download } from './client';

export function receiptUrl(transactionId: string, receiptId: string) {
  return `/api/transactions/${idPath(transactionId)}/receipts/${idPath(receiptId)}`;
}
export function useUploadReceipt(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (file: File) =>
      api<T.Receipt>(`/transactions/${idPath(id)}/receipts`, upload(file)),
    onSuccess: () => client.invalidateQueries({ queryKey: ['transactions'] }),
  });
}
export function useDownloadReceipt(id: string) {
  return useMutation({
    mutationFn: (receipt: T.Receipt) =>
      download(
        `/transactions/${idPath(id)}/receipts/${idPath(receipt.id)}`,
        receipt.file_name
      ),
  });
}
