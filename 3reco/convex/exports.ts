import { ConvexError, v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { query } from './_generated/server';

function getUserDisplayName(
  user: { firstName?: string; lastName?: string; businessName?: string; email?: string } | null
): string {
  if (!user) return 'Unknown';
  if (user.businessName) return user.businessName;
  if (user.firstName) return `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}`;
  return user.email ?? 'Unknown';
}

/** All transactions — admin/staff only. */
export const exportTransactions = query({
  args: {
    from: v.optional(v.number()),
    to: v.optional(v.number()),
  },
  handler: async (ctx, { from, to }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ name: 'Unauthorized', message: 'Not authorised.' });
    const [userId] = identity.subject.split('|');
    const user = await ctx.db.get('users', userId as Id<'users'>);
    if (!user || (user.type !== 'admin' && user.type !== 'staff'))
      throw new ConvexError({ name: 'Unauthorized', message: 'Not authorised.' });

    let rows = await ctx.db.query('transactions').order('desc').collect();
    if (from !== undefined) rows = rows.filter((r) => r._creationTime >= from);
    if (to !== undefined) rows = rows.filter((r) => r._creationTime <= to);

    const expandedRows = [];
    for (const t of rows) {
      const seller = await ctx.db.get('users', t.sellerId);
      const buyer = await ctx.db.get('users', t.buyerId);
      for (const item of t.items) {
        const material = await ctx.db.get('materials', item.materialId);
        expandedRows.push({
          'Date': new Date(t._creationTime).toISOString(),
          'Transaction Type': t.type.toUpperCase(),
          'Material': material?.name ?? '',
          'Weight (kg)': item.weight,
          'Price per kg (R)': item.price,
          'Total (R)': +(item.price * item.weight).toFixed(2),
          'Seller': getUserDisplayName(seller),
          'Buyer': getUserDisplayName(buyer),
        });
      }
    }
    return expandedRows;
  },
});

/** Collections (c2b purchases) for the current business — or all if admin/staff. */
export const exportCollections = query({
  args: {
    from: v.optional(v.number()),
    to: v.optional(v.number()),
  },
  handler: async (ctx, { from, to }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ name: 'Unauthorized', message: 'Not authorised.' });
    const [userId] = identity.subject.split('|');
    const user = await ctx.db.get('users', userId as Id<'users'>);
    if (!user) throw new ConvexError({ name: 'Not Found', message: 'User not found.' });

    let rows;
    if (user.type === 'admin' || user.type === 'staff') {
      rows = await ctx.db
        .query('transactions')
        .withIndex('by_type', (q) => q.eq('type', 'c2b'))
        .order('desc')
        .collect();
    } else if (user.type === 'business') {
      rows = await ctx.db
        .query('transactions')
        .withIndex('by_buyerId_and_type', (q) =>
          q.eq('buyerId', userId as Id<'users'>).eq('type', 'c2b')
        )
        .order('desc')
        .collect();
    } else {
      throw new ConvexError({ name: 'Unauthorized', message: 'Not authorised.' });
    }

    if (from !== undefined) rows = rows.filter((r) => r._creationTime >= from);
    if (to !== undefined) rows = rows.filter((r) => r._creationTime <= to);

    const expandedRows = [];
    for (const t of rows) {
      const seller = await ctx.db.get('users', t.sellerId);
      const buyer = await ctx.db.get('users', t.buyerId);
      for (const item of t.items) {
        const material = await ctx.db.get('materials', item.materialId);
        expandedRows.push({
          'Date': new Date(t._creationTime).toISOString(),
          'Material': material?.name ?? '',
          'Weight (kg)': item.weight,
          'Price per kg (R)': item.price,
          'Total (R)': +(item.price * item.weight).toFixed(2),
          'Collector': getUserDisplayName(seller),
          'Business': getUserDisplayName(buyer),
        });
      }
    }
    return expandedRows;
  },
});

