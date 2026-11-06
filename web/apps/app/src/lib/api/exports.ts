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
function exportFilename(kind: ExportKind, params: ExportFilters) {
  const parts: string[] = ['3REco', kind];
  if (params.type) parts.push(params.type);
  if (params.itemised) parts.push('by-material');
  for (const bound of [params.from, params.to]) {
    if (bound)
      parts.push(
        new Date(bound).toLocaleDateString('en-CA', {
          timeZone: 'Africa/Johannesburg',
        })
      );
  }
  if (params.q || params.role) parts.push('filtered');
  return `${parts.join('-')}.csv`;
}
export function useExport(kind: ExportKind) {
  return useMutation({
    mutationFn: (params: ExportFilters = {}) =>
      download(exportPath(kind, params), exportFilename(kind, params)),
  });
}
