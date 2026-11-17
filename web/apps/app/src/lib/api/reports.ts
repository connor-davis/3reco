import { useAuth } from '@/lib/auth/use-auth';
import { idPath, useResource, useWrite } from './resource';
import type { Created, Ok } from './types';

export interface ReportInput {
  target_kind: 'listing' | 'party';
  target_id: string;
  reason: string;
  details: string;
}

export interface ReportStatus {
  id: string;
  status: string;
}

export interface Report extends ReportStatus {
  reporter_id: string;
  reporter_name: string;
  party_report_count: number;
  party_id: string;
  party_name: string;
  target_kind: 'listing' | 'party';
  target_id: string;
  target_name: string;
  reason: string;
  details: string;
  suspended: boolean;
  created_at: string;
}

export function useReports() {
  const { user } = useAuth();
  return useResource<{ items: ReportStatus[] }>(
    ['reports', user?.active_business_id],
    '/reports',
    true,
    !!user?.active_business_id
  );
}

export function useReport() {
  return useWrite<ReportInput, Created>('/reports', 'POST', [['reports']]);
}

export function useAdminReports() {
  const { user } = useAuth();
  return useResource<{ items: Report[] }>(
    ['admin', 'reports'],
    '/admin/reports',
    true,
    user?.role === 'admin'
  );
}

export type ReportAction = 'dismiss' | 'remove_listing' | 'suspend';

export function useResolveReport() {
  return useWrite<{ id: string; action: ReportAction }, Ok>(
    ({ id }) => `/admin/reports/${idPath(id)}/resolve`,
    'POST',
    [['admin'], ['listings'], ['stores'], ['reports']],
    ({ action }) => ({ action })
  );
}

export function useUnsuspend() {
  return useWrite<string, Ok>(
    (id) => `/admin/businesses/${idPath(id)}/unsuspend`,
    'POST',
    [['admin'], ['listings'], ['stores']],
    () => undefined
  );
}
