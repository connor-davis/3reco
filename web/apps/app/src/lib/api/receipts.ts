import { idPath } from './resource';
import type * as T from './types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, upload, download } from './client';

/** What one trade holds: five PNG or JPEG images of 5 MB each. */
export const maxReceipts = 5;
export const maxBytes = 5 * 1024 * 1024;
export const kinds = ['image/png', 'image/jpeg'];

export function receiptUrl(transactionId: string, receiptId: string) {
  return `/api/transactions/${idPath(transactionId)}/receipts/${idPath(receiptId)}`;
}
export function useUploadReceipt() {
  const client = useQueryClient();
  return useMutation({
    // The id goes in the variables: a new collection has none until it is saved.
    mutationFn: ({ id, file }: { id: string; file: File }) =>
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

export function useDeleteReceipt(transactionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (receiptId: string) =>
      api<void>(
        `/transactions/${idPath(transactionId)}/receipts/${idPath(receiptId)}`,
        { method: 'DELETE' }
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: ['transactions'] }),
  });
}
