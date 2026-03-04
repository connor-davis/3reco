import { defineTable, paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { mutation, query } from './_generated/server';
import { txByType } from './aggregates';

export const requestItemValidator = v.object({
  materialId: v.id('materials'),
  stockId: v.id('stock'),
  offerWeight: v.optional(v.number()),
  offerPrice: v.optional(v.number()),
});

export default defineTable({
  sellerId: v.id('users'),
  buyerId: v.id('users'),
  // Multi-item requests
  items: v.optional(v.array(requestItemValidator)),
  // Legacy single-item fields
  materialId: v.optional(v.id('materials')),
  status: v.union(
    v.literal('pending'),
    v.literal('offered'),
    v.literal('accepted'),
    v.literal('rejected'),
    v.literal('cancelled')
  ),
  offerWeight: v.optional(v.number()),
  offerPrice: v.optional(v.number()),
})
  .index('by_sellerId', ['sellerId'])
  .index('by_buyerId', ['buyerId'])
  .index('by_status', ['status']);

export const findById = query({
  args: { _id: v.id('transactionRequests') },
  handler: async (ctx, { _id }) => {
    return await ctx.db.get('transactionRequests', _id);
  },
});

export const listBySeller = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity)
      throw new ConvexError({ name: 'Unauthorized', message: 'You are not authorized to access this resource.' });

    const [userId] = identity.subject.split('|');
    return await ctx.db
      .query('transactionRequests')
      .withIndex('by_sellerId', (q) => q.eq('sellerId', userId as Id<'users'>))
      .order('desc')
      .paginate(paginationOpts);
  },
});

export const listByBuyer = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity)
      throw new ConvexError({ name: 'Unauthorized', message: 'You are not authorized to access this resource.' });

    const [userId] = identity.subject.split('|');
    return await ctx.db
      .query('transactionRequests')
      .withIndex('by_buyerId', (q) => q.eq('buyerId', userId as Id<'users'>))
      .order('desc')
      .paginate(paginationOpts);
  },
});

export const create = mutation({
  args: {
    sellerId: v.id('users'),
    items: v.array(v.object({ materialId: v.id('materials'), stockId: v.id('stock') })),
  },
  handler: async (ctx, { sellerId, items }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity)
      throw new ConvexError({ name: 'Unauthorized', message: 'You are not authorized to access this resource.' });

    const [buyerId] = identity.subject.split('|');

    if (buyerId === sellerId)
      throw new ConvexError({ name: 'Invalid Input', message: 'You cannot request your own listing.' });

    if (items.length === 0)
      throw new ConvexError({ name: 'Invalid Input', message: 'At least one item is required.' });

    // Validate each stock item belongs to the seller
    for (const item of items) {
      const stock = await ctx.db.get('stock', item.stockId);
      if (!stock || stock.ownerId !== sellerId)
        throw new ConvexError({ name: 'Invalid Input', message: 'Invalid stock item.' });
    }

    const requestItems = items.map((item) => ({
      materialId: item.materialId,
      stockId: item.stockId,
    }));

    const id = await ctx.db.insert('transactionRequests', {
      sellerId,
      buyerId: buyerId as Id<'users'>,
      items: requestItems,
      // legacy: use first item's materialId for backward compat
      materialId: items[0].materialId,
      status: 'pending',
    });

    const itemCount = items.length;
    const firstMaterial = await ctx.db.get('materials', items[0].materialId);
    const summary = itemCount === 1
      ? firstMaterial?.name ?? 'stock'
      : `${itemCount} materials`;

    await ctx.db.insert('notifications', {
      userId: sellerId,
      type: 'request_received',
      title: 'New request received',
      body: `Someone is interested in your ${summary}.`,
      link: `/market/incoming`,
      read: false,
      dismissed: false,
    });

    return id;
  },
});

