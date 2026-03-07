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

export default defineTable({
  sellerId: v.id('users'),
  buyerId: v.id('users'),
  items: v.array(txItemValidator),
  totalPrice: v.number(),
  type: v.union(v.literal('c2b'), v.literal('b2b')),
  invoiceStorageId: v.optional(v.id('_storage')),
})
  .index('by_sellerId', ['sellerId'])
  .index('by_buyerId', ['buyerId'])
  .index('by_type', ['type'])
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

    const user = await ctx.db
      .query('users')
      .withIndex('workosUserId', (q) => q.eq('workosUserId', identity.subject))
      .first();

    if (!user)
      throw new ConvexError({
        name: 'Not Found',
        message: 'The user was not found.',
      });

    if (user.role === 'business') {
      return await ctx.db
        .query('transactions')
        .withIndex('by_buyerId', (q) =>
          q.eq('buyerId', user._id)
        )
        .order('desc')
        .paginate(paginationOpts);
    }

    if (user.role === 'collector') {
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

    const user = await ctx.db
      .query('users')
      .withIndex('workosUserId', (q) => q.eq('workosUserId', identity.subject))
      .first();

    if (!user)
      throw new ConvexError({
        name: 'Not Found',
        message: 'The user was not found.',
      });

    if (user.role === 'business') {
      return await ctx.db
        .query('transactions')
        .withIndex('by_buyerId', (q) =>
          q.eq('buyerId', user._id)
        )
        .collect();
    }

    if (user.role === 'collector') {
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

    const user = await ctx.db
      .query('users')
      .withIndex('workosUserId', (q) => q.eq('workosUserId', identity.subject))
      .first();

    if (!user)
      throw new ConvexError({
        name: 'Not Found',
        message: 'The user was not found.',
      });

    if (user.role === 'collector' || user.role === 'business') {
      return await ctx.db
        .query('transactions')
        .withIndex('by_sellerId_and_type', (q) =>
          q.eq('sellerId', user._id).eq('type', user.role === 'business' ? 'b2b' : 'c2b')
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

    const user = await ctx.db
      .query('users')
      .withIndex('workosUserId', (q) => q.eq('workosUserId', identity.subject))
      .first();

    if (!user)
      throw new ConvexError({
        name: 'Not Found',
        message: 'The user was not found.',
      });

    if (user.role === 'collector' || user.role === 'business') {
      return await ctx.db
        .query('transactions')
        .withIndex('by_sellerId_and_type', (q) =>
          q.eq('sellerId', user._id).eq('type', user.role === 'business' ? 'b2b' : 'c2b')
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

    const callerUser = await ctx.db
      .query('users')
      .withIndex('workosUserId', (q) => q.eq('workosUserId', identity.subject))
      .first();
    if (!callerUser)
      throw new ConvexError({ name: 'Not Found', message: 'The user was not found.' });
    const businessId = callerUser._id;

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

    const totalPrice = items.reduce((s, i) => s + i.price * i.weight, 0);
    const transactionId = await ctx.db.insert('transactions', {
      buyerId: businessId,
      sellerId: collectorId,
      items,
      totalPrice,
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
          q.eq('ownerId', businessId).eq('materialId', item.materialId)
        )
        .first();

      if (!existingStock) {
        await ctx.db.insert('stock', {
          ownerId: businessId,
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

    const callerUser = await ctx.db
      .query('users')
      .withIndex('workosUserId', (q) => q.eq('workosUserId', identity.subject))
      .first();
    if (!callerUser)
      throw new ConvexError({ name: 'Not Found', message: 'The user was not found.' });
    const sellerId = callerUser._id;

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
          q.eq('ownerId', sellerId).eq('materialId', item.materialId)
        )
        .first();

      if (!existingSellerStock || existingSellerStock.weight < item.weight)
        throw new ConvexError({
          name: 'Invalid Input',
          message: 'Insufficient stock to complete this transaction.',
        });
    }

    const totalPrice = items.reduce((s, i) => s + i.price * i.weight, 0);
    const transactionId = await ctx.db.insert('transactions', {
      buyerId: businessId,
      sellerId: sellerId,
      items,
      totalPrice,
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
          q.eq('ownerId', sellerId).eq('materialId', item.materialId)
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
