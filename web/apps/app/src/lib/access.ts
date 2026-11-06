import type { Role } from '@/lib/api/types';

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
  | 'users';

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
