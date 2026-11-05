import { defineTable, paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';

export default defineTable({
  name: v.string(),
  carbonFactor: v.string(),
  gwCode: v.string(),
  price: v.number(),
});

export const listWithPagination = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { paginationOpts }) => {
    return await ctx.db.query('materials').paginate(paginationOpts);
  },
});

export const list = query({
  handler: async (ctx) => {
    return await ctx.db.query('materials').collect();
  },
});

export const findById = query({
  args: {
    _id: v.id('materials'),
  },
  handler: async (ctx, { _id }) => {
    return await ctx.db.get('materials', _id);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    carbonFactor: v.string(),
    gwCode: v.string(),
    price: v.number(),
  },
  handler: async (ctx, { name, carbonFactor, gwCode, price }) => {
    return await ctx.db.insert('materials', {
      name,
      carbonFactor,
      gwCode,
      price,
    });
  },
});

export const update = mutation({
  args: {
    _id: v.id('materials'),
    name: v.optional(v.string()),
    carbonFactor: v.optional(v.string()),
    gwCode: v.optional(v.string()),
    price: v.optional(v.number()),
  },
  handler: async (ctx, { _id, name, carbonFactor, gwCode, price }) => {
    const existing = await ctx.db.get('materials', _id);

    if (!existing) {
      throw new ConvexError({
        name: 'Not Found',
        message: `Material with id ${_id} not found.`,
      });
    }

    await ctx.db.patch('materials', _id, {
      name: name ?? existing.name,
      carbonFactor: carbonFactor ?? existing.carbonFactor,
      gwCode: gwCode ?? existing.gwCode,
      price: price ?? existing.price,
    });
  },
});

export const remove = mutation({
  args: {
    _id: v.id('materials'),
  },
  handler: async (ctx, { _id }) => {
    const existing = await ctx.db.get('materials', _id);

    if (!existing) {
      throw new ConvexError({
        name: 'Not Found',
        message: `Material with id ${_id} not found.`,
      });
    }

    await ctx.db.delete('materials', _id);
  },
});
