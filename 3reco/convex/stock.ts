import { defineTable, paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { zodToConvex } from 'convex-helpers/server/zod';
import { z } from 'zod/v4';
import { zid } from 'convex-helpers/server/zod4';

export default defineTable({
  ownerId: v.id('users'),
  materialId: v.id('materials'),
  weight: v.string(),
  price: v.string(),
  isListed: v.boolean(),
});

export const listWithPagination = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { paginationOpts }) => {
    return await ctx.db.query('stock').paginate(paginationOpts);
  },
});

export const findByStockId = query({
  args: {
    _id: v.id('stock'),
  },
  handler: async (ctx, { _id }) => {
    return await ctx.db.get('stock', _id);
  },
});

export const create = mutation({
  args: zodToConvex(
    z.object({
      materialId: zid('materials'),
      weight: z
        .string({ error: 'Please enter a weight.' })
        .regex(
          /^[+-]?(\d+(\.\d*)?|\.\d+)$/,
          'Please enter a valid weight that is a number or decimal, e.g. 10.5'
        ),
      price: z
        .string({ error: 'Please enter a price.' })
        .regex(
          /^[+-]?(\d+(\.\d*)?|\.\d+)$/,
          'Please enter a valid price that is a number or decimal, e.g. 10.5'
        ),
    })
  ),
  handler: async (ctx, { materialId, weight, price }) => {
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

    return await ctx.db.insert('stock', {
      ownerId: user._id,
      materialId,
      weight,
      price,
      isListed: false,
    });
  },
});

export const update = mutation({
  args: {
    _id: v.id('stock'),
    weight: v.optional(v.string()),
    price: v.optional(v.string()),
    isListed: v.optional(v.boolean()),
  },
  handler: async (ctx, { _id, weight, price, isListed }) => {
    const existing = await ctx.db.get('stock', _id);

    if (!existing) {
      throw new ConvexError({
        name: 'Not Found',
        message: `Stock with id ${_id} not found.`,
      });
    }

    await ctx.db.patch('stock', _id, {
      weight,
      price,
      isListed,
    });
  },
});

export const remove = mutation({
  args: {
    _id: v.id('stock'),
  },
  handler: async (ctx, { _id }) => {
    const existing = await ctx.db.get('stock', _id);

    if (!existing) {
      throw new ConvexError({
        name: 'Not Found',
        message: `Stock with id ${_id} not found.`,
      });
    }

    await ctx.db.delete('stock', _id);
  },
});
