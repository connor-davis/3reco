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

type MaterialNameCache = Map<Id<'materials'>, string>;

async function getMaterialName(
  ctx: QueryCtx,
  materialId: Id<'materials'>,
  cache: MaterialNameCache
) {
  const cached = cache.get(materialId);
  if (cached !== undefined) return cached;

  const material = await ctx.db.get('materials', materialId);
  const name = material?.name ?? 'Unknown';
  cache.set(materialId, name);
  return name;
}

async function getMaterialsSummary(
  ctx: QueryCtx,
  transaction: Doc<'transactions'>,
  cache: MaterialNameCache
) {
  const lines = await Promise.all(
    transaction.items.map(async (item, index) => {
      const materialName = await getMaterialName(ctx, item.materialId, cache);
      const lineTotal = item.weight * item.price;

      return `${index + 1}. ${materialName} - ${item.weight.toFixed(2)} kg x R ${item.price.toFixed(2)} = R ${lineTotal.toFixed(2)}`;
    })
  );

  const totalWeight = transaction.items.reduce((sum, item) => sum + item.weight, 0);

  return {
    materials: lines.join('\n'),
    totalWeight: +totalWeight.toFixed(2),
  };
}

/**
 * Transaction-level columns shared by both export modes. Split into "leading"
 * (everything up to and including Items Count) and "trailing" (everything after
 * the Materials column) so the per-material line columns can be inserted at the
 * exact position the Materials blob occupies in the default mode.
 */
async function buildTransactionBaseFields(
  ctx: QueryCtx,
  transaction: Doc<'transactions'>
) {
  const buyer = await ctx.db.get('users', transaction.buyerId);
  const seller = await getExportSeller(ctx, transaction);
  const totalWeight = transaction.items.reduce((sum, item) => sum + item.weight, 0);

  return {
    leading: {
      'Transaction ID': transaction._id,
      'Transaction Type':
        transaction.type === 'c2b' ? 'Collector to business' : 'Business to business',
      'Transaction Date': formatTransactionDateForExport(transaction),
      'Recorded At': formatRecordedAt(transaction._creationTime),
      'Collection Day': getTransactionCollectionDay(transaction) ?? '',
      'Items Count': transaction.items.length,
    },
    trailing: {
      'Total Weight (kg)': +totalWeight.toFixed(2),
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
    },
  };
}

/** One row per transaction, with all material lines joined into a single cell. */
async function buildTransactionExportRow(
  ctx: QueryCtx,
  transaction: Doc<'transactions'>,
  cache: MaterialNameCache
) {
  const { leading, trailing } = await buildTransactionBaseFields(ctx, transaction);
  const { materials } = await getMaterialsSummary(ctx, transaction, cache);

  return {
    ...leading,
    'Materials': materials,
    ...trailing,
  };
}

/**
 * One row per material line, with every transaction-level column repeated so each
 * row is self-contained (sortable/pivotable in Excel). Transactions with no items
 * still emit a single row with the line columns blank.
 */
async function buildTransactionItemRows(
  ctx: QueryCtx,
  transaction: Doc<'transactions'>,
  cache: MaterialNameCache
) {
  const { leading, trailing } = await buildTransactionBaseFields(ctx, transaction);

  if (transaction.items.length === 0) {
    return [
      {
        ...leading,
        'Line No': '',
        'Material': '',
        'Line Weight (kg)': '',
        'Unit Price (R)': '',
        'Line Total (R)': '',
        ...trailing,
      },
    ];
  }

  return await Promise.all(
    transaction.items.map(async (item, index) => {
      const materialName = await getMaterialName(ctx, item.materialId, cache);

      return {
        ...leading,
        'Line No': index + 1,
        'Material': materialName,
        'Line Weight (kg)': +item.weight.toFixed(2),
        'Unit Price (R)': +item.price.toFixed(2),
        'Line Total (R)': +(item.weight * item.price).toFixed(2),
        ...trailing,
      };
    })
  );
}

async function buildTransactionExportRows(
  ctx: QueryCtx,
  transactions: Doc<'transactions'>[],
  itemised?: boolean
) {
  const cache: MaterialNameCache = new Map();

  if (itemised) {
    const grouped = await Promise.all(
      transactions.map((transaction) =>
        buildTransactionItemRows(ctx, transaction, cache)
      )
    );
    return grouped.flat();
  }

  return await Promise.all(
    transactions.map((transaction) =>
      buildTransactionExportRow(ctx, transaction, cache)
    )
  );
}

/** All transactions — admin/staff only. */
export const exportTransactions = query({
  args: {
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    itemised: v.optional(v.boolean()),
  },
  handler: async (ctx, { from, to, itemised }) => {
    await requireRole(ctx, ['admin', 'staff']);

    let rows = await ctx.db.query('transactions').order('desc').collect();
    if (from !== undefined) {
      rows = rows.filter((row) => getEffectiveTransactionDate(row) >= from);
    }
    if (to !== undefined) {
      rows = rows.filter((row) => getEffectiveTransactionDate(row) <= to);
    }

    return await buildTransactionExportRows(ctx, rows, itemised);
  },
});

/** Collections (c2b purchases) for the current business — or all if admin/staff. */
export const exportCollections = query({
  args: {
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    itemised: v.optional(v.boolean()),
  },
  handler: async (ctx, { from, to, itemised }) => {
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

    return await buildTransactionExportRows(ctx, rows, itemised);
  },
});

/** Business purchases (as buyer, all types) — scoped to current business. */
export const exportMyPurchases = query({
  args: {
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    itemised: v.optional(v.boolean()),
  },
  handler: async (ctx, { from, to, itemised }) => {
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

    return await buildTransactionExportRows(ctx, rows, itemised);
  },
});

/** Business sales (as seller, B2B only) — scoped to current business. */
export const exportMySales = query({
  args: {
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    itemised: v.optional(v.boolean()),
  },
  handler: async (ctx, { from, to, itemised }) => {
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

    return await buildTransactionExportRows(ctx, rows, itemised);
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
