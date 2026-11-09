import { useResource } from './resource';
import { queryString } from './paging';
import type * as T from './types';

export interface DashboardRange {
  from?: string;
  to?: string;
}
export function useDashboard(
  kind: 'business' | 'collector' | 'admin',
  range: DashboardRange = {}
) {
  return useResource<T.Dashboard>(
    ['dashboards', kind, range],
    `${kind === 'admin' ? '/admin/dashboard' : `/dashboard/${kind}`}${queryString(range)}`,
    true
  );
}
