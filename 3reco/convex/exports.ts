import { ConvexError, v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { query, type QueryCtx } from './_generated/server';
import {
  getEffectiveTransactionDate,
  getTransactionCollectionDay,
} from './lib/collectionDay';
import { getCurrentUserIdOrThrow, getCurrentUserOrThrow, requireRole } from './users';
import {
  formatCollectorPayoutSummary,
  getCollectorPayoutDetails,
} from '../src/lib/payout-details';

type ExportSeller = {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  payoutMethod?: string;
  payoutDetails?: string;
};

function formatDateOnly(timestamp: number) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Johannesburg',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(timestamp));
}

function formatTransactionDateForExport(transaction: {
  _creationTime: number;
  type: 'c2b' | 'b2b';
  collectionDay?: string;
  collectionDate?: number;
}) {
  if (transaction.type === 'c2b') {
    if (transaction.collectionDate !== undefined) {
      return formatDateOnly(transaction.collectionDate);
    }

    const collectionDay = getTransactionCollectionDay(transaction);

    if (collectionDay) {
      const [year, month, day] = collectionDay.split('-');
      return `${day}/${month}/${year}`;
    }
  }

  return formatDateOnly(getEffectiveTransactionDate(transaction));
}

function formatRecordedAt(timestamp: number) {
  return new Intl.DateTimeFormat('en-ZA', {
    timeZone: 'Africa/Johannesburg',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function formatAddress(parts: Array<string | number | null | undefined>) {
  return parts
    .filter((part) => part !== undefined && part !== null && String(part).trim().length > 0)
    .join(', ');
}

function getUserDisplayName(
  user: {
    firstName?: string;
    lastName?: string;
    businessName?: string;
    email?: string;
    name?: string;
  } | null
): string {
  if (!user) return 'Unknown';
  if (user.businessName) return user.businessName;
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return fullName || user.name || user.email || 'Unknown';
}

async function getExportSeller(
  ctx: QueryCtx,
  transaction: Doc<'transactions'>
): Promise<ExportSeller> {
  if (transaction.type === 'c2b') {
    const collector = await ctx.db.get(
      'collectors',
      transaction.sellerId as Id<'collectors'>
    );
    const snapshot = transaction.collectorSnapshot;
    const payoutDetails = getCollectorPayoutDetails(snapshot ?? collector);

    return {
      name:
        snapshot?.name ||
        collector?.name ||
        snapshot?.email ||
        collector?.email ||
        snapshot?.phone ||
        collector?.phone ||
        'Unknown',
      email: snapshot?.email ?? collector?.email,
      phone: snapshot?.phone ?? collector?.phone,
      address: formatAddress([
        snapshot?.streetAddress ?? collector?.streetAddress,
        snapshot?.city ?? collector?.city,
        snapshot?.areaCode ?? collector?.areaCode,
        snapshot?.province ?? collector?.province,
      ]),
      payoutMethod:
        payoutDetails?.payoutMethod === 'bank'
          ? 'Bank transfer'
          : payoutDetails?.payoutMethod === 'ewallet'
            ? 'Ewallet'
            : undefined,
      payoutDetails: formatCollectorPayoutSummary(payoutDetails) || undefined,
    };
  }

  const seller = await ctx.db.get('users', transaction.sellerId as Id<'users'>);

  return {
    name: getUserDisplayName(seller),
    email: seller?.email,
    phone: seller?.phone,
    address: formatAddress([
      seller?.streetAddress,
      seller?.city,
      seller?.areaCode,
      seller?.province,
    ]),
  };
}

async function getMaterialsSummary(
  ctx: QueryCtx,
  transaction: Doc<'transactions'>
) {
  const lines = await Promise.all(
    transaction.items.map(async (item, index) => {
      const material = await ctx.db.get('materials', item.materialId);
      const lineTotal = item.weight * item.price;

      return `${index + 1}. ${material?.name ?? 'Unknown'} - ${item.weight.toFixed(2)} kg x R ${item.price.toFixed(2)} = R ${lineTotal.toFixed(2)}`;
    })
  );

  const totalWeight = transaction.items.reduce((sum, item) => sum + item.weight, 0);

  return {
    materials: lines.join('\n'),
    totalWeight: +totalWeight.toFixed(2),
  };
}

async function buildTransactionExportRow(ctx: QueryCtx, transaction: Doc<'transactions'>) {
  const buyer = await ctx.db.get('users', transaction.buyerId);
  const seller = await getExportSeller(ctx, transaction);
  const { materials, totalWeight } = await getMaterialsSummary(ctx, transaction);

  return {
    'Transaction ID': transaction._id,
    'Transaction Type':
      transaction.type === 'c2b' ? 'Collector to business' : 'Business to business',
    'Transaction Date': formatTransactionDateForExport(transaction),
    'Recorded At': formatRecordedAt(transaction._creationTime),
    'Collection Day': getTransactionCollectionDay(transaction) ?? '',
    'Items Count': transaction.items.length,
    'Materials': materials,
    'Total Weight (kg)': totalWeight,
    'Total Price (R)': +transaction.totalPrice.toFixed(2),
    'Seller Name': seller.name,
    'Seller Email': seller.email ?? '',
    'Seller Phone': seller.phone ?? '',
    'Seller Address': seller.address ?? '',
    'Buyer Name': getUserDisplayName(buyer),
    'Buyer Email': buyer?.email ?? '',
    'Buyer Phone': buyer?.phone ?? '',
    'Buyer Address': formatAddress([
      buyer?.streetAddress,
      buyer?.city,
      buyer?.areaCode,
      buyer?.province,
    ]),
    'Collector Payout Method': seller.payoutMethod ?? '',
    'Collector Payout Details': seller.payoutDetails ?? '',
  };
}

async function buildTransactionExportRows(
  ctx: QueryCtx,
  transactions: Doc<'transactions'>[]
) {
  return await Promise.all(
    transactions.map((transaction) => buildTransactionExportRow(ctx, transaction))
  );
}

/** All transactions — admin/staff only. */
export const exportTransactions = query({
  args: {
    from: v.optional(v.number()),
    to: v.optional(v.number()),
  },
  handler: async (ctx, { from, to }) => {
    await requireRole(ctx, ['admin', 'staff']);

    let rows = await ctx.db.query('transactions').order('desc').collect();
    if (from !== undefined) {
      rows = rows.filter((row) => getEffectiveTransactionDate(row) >= from);
    }
    if (to !== undefined) {
      rows = rows.filter((row) => getEffectiveTransactionDate(row) <= to);
    }

    return await buildTransactionExportRows(ctx, rows);
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
    if (!user) {
      throw new ConvexError({ name: 'Not Found', message: 'User not found.' });
    }

    let rows;
    if (user.role === 'admin' || user.role === 'staff') {
      rows = await ctx.db
        .query('transactions')
        .withIndex('by_type', (q) => q.eq('type', 'c2b'))
        .order('desc')
        .collect();
    } else if (user.role === 'business') {
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

    if (from !== undefined) {
      rows = rows.filter((row) => getEffectiveTransactionDate(row) >= from);
    }
    if (to !== undefined) {
      rows = rows.filter((row) => getEffectiveTransactionDate(row) <= to);
    }

    return await buildTransactionExportRows(ctx, rows);
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
    if (!user || user.role !== 'business') {
      throw new ConvexError({ name: 'Unauthorized', message: 'Not authorised.' });
    }

    let rows = await ctx.db
      .query('transactions')
      .withIndex('by_buyerId', (q) => q.eq('buyerId', userId))
      .order('desc')
      .collect();

    if (from !== undefined) {
      rows = rows.filter((row) => getEffectiveTransactionDate(row) >= from);
    }
    if (to !== undefined) {
      rows = rows.filter((row) => getEffectiveTransactionDate(row) <= to);
    }

    return await buildTransactionExportRows(ctx, rows);
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
    if (!user || user.role !== 'business') {
      throw new ConvexError({ name: 'Unauthorized', message: 'Not authorised.' });
    }

    let rows = await ctx.db
      .query('transactions')
      .withIndex('by_sellerId_and_type', (q) =>
        q.eq('sellerId', userId).eq('type', 'b2b')
      )
      .order('desc')
      .collect();

    if (from !== undefined) {
      rows = rows.filter((row) => getEffectiveTransactionDate(row) >= from);
    }
    if (to !== undefined) {
      rows = rows.filter((row) => getEffectiveTransactionDate(row) <= to);
    }

    return await buildTransactionExportRows(ctx, rows);
  },
});

/** All users — admin only. */
export const exportUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, 'admin');

    const users = await ctx.db
      .query('users')
      .filter((q) => q.neq(q.field('isRemoved'), true))
      .collect();
    return users.map((u) => ({
      'Email': u.email ?? '',
      'Account Type': u.role ?? '',
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
