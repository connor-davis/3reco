import { isStaffRole } from '@/lib/access';
import { useAuth } from '@/lib/auth/use-auth';
import { idPath, useResource, useWrite } from './resource';
import type { Ok } from './types';

/** One line of a waiting change. Secret values arrive masked (last 4 only). */
export interface CollectorChangeField {
  field: string;
  label: string;
  old: string;
  new: string;
  secret: boolean;
}

/** An edit a business proposed to a collector it did not add. */
export interface CollectorChange {
  id: string;
  collector_id: string;
  collector_name: string;
  business_id: string;
  business_name: string;
  created_at: string;
  changes: CollectorChangeField[];
}

export function useCollectorChanges() {
  const { user } = useAuth();
  return useResource<{ items: CollectorChange[] }>(
    ['collector-changes'],
    '/admin/collector-changes',
    true,
    isStaffRole(user?.role)
  );
}

const refreshed = [['collector-changes'], ['collectors'], ['admin']];

export function useApproveCollectorChange() {
  return useWrite<string, Ok>(
    (id) => `/admin/collector-changes/${idPath(id)}/approve`,
    'POST',
    refreshed,
    () => ({})
  );
}

export function useRejectCollectorChange() {
  return useWrite<{ id: string; reason: string }, Ok>(
    ({ id }) => `/admin/collector-changes/${idPath(id)}/reject`,
    'POST',
    refreshed,
    ({ reason }) => ({ reason })
  );
}