export const makeOffer = mutation({
  args: {
    _id: v.id('transactionRequests'),
    offerItems: v.array(v.object({
      materialId: v.id('materials'),
      offerWeight: v.number(),
      offerPrice: v.number(),
    })),
  },
  handler: async (ctx, { _id, offerItems }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity)
      throw new ConvexError({ name: 'Unauthorized', message: 'You are not authorized to access this resource.' });

    const [userId] = identity.subject.split('|');
    const request = await ctx.db.get('transactionRequests', _id);

    if (!request)
      throw new ConvexError({ name: 'Not Found', message: 'Transaction request not found.' });
    if (request.sellerId !== userId)
      throw new ConvexError({ name: 'Unauthorized', message: 'Only the seller can make an offer.' });
    if (request.status !== 'pending')
      throw new ConvexError({ name: 'Invalid Input', message: 'An offer can only be made on a pending request.' });

    const requestItems = request.items ?? (request.materialId
      ? [{ materialId: request.materialId, stockId: '' as Id<'stock'> }]
      : []);

    // Validate each item
    for (const offerItem of offerItems) {
      const material = await ctx.db.get('materials', offerItem.materialId);
      if (!material)
        throw new ConvexError({ name: 'Not Found', message: 'Material not found.' });
      if (offerItem.offerPrice < material.price)
        throw new ConvexError({ name: 'Invalid Input', message: 'Price must be at or above the base material price.' });

      const sellerStock = await ctx.db
        .query('stock')
        .withIndex('by_ownerId_by_materialId', (q) =>
          q.eq('ownerId', request.sellerId).eq('materialId', offerItem.materialId)
        )
        .first();

      if (!sellerStock || sellerStock.weight < offerItem.offerWeight)
        throw new ConvexError({ name: 'Invalid Input', message: 'Insufficient stock to fulfil this offer.' });
    }

    // Merge offer values into request items
    const updatedItems = requestItems.map((item) => {
      const offer = offerItems.find((o) => o.materialId === item.materialId);
      if (offer) {
        return { ...item, offerWeight: offer.offerWeight, offerPrice: offer.offerPrice };
      }
      return item;
    });

    await ctx.db.patch('transactionRequests', _id, {
      status: 'offered',
      items: updatedItems,
      // legacy single-item fields
      offerWeight: offerItems[0]?.offerWeight,
      offerPrice: offerItems[0]?.offerPrice,
    });

    const itemCount = offerItems.length;
    const firstMaterial = await ctx.db.get('materials', offerItems[0].materialId);
    const summary = itemCount === 1 ? firstMaterial?.name ?? 'your request' : `${itemCount} materials`;

    await ctx.db.insert('notifications', {
      userId: request.buyerId,
      type: 'request_accepted',
      title: 'Offer received!',
      body: `The seller has made an offer on your ${summary}. Review and accept to complete the trade.`,
      link: `/market/${_id}`,
      read: false,
      dismissed: false,
    });
  },
});

