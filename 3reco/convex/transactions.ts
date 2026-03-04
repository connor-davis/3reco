import { defineTable, paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { mutation, query } from './_generated/server';
import { txByType } from './aggregates';

export const txItemValidator = v.object({
  materialId: v.id('materials'),
  weight: v.number(),
  price: v.number(),
});

/** Normalise both legacy (materialId/weight/price) and new (items) transactions. */
export function getTransactionItems(t: {
  items?: Array<{ materialId: Id<'materials'>; weight: number; price: number }>;
  materialId?: Id<'materials'>;
  weight?: number;
  price?: number;
}): Array<{ materialId: Id<'materials'>; weight: number; price: number }> {
  if (t.items && t.items.length > 0) return t.items;
  if (t.materialId) return [{ materialId: t.materialId, weight: t.weight!, price: t.price! }];
  return [];
}

export default defineTable({
  sellerId: v.id('users'),
  buyerId: v.id('users'),
  // Multi-item transactions
  items: v.optional(v.array(txItemValidator)),
  // Legacy single-item fields (kept for backward compatibility)
  materialId: v.optional(v.id('materials')),
  weight: v.optional(v.number()),
  price: v.optional(v.number()),
  type: v.union(v.literal('c2b'), v.literal('b2b')),
  invoiceStorageId: v.optional(v.id('_storage')),
})
  .index('by_sellerId', ['sellerId'])
  .index('by_buyerId', ['buyerId'])
  .index('by_type', ['type'])
  .index('by_materialId', ['materialId'])
  .index('by_sellerId_and_type', ['sellerId', 'type'])
  .index('by_buyerId_and_type', ['buyerId', 'type']);

export const listExpensesWithPagination = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { paginationOpts }) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity)
      throw new ConvexError({
        name: 'Unauthorized',
        message: 'You are not authorized to access this resource.',
      });

    const [userId] = identity.subject.split('|');
    const user = await ctx.db.get('users', userId as Id<'users'>);

    if (!user)
      throw new ConvexError({
        name: 'Not Found',
        message: 'The user was not found.',
      });

    if (user.type === 'business') {
      return await ctx.db
        .query('transactions')
        .withIndex('by_buyerId_and_type', (q) =>
          q.eq('buyerId', userId as Id<'users'>).eq('type', 'c2b')
        )
        .order('desc')
        .paginate(paginationOpts);
    }

    if (user.type === 'collector') {
      throw new ConvexError({
        name: 'Unauthorized',
        message: 'Collectors are not authorized to access this resource.',
      });
    }

    return await ctx.db
      .query('transactions')
      .order('desc')
      .paginate(paginationOpts);
  },
});

export const listExpenses = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity)
      throw new ConvexError({
        name: 'Unauthorized',
        message: 'You are not authorized to access this resource.',
      });

    const [userId] = identity.subject.split('|');
    const user = await ctx.db.get('users', userId as Id<'users'>);

    if (!user)
      throw new ConvexError({
        name: 'Not Found',
        message: 'The user was not found.',
      });

    if (user.type === 'business') {
      return await ctx.db
        .query('transactions')
        .withIndex('by_buyerId_and_type', (q) =>
          q.eq('buyerId', userId as Id<'users'>).eq('type', 'c2b')
        )
        .collect();
    }

    if (user.type === 'collector') {
      throw new ConvexError({
        name: 'Unauthorized',
        message: 'Collectors are not authorized to access this resource.',
      });
    }

    return await ctx.db.query('transactions').order('desc').collect();
  },
});

export const listSalesWithPagination = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { paginationOpts }) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity)
      throw new ConvexError({
        name: 'Unauthorized',
        message: 'You are not authorized to access this resource.',
      });

    const [userId] = identity.subject.split('|');
    const user = await ctx.db.get('users', userId as Id<'users'>);

    if (!user)
      throw new ConvexError({
        name: 'Not Found',
        message: 'The user was not found.',
      });

    if (user.type === 'collector' || user.type === 'business') {
      return await ctx.db
        .query('transactions')
        .withIndex('by_sellerId_and_type', (q) =>
          q.eq('sellerId', userId as Id<'users'>).eq('type', 'c2b')
        )
        .order('desc')
        .paginate(paginationOpts);
    }

    return await ctx.db
      .query('transactions')
      .order('desc')
      .paginate(paginationOpts);
  },
});

export const listSales = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity)
      throw new ConvexError({
        name: 'Unauthorized',
        message: 'You are not authorized to access this resource.',
      });

    const [userId] = identity.subject.split('|');
    const user = await ctx.db.get('users', userId as Id<'users'>);

    if (!user)
      throw new ConvexError({
        name: 'Not Found',
        message: 'The user was not found.',
      });

    if (user.type === 'collector' || user.type === 'business') {
      return await ctx.db
        .query('transactions')
        .withIndex('by_sellerId_and_type', (q) =>
          q.eq('sellerId', userId as Id<'users'>).eq('type', 'c2b')
        )
        .order('desc')
        .collect();
    }

    return await ctx.db.query('transactions').order('desc').collect();
  },
});

