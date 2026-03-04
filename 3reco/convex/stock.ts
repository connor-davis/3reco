import { defineTable, paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';

export default defineTable({
  ownerId: v.id('users'),
  materialId: v.id('materials'),
  weight: v.number(),
  price: v.number(),
  isListed: v.boolean(),
})
  .index('by_ownerId', ['ownerId'])
  .index('by_materialId', ['materialId'])
  .index('by_ownerId_by_materialId', ['ownerId', 'materialId'])
  .index('by_isListed', ['isListed']);

export const listListed = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity)
      throw new ConvexError({ name: 'Unauthorized', message: 'You are not authorized to access this resource.' });

    const [userId] = identity.subject.split('|');

    const result = await ctx.db
      .query('stock')
      .withIndex('by_isListed', (q) => q.eq('isListed', true))
      .order('desc')
      .paginate(paginationOpts);

    return {
      ...result,
      page: result.page.filter((s) => s.ownerId !== (userId as Id<'users'>)),
    };
  },
});

export const listWithPagination = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { paginationOpts }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity)
      throw new ConvexError({ name: 'Unauthorized', message: 'You are not authorized to access this resource.' });

    const [userId] = identity.subject.split('|');
    return await ctx.db
      .query('stock')
      .withIndex('by_ownerId', (q) => q.eq('ownerId', userId as Id<'users'>))
      .paginate(paginationOpts);
  },
});

export const list = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity)
      throw new ConvexError({ name: 'Unauthorized', message: 'You are not authorized to access this resource.' });

    const [userId] = identity.subject.split('|');
    return await ctx.db
      .query('stock')
      .withIndex('by_ownerId', (q) => q.eq('ownerId', userId as Id<'users'>))
      .collect();
  },
});

export const listListedBySeller = query({
  args: { sellerId: v.id('users') },
  handler: async (ctx, { sellerId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity)
      throw new ConvexError({ name: 'Unauthorized', message: 'You are not authorized to access this resource.' });

    return await ctx.db
      .query('stock')
      .withIndex('by_ownerId', (q) => q.eq('ownerId', sellerId))
      .filter((q) => q.eq(q.field('isListed'), true))
      .collect();
  },
});

export const listSellersWithStock = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity)
      throw new ConvexError({ name: 'Unauthorized', message: 'You are not authorized to access this resource.' });

    const [userId] = identity.subject.split('|');

    const allListed = await ctx.db
      .query('stock')
      .withIndex('by_isListed', (q) => q.eq('isListed', true))
      .collect();

    const othersStock = allListed.filter((s) => s.ownerId !== (userId as Id<'users'>));

    const byOwner = new Map<Id<'users'>, typeof othersStock>();
    for (const s of othersStock) {
      if (!byOwner.has(s.ownerId)) byOwner.set(s.ownerId, []);
      byOwner.get(s.ownerId)!.push(s);
    }

    const sellers = await Promise.all(
      Array.from(byOwner.entries()).map(async ([ownerId, items]) => {
        const owner = await ctx.db.get('users', ownerId);
        const materialIds = [...new Set(items.map((i) => i.materialId))];
        const materials = await Promise.all(materialIds.map((id) => ctx.db.get('materials', id)));
        return {
          _id: ownerId,
          displayName: (owner?.businessName ??
            (`${owner?.firstName ?? ''} ${owner?.lastName ?? ''}`.trim() || 'Unknown')),
          itemCount: items.length,
          materialNames: materials.filter(Boolean).map((m) => m!.name),
        };
      })
    );

    return sellers;
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
  args: {
    materialId: v.id('materials'),
    weight: v.number(),
    price: v.number(),
  },
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

    const material = await ctx.db.get('materials', materialId);

    if (!material) {
      throw new ConvexError({
        name: 'Not Found',
        message: `Material with id ${materialId} not found.`,
      });
    }

    if (price < material.price) {
      throw new ConvexError({
        name: 'Invalid Input',
        message: `The price of the stock must be greater than or equal to the price of the material.`,
      });
    }

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
    weight: v.optional(v.number()),
    price: v.optional(v.number()),
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

    const material = await ctx.db.get('materials', existing.materialId);

    if (!material) {
      throw new ConvexError({
        name: 'Not Found',
        message: `Material with id ${existing.materialId} not found.`,
      });
    }

    if (!price) {
      price = existing.price;
    }

    if (price < material.price) {
      throw new ConvexError({
        name: 'Invalid Input',
        message: `The price of the stock must be greater than or equal to the price of the material.`,
      });
    }

    await ctx.db.patch('stock', _id, {
      ...(weight !== undefined ? { weight } : {}),
      price,
      ...(isListed !== undefined ? { isListed } : {}),
    });

    if (isListed !== undefined && isListed !== existing.isListed) {
      await ctx.db.insert('notifications', {
        userId: existing.ownerId,
        type: isListed ? 'stock_listed' : 'stock_unlisted',
        title: isListed ? 'Stock listed on market' : 'Stock removed from market',
        body: `Your ${material.name} stock is now ${isListed ? 'visible on the market' : 'hidden from the market'}.`,
        link: '/stock',
        read: false,
        dismissed: false,
      });
    }
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