export const acceptOffer = mutation({
  args: { _id: v.id('transactionRequests') },
  handler: async (ctx, { _id }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity)
      throw new ConvexError({ name: 'Unauthorized', message: 'You are not authorized to access this resource.' });

    const [userId] = identity.subject.split('|');
    const request = await ctx.db.get('transactionRequests', _id);

    if (!request)
      throw new ConvexError({ name: 'Not Found', message: 'Transaction request not found.' });
    if (request.buyerId !== userId)
      throw new ConvexError({ name: 'Unauthorized', message: 'Only the buyer can accept an offer.' });
    if (request.status !== 'offered')
      throw new ConvexError({ name: 'Invalid Input', message: 'There is no active offer to accept.' });

    // Determine items (multi or legacy single-item)
    const requestItems = request.items && request.items.length > 0
      ? request.items
      : (request.materialId && request.offerWeight != null && request.offerPrice != null
          ? [{ materialId: request.materialId, stockId: '' as Id<'stock'>, offerWeight: request.offerWeight, offerPrice: request.offerPrice }]
          : []);

    const offeredItems = requestItems.filter(
      (i) => i.offerWeight != null && i.offerPrice != null
    );

    if (offeredItems.length === 0)
      throw new ConvexError({ name: 'Invalid Input', message: 'Offer details are missing.' });

    // Validate stock for all items
    for (const item of offeredItems) {
      const sellerStock = await ctx.db
        .query('stock')
        .withIndex('by_ownerId_by_materialId', (q) =>
          q.eq('ownerId', request.sellerId).eq('materialId', item.materialId)
        )
        .first();
      if (!sellerStock || sellerStock.weight < item.offerWeight!)
        throw new ConvexError({ name: 'Invalid Input', message: 'Insufficient stock to complete this transaction.' });
    }

    // Build transaction items
    const txItems = offeredItems.map((item) => ({
      materialId: item.materialId,
      weight: item.offerWeight!,
      price: item.offerPrice!,
    }));

    const transactionId = await ctx.db.insert('transactions', {
      sellerId: request.sellerId,
      buyerId: request.buyerId,
      items: txItems,
      totalPrice: txItems.reduce((s, i) => s + i.price * i.weight, 0),
      type: 'b2b',
    });

    const newDoc = await ctx.db.get('transactions', transactionId);
    if (newDoc) {
      await txByType.insert(ctx, newDoc);
    }

    await ctx.scheduler.runAfter(0, internal.invoices.generateForTransaction, {
      transactionId,
    });

    // Update stock for each item
    for (const item of offeredItems) {
      const sellerStock = await ctx.db
        .query('stock')
        .withIndex('by_ownerId_by_materialId', (q) =>
          q.eq('ownerId', request.sellerId).eq('materialId', item.materialId)
        )
        .first();
      const buyerStock = await ctx.db
        .query('stock')
        .withIndex('by_ownerId_by_materialId', (q) =>
          q.eq('ownerId', request.buyerId).eq('materialId', item.materialId)
        )
        .first();

      if (sellerStock) {
        const newSellerWeight = sellerStock.weight - item.offerWeight!;
        await ctx.db.patch('stock', sellerStock._id, {
          weight: newSellerWeight,
          ...(newSellerWeight === 0 ? { isListed: false } : {}),
        });
      }

      if (!buyerStock) {
        await ctx.db.insert('stock', {
          ownerId: request.buyerId,
          materialId: item.materialId,
          weight: item.offerWeight!,
          price: item.offerPrice!,
          isListed: false,
        });
      } else {
        await ctx.db.patch('stock', buyerStock._id, {
          weight: buyerStock.weight + item.offerWeight!,
          price: item.offerPrice!,
        });
      }
    }

    await ctx.db.patch('transactionRequests', _id, { status: 'accepted' });

    const itemCount = offeredItems.length;
    const firstMaterial = await ctx.db.get('materials', offeredItems[0].materialId);
    const summary = itemCount === 1 ? firstMaterial?.name ?? 'stock' : `${itemCount} materials`;

    await ctx.db.insert('notifications', {
      userId: request.sellerId,
      type: 'request_accepted',
      title: 'Offer accepted!',
      body: `Your offer for ${summary} has been accepted. The transaction is complete.`,
      link: `/market/${_id}`,
      read: false,
      dismissed: false,
    });
  },
});

export const declineOffer = mutation({
  args: { _id: v.id('transactionRequests') },
  handler: async (ctx, { _id }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity)
      throw new ConvexError({ name: 'Unauthorized', message: 'You are not authorized to access this resource.' });

    const [userId] = identity.subject.split('|');
    const request = await ctx.db.get('transactionRequests', _id);

    if (!request)
      throw new ConvexError({ name: 'Not Found', message: 'Transaction request not found.' });
    if (request.buyerId !== userId)
      throw new ConvexError({ name: 'Unauthorized', message: 'Only the buyer can decline an offer.' });
    if (request.status !== 'offered')
      throw new ConvexError({ name: 'Invalid Input', message: 'There is no active offer to decline.' });

    await ctx.db.patch('transactionRequests', _id, { status: 'pending' });

    const material = request.materialId ? await ctx.db.get('materials', request.materialId) : null;
    await ctx.db.insert('notifications', {
      userId: request.sellerId,
      type: 'request_rejected',
      title: 'Offer declined',
      body: `The buyer declined your offer for ${material?.name ?? 'stock'}. You can make a new offer or reject the request.`,
      link: `/market/${_id}`,
      read: false,
      dismissed: false,
    });
  },
});

