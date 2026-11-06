import { useResource, useWrite, idPath } from './resource';
import { queryString, type Page, type Paging } from './paging';
import type * as T from './types';
import { useMutation } from '@tanstack/react-query';
import { api, download } from './client';

export function useTransactions(
  kind: 'mine' | 'purchases' | 'sales' = 'mine',
  params: Paging = {}
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
  filters: Omit<Paging, 'cursor' | 'limit'> = {},
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
  return useWrite<T.CollectionInput, T.TransactionCreated>(
    '/transactions/collections',
    'POST',
    [['transactions'], ['stock'], ['dashboards'], ['stats'], ['collectors']]
  );
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
  return `invoice-${invoiceNumber}.pdf`;
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
