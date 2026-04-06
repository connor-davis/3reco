import { ConvexError, v } from 'convex/values';
import { query, type QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import {
  getEffectiveTransactionDate,
  getTransactionCollectionDay,
} from './lib/collectionDay';
import { getCurrentUserIdOrThrow, getCurrentUserOrThrow } from './users';

function formatTransactionDateForExport(transaction: {
  _creationTime: number;
  type: 'c2b' | 'b2b';
  collectionDay?: string;
  collectionDate?: number;
}) {
  const formatTimestamp = (timestamp: number) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Johannesburg',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(timestamp));

  if (transaction.type === 'c2b') {
    if (transaction.collectionDate !== undefined) {
      return formatTimestamp(transaction.collectionDate);
    }

    const collectionDay = getTransactionCollectionDay(transaction);

    if (collectionDay) {
      const [year, month, day] = collectionDay.split('-');
      return `${day}/${month}/${year}`;
    }
  }

  return formatTimestamp(getEffectiveTransactionDate(transaction));
}

function getUserDisplayName(
  user: { firstName?: string; lastName?: string; businessName?: string; email?: string } | null
): string {
  if (!user) return 'Unknown';
  if (user.businessName) return user.businessName;
  if (user.firstName) return `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}`;
  return user.email ?? 'Unknown';
}

async function getSellerDisplayName(
  ctx: QueryCtx,
  transaction: {
    sellerId: Id<'users'> | Id<'collectors'>;
    type: 'c2b' | 'b2b';
  }
) {
  if (transaction.type === 'c2b') {
    const collector = await ctx.db.get(
      'collectors',
      transaction.sellerId as Id<'collectors'>
    );
    if (collector) {
      return collector.name || collector.email || collector.phone;
    }

    return 'Unknown';
  }

  const sellerId = transaction.sellerId as Id<'users'>;

  return getUserDisplayName(await ctx.db.get('users', sellerId));
}

/** All transactions — admin/staff only. */
export const exportTransactions = query({
  args: {
    from: v.optional(v.number()),
    to: v.optional(v.number()),
  },
  handler: async (ctx, { from, to }) => {
    const user = await getCurrentUserOrThrow(ctx);
    if (!user || (user.type !== 'admin' && user.type !== 'staff'))
      throw new ConvexError({ name: 'Unauthorized', message: 'Not authorised.' });

    let rows = await ctx.db.query('transactions').order('desc').collect();
    if (from !== undefined)
      rows = rows.filter((r) => getEffectiveTransactionDate(r) >= from);
    if (to !== undefined)
      rows = rows.filter((r) => getEffectiveTransactionDate(r) <= to);

    const expandedRows = [];
    for (const t of rows) {
      const buyer = await ctx.db.get('users', t.buyerId);
      for (const item of t.items) {
        const material = await ctx.db.get('materials', item.materialId);
        expandedRows.push({
          'Date': formatTransactionDateForExport(t),
          'Transaction Type': t.type.toUpperCase(),
          'Material': material?.name ?? '',
          'Weight (kg)': item.weight,
          'Price per kg (R)': item.price,
          'Total (R)': +(item.price * item.weight).toFixed(2),
          'Seller': await getSellerDisplayName(ctx, t),
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
    const userId = await getCurrentUserIdOrThrow(ctx);
    const user = await getCurrentUserOrThrow(ctx);
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
          q.eq('buyerId', userId).eq('type', 'c2b')
        )
        .order('desc')
        .collect();
    } else {
      throw new ConvexError({ name: 'Unauthorized', message: 'Not authorised.' });
    }

    if (from !== undefined)
      rows = rows.filter((r) => getEffectiveTransactionDate(r) >= from);
    if (to !== undefined)
      rows = rows.filter((r) => getEffectiveTransactionDate(r) <= to);

    const expandedRows = [];
    for (const t of rows) {
      const buyer = await ctx.db.get('users', t.buyerId);
      for (const item of t.items) {
        const material = await ctx.db.get('materials', item.materialId);
        expandedRows.push({
          'Date': formatTransactionDateForExport(t),
          'Material': material?.name ?? '',
          'Weight (kg)': item.weight,
          'Price per kg (R)': item.price,
          'Total (R)': +(item.price * item.weight).toFixed(2),
          'Collector': await getSellerDisplayName(ctx, t),
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
    const userId = await getCurrentUserIdOrThrow(ctx);
    const user = await getCurrentUserOrThrow(ctx);
    if (!user || user.type !== 'business')
      throw new ConvexError({ name: 'Unauthorized', message: 'Not authorised.' });

    let rows = await ctx.db
      .query('transactions')
      .withIndex('by_buyerId', (q) => q.eq('buyerId', userId))
      .order('desc')
      .collect();
    if (from !== undefined)
      rows = rows.filter((r) => getEffectiveTransactionDate(r) >= from);
    if (to !== undefined)
      rows = rows.filter((r) => getEffectiveTransactionDate(r) <= to);

    const expandedRows = [];
    for (const t of rows) {
      for (const item of t.items) {
        const material = await ctx.db.get('materials', item.materialId);
        expandedRows.push({
          'Date': formatTransactionDateForExport(t),
          'Transaction Type': t.type.toUpperCase(),
          'Material': material?.name ?? '',
          'Weight (kg)': item.weight,
          'Price per kg (R)': item.price,
          'Total (R)': +(item.price * item.weight).toFixed(2),
          'Seller': await getSellerDisplayName(ctx, t),
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
    const userId = await getCurrentUserIdOrThrow(ctx);
    const user = await getCurrentUserOrThrow(ctx);
    if (!user || user.type !== 'business')
      throw new ConvexError({ name: 'Unauthorized', message: 'Not authorised.' });

    let rows = await ctx.db
      .query('transactions')
      .withIndex('by_sellerId_and_type', (q) =>
        q.eq('sellerId', userId).eq('type', 'b2b')
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
          'Date': formatTransactionDateForExport(t),
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
    const user = await getCurrentUserOrThrow(ctx);
    if (!user || user.type !== 'admin')
      throw new ConvexError({ name: 'Unauthorized', message: 'Not authorised.' });

    const users = await ctx.db
      .query('users')
      .filter((q) => q.neq(q.field('isRemoved'), true))
      .collect();
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