/** Business purchases (as buyer, all types) — scoped to current business. */
export const exportMyPurchases = query({
  args: {
    from: v.optional(v.number()),
    to: v.optional(v.number()),
  },
  handler: async (ctx, { from, to }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ name: 'Unauthorized', message: 'Not authorised.' });
    const [userId] = identity.subject.split('|');
    const user = await ctx.db.get('users', userId as Id<'users'>);
    if (!user || user.type !== 'business')
      throw new ConvexError({ name: 'Unauthorized', message: 'Not authorised.' });

    let rows = await ctx.db
      .query('transactions')
      .withIndex('by_buyerId', (q) => q.eq('buyerId', userId as Id<'users'>))
      .order('desc')
      .collect();
    if (from !== undefined) rows = rows.filter((r) => r._creationTime >= from);
    if (to !== undefined) rows = rows.filter((r) => r._creationTime <= to);

    const expandedRows = [];
    for (const t of rows) {
      const seller = await ctx.db.get('users', t.sellerId);
      for (const item of t.items) {
        const material = await ctx.db.get('materials', item.materialId);
        expandedRows.push({
          'Date': new Date(t._creationTime).toISOString(),
          'Transaction Type': t.type.toUpperCase(),
          'Material': material?.name ?? '',
          'Weight (kg)': item.weight,
          'Price per kg (R)': item.price,
          'Total (R)': +(item.price * item.weight).toFixed(2),
          'Seller': getUserDisplayName(seller),
        });
      }
    }
    return expandedRows;
  },
});

/** Business sales (as seller, B2B only) — scoped to current business. */
export const exportMySales = query({
  args: {
    from: v.optional(v.number()),
    to: v.optional(v.number()),
  },
  handler: async (ctx, { from, to }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ name: 'Unauthorized', message: 'Not authorised.' });
    const [userId] = identity.subject.split('|');
    const user = await ctx.db.get('users', userId as Id<'users'>);
    if (!user || user.type !== 'business')
      throw new ConvexError({ name: 'Unauthorized', message: 'Not authorised.' });

    let rows = await ctx.db
      .query('transactions')
      .withIndex('by_sellerId_and_type', (q) =>
        q.eq('sellerId', userId as Id<'users'>).eq('type', 'b2b')
      )
      .order('desc')
      .collect();
    if (from !== undefined) rows = rows.filter((r) => r._creationTime >= from);
    if (to !== undefined) rows = rows.filter((r) => r._creationTime <= to);

    const expandedRows = [];
    for (const t of rows) {
      const buyer = await ctx.db.get('users', t.buyerId);
      for (const item of t.items) {
        const material = await ctx.db.get('materials', item.materialId);
        expandedRows.push({
          'Date': new Date(t._creationTime).toISOString(),
          'Material': material?.name ?? '',
          'Weight (kg)': item.weight,
          'Price per kg (R)': item.price,
          'Total (R)': +(item.price * item.weight).toFixed(2),
          'Buyer': getUserDisplayName(buyer),
        });
      }
    }
    return expandedRows;
  },
});

/** All users — admin only. */
export const exportUsers = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ name: 'Unauthorized', message: 'Not authorised.' });
    const [userId] = identity.subject.split('|');
    const user = await ctx.db.get('users', userId as Id<'users'>);
    if (!user || user.type !== 'admin')
      throw new ConvexError({ name: 'Unauthorized', message: 'Not authorised.' });

    const users = await ctx.db.query('users').collect();
    return users.map((u) => ({
      'Email': u.email ?? '',
      'Account Type': u.type ?? '',
      'First Name': u.firstName ?? '',
      'Last Name': u.lastName ?? '',
      'Business Name': u.businessName ?? '',
      'Business Reg. No.': u.businessRegistrationNumber ?? '',
      'Phone': u.phone ?? '',
      'Street Address': u.streetAddress ?? '',
      'City': u.city ?? '',
      'Area Code': u.areaCode ?? '',
      'Province': u.province ?? '',
      'Registered At': new Date(u._creationTime).toISOString(),
    }));
  },
});
