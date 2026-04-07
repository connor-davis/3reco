import { createAccessControl } from 'better-auth/plugins/access';

/**
 * Resource/action statements for the app.
 *
 * Resources:
 *   - user       — managing other user accounts (admin operations)
 *   - collection — waste-collection records
 *   - stock      — business stock listings
 *   - transaction — completed transactions
 *   - material   — material catalogue (admin/staff managed)
 *   - market     — market/request access
 */
export const statement = {
  user: ['list', 'setRole', 'remove'],
  collection: ['read', 'create', 'update', 'delete'],
  stock: ['read', 'create', 'update', 'delete'],
  transaction: ['readAll', 'readOwn'],
  material: ['read', 'create', 'update', 'delete'],
  market: ['browse', 'request'],
} as const;

export const ac = createAccessControl(statement);

/** Full administrative access */
export const adminRole = ac.newRole({
  user: ['list', 'setRole', 'remove'],
  collection: ['read', 'create', 'update', 'delete'],
  stock: ['read', 'create', 'update', 'delete'],
  transaction: ['readAll'],
  material: ['read', 'create', 'update', 'delete'],
  market: ['browse', 'request'],
});

/** Operations staff — like admin but cannot manage users or materials */
export const staffRole = ac.newRole({
  collection: ['read', 'create', 'update', 'delete'],
  stock: ['read'],
  transaction: ['readAll'],
  material: ['read'],
  market: ['browse'],
});

/** Recycling businesses — buy/sell, manage own stock */
export const businessRole = ac.newRole({
  collection: ['read', 'create', 'update', 'delete'],
  stock: ['read', 'create', 'update', 'delete'],
  transaction: ['readOwn'],
  market: ['browse', 'request'],
});

/** Waste collectors — are managed by businesses; read their own collections */
export const collectorRole = ac.newRole({
  collection: ['read'],
  transaction: ['readOwn'],
  market: ['browse'],
});
