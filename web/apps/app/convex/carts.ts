import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getCurrentUserIdOrThrow } from './users';

export default defineTable({
  buyerId: v.id('users'),
  sellerId: v.id('users'),
  items: v.array(
    v.object({
      stockId: v.id('stock'),
      materialId: v.id('materials'),
    })
  ),
})
  .index('by_buyer_seller', ['buyerId', 'sellerId']);

export const get = query({
  args: { sellerId: v.id('users') },
  handler: async (ctx, { sellerId }) => {
    const buyerId = await getCurrentUserIdOrThrow(ctx);

    const cart = await ctx.db
      .query('carts')
      .withIndex('by_buyer_seller', (q) =>
        q.eq('buyerId', buyerId).eq('sellerId', sellerId)
      )
      .unique();

    if (!cart) return { items: [] };

    // Enrich with stock info for display
    const enriched = await Promise.all(
      cart.items.map(async (item) => {
        const stock = await ctx.db.get(item.stockId);
        const material = stock ? await ctx.db.get(item.materialId) : null;
        return {
          stockId: item.stockId,
          materialId: item.materialId,
          materialName: material?.name ?? 'Unknown',
          weight: stock?.weight ?? 0,
          price: stock?.price ?? 0,
        };
      })
    );

    return { _id: cart._id, items: enriched };
  },
});

export const upsert = mutation({
  args: {
    sellerId: v.id('users'),
    items: v.array(
      v.object({
        stockId: v.id('stock'),
        materialId: v.id('materials'),
      })
    ),
  },
  handler: async (ctx, { sellerId, items }) => {
    const buyerId = await getCurrentUserIdOrThrow(ctx);

    const existing = await ctx.db
      .query('carts')
      .withIndex('by_buyer_seller', (q) =>
        q.eq('buyerId', buyerId).eq('sellerId', sellerId)
      )
      .unique();

    if (existing) {
      if (items.length === 0) {
        await ctx.db.delete(existing._id);
      } else {
        await ctx.db.patch(existing._id, { items });
      }
    } else if (items.length > 0) {
      await ctx.db.insert('carts', { buyerId, sellerId, items });
    }
  },
});

export const clear = mutation({
  args: { sellerId: v.id('users') },
  handler: async (ctx, { sellerId }) => {
    const buyerId = await getCurrentUserIdOrThrow(ctx);

    const existing = await ctx.db
      .query('carts')
      .withIndex('by_buyer_seller', (q) =>
        q.eq('buyerId', buyerId).eq('sellerId', sellerId)
      )
      .unique();

    if (existing) await ctx.db.delete(existing._id);
  },
});
