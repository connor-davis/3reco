import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import { mutation } from './_generated/server';

export default defineTable({
  name: v.string(),
  carbonFactor: v.string(),
  gwCode: v.string(),
  price: v.string(),
});

export const create = mutation({
  args: {
    name: v.string(),
    carbonFactor: v.string(),
    gwCode: v.string(),
    price: v.string(),
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