export const withdrawOffer = mutation({
  args: { _id: v.id('transactionRequests') },
  handler: async (ctx, { _id }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity)
      throw new ConvexError({ name: 'Unauthorized', message: 'You are not authorized to access this resource.' });

    const [userId] = identity.subject.split('|');
    const request = await ctx.db.get('transactionRequests', _id);

    if (!request)
      throw new ConvexError({ name: 'Not Found', message: 'Transaction request not found.' });
    if (request.sellerId !== userId)
      throw new ConvexError({ name: 'Unauthorized', message: 'Only the seller can withdraw an offer.' });
    if (request.status !== 'offered')
      throw new ConvexError({ name: 'Invalid Input', message: 'There is no active offer to withdraw.' });

    await ctx.db.patch('transactionRequests', _id, { status: 'pending' });

    const material = request.materialId ? await ctx.db.get('materials', request.materialId) : null;
    await ctx.db.insert('notifications', {
      userId: request.buyerId,
      type: 'request_cancelled',
      title: 'Offer withdrawn',
      body: `The seller withdrew their offer for ${material?.name ?? 'stock'}. Negotiation continues.`,
      link: `/market/${_id}`,
      read: false,
      dismissed: false,
    });
  },
});

export const reject = mutation({
  args: { _id: v.id('transactionRequests') },
  handler: async (ctx, { _id }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity)
      throw new ConvexError({ name: 'Unauthorized', message: 'You are not authorized to access this resource.' });

    const [userId] = identity.subject.split('|');
    const request = await ctx.db.get('transactionRequests', _id);

    if (!request)
      throw new ConvexError({ name: 'Not Found', message: 'Transaction request not found.' });
    if (request.sellerId !== userId)
      throw new ConvexError({ name: 'Unauthorized', message: 'Only the seller can reject this request.' });
    if (request.status !== 'pending' && request.status !== 'offered')
      throw new ConvexError({ name: 'Invalid Input', message: 'This request cannot be rejected in its current state.' });

    await ctx.db.patch('transactionRequests', _id, { status: 'rejected' });

    const material = request.materialId ? await ctx.db.get('materials', request.materialId) : null;
    await ctx.db.insert('notifications', {
      userId: request.buyerId,
      type: 'request_rejected',
      title: 'Request rejected',
      body: `Your request for ${material?.name ?? 'stock'} was not accepted.`,
      link: `/market/outgoing`,
      read: false,
      dismissed: false,
    });
  },
});

export const cancel = mutation({
  args: { _id: v.id('transactionRequests') },
  handler: async (ctx, { _id }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity)
      throw new ConvexError({ name: 'Unauthorized', message: 'You are not authorized to access this resource.' });

    const [userId] = identity.subject.split('|');
    const request = await ctx.db.get('transactionRequests', _id);

    if (!request)
      throw new ConvexError({ name: 'Not Found', message: 'Transaction request not found.' });
    if (request.buyerId !== userId)
      throw new ConvexError({ name: 'Unauthorized', message: 'Only the buyer can cancel this request.' });
    if (request.status !== 'pending' && request.status !== 'offered')
      throw new ConvexError({ name: 'Invalid Input', message: 'This request cannot be cancelled in its current state.' });

    await ctx.db.patch('transactionRequests', _id, { status: 'cancelled' });

    const material = request.materialId ? await ctx.db.get('materials', request.materialId) : null;
    await ctx.db.insert('notifications', {
      userId: request.sellerId,
      type: 'request_cancelled',
      title: 'Request cancelled',
      body: `A buyer cancelled their request for ${material?.name ?? 'stock'}.`,
      link: `/market/incoming`,
      read: false,
      dismissed: false,
    });
  },
});