export const listWithPagination = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { paginationOpts }) => {
    return await ctx.db
      .query('transactions')
      .order('desc')
      .paginate(paginationOpts);
  },
});

export const list = query({
  handler: async (ctx) => {
    return await ctx.db.query('transactions').order('desc').collect();
  },
});

export const findById = query({
  args: {
    _id: v.id('transactions'),
  },
  handler: async (ctx, { _id }) => {
    return await ctx.db.get('transactions', _id);
  },
});

export const collectorToBusinessSale = mutation({
  args: {
    collectorId: v.id('users'),
    items: v.array(txItemValidator),
  },
  handler: async (ctx, { collectorId, items }) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity)
      throw new ConvexError({
        name: 'Unauthorized',
        message: 'You are not authorized to access this resource.',
      });

    const [businessId] = identity.subject.split('|');

    // Validate all items
    for (const item of items) {
      const existingMaterial = await ctx.db.get('materials', item.materialId);
      if (!existingMaterial)
        throw new ConvexError({ name: 'Not Found', message: `Material not found.` });
      if (item.price < existingMaterial.price)
        throw new ConvexError({
          name: 'Invalid Input',
          message: `Price must be at or above the base material price.`,
        });
    }

    const transactionId = await ctx.db.insert('transactions', {
      buyerId: businessId as Id<'users'>,
      sellerId: collectorId,
      items,
      type: 'c2b',
    });

    const newDoc = await ctx.db.get('transactions', transactionId);
    if (newDoc) {
      await txByType.insert(ctx, newDoc);
    }

    // Upsert stock for each item
    for (const item of items) {
      const existingStock = await ctx.db
        .query('stock')
        .withIndex('by_ownerId_by_materialId', (q) =>
          q.eq('ownerId', businessId as Id<'users'>).eq('materialId', item.materialId)
        )
        .first();

      if (!existingStock) {
        await ctx.db.insert('stock', {
          ownerId: businessId as Id<'users'>,
          materialId: item.materialId,
          weight: item.weight,
          price: item.price,
          isListed: false,
        });
      } else {
        await ctx.db.patch('stock', existingStock._id, {
          weight: existingStock.weight + item.weight,
          price: item.price,
        });
      }
    }

    await ctx.scheduler.runAfter(0, internal.invoices.generateForTransaction, {
      transactionId,
    });
  },
});

export const businessToBusinessSale= mutation({
  args: {
    businessId: v.id('users'),
    items: v.array(txItemValidator),
  },
  handler: async (ctx, { businessId, items }) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity)
      throw new ConvexError({
        name: 'Unauthorized',
        message: 'You are not authorized to access this resource.',
      });

    const [sellerId] = identity.subject.split('|');

    // Validate all items
    for (const item of items) {
      const existingMaterial = await ctx.db.get('materials', item.materialId);
      if (!existingMaterial)
        throw new ConvexError({ name: 'Not Found', message: `Material not found.` });
      if (item.price < existingMaterial.price)
        throw new ConvexError({
          name: 'Invalid Input',
          message: `Price must be at or above the base material price.`,
        });

      const existingSellerStock = await ctx.db
        .query('stock')
        .withIndex('by_ownerId_by_materialId', (q) =>
          q.eq('ownerId', sellerId as Id<'users'>).eq('materialId', item.materialId)
        )
        .first();

      if (!existingSellerStock || existingSellerStock.weight < item.weight)
        throw new ConvexError({
          name: 'Invalid Input',
          message: 'Insufficient stock to complete this transaction.',
        });
    }

    const transactionId = await ctx.db.insert('transactions', {
      buyerId: businessId,
      sellerId: sellerId as Id<'users'>,
      items,
      type: 'b2b',
    });

    const newDoc = await ctx.db.get('transactions', transactionId);
    if (newDoc) {
      await txByType.insert(ctx, newDoc);
    }

    // Update stock for each item
    for (const item of items) {
      const existingSellerStock = await ctx.db
        .query('stock')
        .withIndex('by_ownerId_by_materialId', (q) =>
          q.eq('ownerId', sellerId as Id<'users'>).eq('materialId', item.materialId)
        )
        .first();

      const existingBuyerStock = await ctx.db
        .query('stock')
        .withIndex('by_ownerId_by_materialId', (q) =>
          q.eq('ownerId', businessId).eq('materialId', item.materialId)
        )
        .first();

      if (existingSellerStock) {
        await ctx.db.patch('stock', existingSellerStock._id, {
          weight: existingSellerStock.weight - item.weight,
        });
      }

      if (!existingBuyerStock) {
        await ctx.db.insert('stock', {
          ownerId: businessId,
          materialId: item.materialId,
          weight: item.weight,
          price: item.price,
          isListed: false,
        });
      } else {
        await ctx.db.patch('stock', existingBuyerStock._id, {
          weight: existingBuyerStock.weight + item.weight,
          price: item.price,
        });
      }
    }

    await ctx.scheduler.runAfter(0, internal.invoices.generateForTransaction, {
      transactionId,
    });
  },
});
