import type { Role } from '@/lib/types';

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
  profile: ['admin', 'staff', 'business', 'collector'],
  users: ['admin'],
};

export function canOpen(role: Role, page: PageId): boolean {
  return allowed[page].includes(role);
}

export const roleLabels: Record<Role, string> = {
  admin: 'Admin',
  staff: 'Staff',
  business: 'Business',
  collector: 'Collector',
  'signed-out': 'Signed out',
};

export const isStaffRole = (role: Role) => role === 'admin' || role === 'staff';
