import { useResource, useWrite, idPath } from './resource';
import { queryString, type Page, type Paging } from './paging';
import type * as T from './types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, download, json } from './client';

export function useTransactions(
  kind: 'mine' | 'purchases' | 'sales' = 'mine',
  params: Paging & { order?: 'recorded'; business_id?: string } = {}
) {
  return useResource<Page<T.Transaction>>(
    ['transactions', kind, params],
    `/transactions/${kind === 'mine' ? '' : kind}${queryString(params)}`,
    true
  );
}
/** Count, kg and value of a whole filtered list, not just one page of it. */
export function useTransactionTotals(
  kind: 'mine' | 'purchases' | 'sales' = 'mine',
  filters: Omit<Paging, 'cursor' | 'limit'> & { business_id?: string } = {},
  enabled = true
) {
  return useResource<T.TransactionTotals>(
    ['transactions', 'totals', kind, filters],
    `/transactions/totals${queryString({ kind, ...filters })}`,
    true,
    enabled
  );
}
export function useTransaction(id: string) {
  return useResource<T.Transaction>(
    ['transactions', id],
    `/transactions/${idPath(id)}`,
    true,
    !!id
  );
}
export function useCreateCollection() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      idempotencyKey,
      ...body
    }: T.CollectionInput & { idempotencyKey: string }) =>
      api<T.TransactionCreated>('/transactions/collections', {
        ...json('POST', body),
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
      }),
    onSuccess: async () => {
      await Promise.all(
        ['transactions', 'stock', 'dashboards', 'stats', 'collectors'].map(
          (key) => client.invalidateQueries({ queryKey: [key] })
        )
      );
    },
  });
}
export function useCreateSale() {
  return useWrite<T.SaleInput, T.TransactionCreated>(
    '/transactions/sales',
    'POST',
    [['transactions'], ['stock'], ['listings'], ['dashboards'], ['stats']]
  );
}
export function invoiceUrl(id: string) {
  return `/api/transactions/${idPath(id)}/invoice`;
}
/** The saved file name: the invoice number people see, never the raw id. */
export function invoiceFilename(invoiceNumber: string) {
  return `3REco-Invoice-${invoiceNumber}.pdf`;
}
/** The saved file name of a one-trade recycling record. */
export function recordFilename(invoiceNumber: string) {
  return `3REco-Recycling-Record-${invoiceNumber}.pdf`;
}
/** Downloads the recycling record of one completed trade. */
export function useDownloadRecord() {
  return useMutation({
    mutationFn: (trade: { id: string; invoice_number: string }) =>
      download(
        `/transactions/${idPath(trade.id)}/certificate`,
        recordFilename(trade.invoice_number)
      ),
  });
}
/** Downloads the recycling record of the caller's trades from one day to another. */
export function useDownloadPeriodRecord() {
  return useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) =>
      download(
        `/certificates${queryString({ from, to })}`,
        `3REco-Recycling-Record-${from}-to-${to}.pdf`
      ),
  });
}
/** Pass the trade when you have it; a bare id looks the number up first. */
export function useDownloadInvoice() {
  return useMutation({
    mutationFn: async (
      target: string | { id: string; invoice_number: string }
    ) => {
      const id = typeof target === 'string' ? target : target.id;
      const number =
        typeof target === 'string'
          ? (await api<T.Transaction>(`/transactions/${idPath(id)}`))
              .invoice_number
          : target.invoice_number;

      await download(
        `/transactions/${idPath(id)}/invoice`,
        invoiceFilename(number)
      );
    },
  });
}
