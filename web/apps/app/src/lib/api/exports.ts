import { queryString } from './paging';
import { useMutation } from '@tanstack/react-query';
import { download } from './client';

export interface ExportFilters {
  from?: string;
  to?: string;
  itemised?: boolean;
  type?: string;
  role?: string;
  q?: string;
}
export type ExportKind =
  'users' | 'transactions' | 'collections' | 'purchases' | 'sales';
export function exportPath(kind: ExportKind, params: ExportFilters = {}) {
  return `${kind === 'users' || kind === 'transactions' ? '/admin' : ''}/exports/${kind}${queryString(params)}`;
}
export function useExport(kind: ExportKind) {
  return useMutation({
    mutationFn: (params: ExportFilters = {}) =>
      download(exportPath(kind, params), `${kind}.csv`),
  });
}
