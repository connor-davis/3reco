import type { AuthUser, Role } from '@/lib/api/types';

/** Team management belongs to Owners of the selected business. */
export function canManageTeam(
  user:
    Pick<AuthUser, 'active_business_id' | 'business_role'> | null | undefined
): boolean {
  return !!user?.active_business_id && user.business_role === 'owner';
}

/** Owners and Managers can open the selected business's team. */
export function canSeeTeam(
  user:
    Pick<AuthUser, 'active_business_id' | 'business_role'> | null | undefined
): boolean {
  return (
    !!user?.active_business_id &&
    (user.business_role === 'owner' || user.business_role === 'manager')
  );
}

export type PageId =
  | 'dashboard'
  | 'messages'
  | 'materials'
  | 'stock'
  | 'collectors'
  | 'collections'
  | 'transactions'
  | 'purchases'
  | 'sales'
  | 'incoming'
  | 'outgoing'
  | 'cart'
  | 'profile'
  | 'users'
  | 'activity';

// Pages that are not listed here (market, store, listing, about, auth) are
// open to everyone, signed in or not. The old app's permissions decide this.
const allowed: Record<PageId, Role[]> = {
  dashboard: ['admin', 'staff', 'business', 'collector'],
  messages: ['admin', 'staff', 'business'],
  materials: ['admin', 'staff'],
  stock: ['business'],
  collectors: ['admin', 'staff', 'business'],
  collections: ['admin', 'staff', 'business'],
  transactions: ['admin', 'staff'],
  purchases: ['business'],
  sales: ['business', 'collector'],
  incoming: ['business'],
  outgoing: ['business'],
  cart: ['business'],
  profile: ['guest', 'admin', 'staff', 'business', 'collector'],
  users: ['admin'],
  activity: ['admin'],
};

/** A guest (no role yet) opens nothing but their profile and the setup. */
export function canOpen(role: Role | null, page: PageId): boolean {
  return role !== null && allowed[page].includes(role);
}

export const roleLabels: Record<Role, string> = {
  guest: 'Guest',
  admin: 'Admin',
  staff: 'Staff',
  business: 'Business',
  collector: 'Collector',
};

export const isStaffRole = (role: string | null | undefined) =>
  role === 'admin' || role === 'staff';

/** A role written for people: "Business". Safe for a missing or unknown role. */
export function roleLabel(role: string | null | undefined): string {
  if (!role) return '';

  return (
    roleLabels[role as Role] ?? role.charAt(0).toUpperCase() + role.slice(1)
  );
}
