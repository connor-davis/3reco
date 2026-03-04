import { defineTable, paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { mutation, query } from './_generated/server';
import { txByType, txByMaterial } from './aggregates';

export default defineTable({
  sellerId: v.id('users'),
  buyerId: v.id('users'),
  materialId: v.id('materials'),
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
    materialId: v.id('materials'),
  },
  handler: async (ctx, { sellerId, materialId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity)
      throw new ConvexError({ name: 'Unauthorized', message: 'You are not authorized to access this resource.' });

    const [buyerId] = identity.subject.split('|');

    if (buyerId === sellerId)
      throw new ConvexError({ name: 'Invalid Input', message: 'You cannot request your own listing.' });

    const id = await ctx.db.insert('transactionRequests', {
      sellerId,
      buyerId: buyerId as Id<'users'>,
      materialId,
      status: 'pending',
    });

    const material = await ctx.db.get('materials', materialId);
    await ctx.db.insert('notifications', {
      userId: sellerId,
      type: 'request_received',
      title: 'New request received',
      body: `Someone is interested in your ${material?.name ?? 'stock'}.`,
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
    weight: v.number(),
    price: v.number(),
  },
  handler: async (ctx, { _id, weight, price }) => {
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

    const material = await ctx.db.get('materials', request.materialId);
    if (!material)
      throw new ConvexError({ name: 'Not Found', message: 'Material not found.' });
    if (price < material.price)
      throw new ConvexError({ name: 'Invalid Input', message: 'Price must be at or above the base material price.' });

    const sellerStock = await ctx.db
      .query('stock')
      .withIndex('by_ownerId_by_materialId', (q) =>
        q.eq('ownerId', request.sellerId).eq('materialId', request.materialId)
      )
      .first();

    if (!sellerStock || sellerStock.weight < weight)
      throw new ConvexError({ name: 'Invalid Input', message: 'Insufficient stock to fulfil this offer.' });

    await ctx.db.patch('transactionRequests', _id, {
      status: 'offered',
      offerWeight: weight,
      offerPrice: price,
    });

    await ctx.db.insert('notifications', {
      userId: request.buyerId,
      type: 'request_accepted',
      title: 'Offer received!',
      body: `The seller has made an offer on your ${material.name} request. Review and accept to complete the trade.`,
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
    if (request.offerWeight == null || request.offerPrice == null)
      throw new ConvexError({ name: 'Invalid Input', message: 'Offer details are missing.' });

    const { offerWeight: weight, offerPrice: price } = request;

    const material = await ctx.db.get('materials', request.materialId);
    if (!material)
      throw new ConvexError({ name: 'Not Found', message: 'Material not found.' });

    const sellerStock = await ctx.db
      .query('stock')
      .withIndex('by_ownerId_by_materialId', (q) =>
        q.eq('ownerId', request.sellerId).eq('materialId', request.materialId)
      )
      .first();

    if (!sellerStock || sellerStock.weight < weight)
      throw new ConvexError({ name: 'Invalid Input', message: 'Insufficient stock to complete this transaction.' });

    const buyerStock = await ctx.db
      .query('stock')
      .withIndex('by_ownerId_by_materialId', (q) =>
        q.eq('ownerId', request.buyerId).eq('materialId', request.materialId)
      )
      .first();

    const transactionId = await ctx.db.insert('transactions', {
      sellerId: request.sellerId,
      buyerId: request.buyerId,
      materialId: request.materialId,
      weight,
      price,
      type: 'b2b',
    });

    const newDoc = await ctx.db.get('transactions', transactionId);
    if (newDoc) {
      await txByType.insert(ctx, newDoc);
      await txByMaterial.insert(ctx, newDoc);
    }

    await ctx.scheduler.runAfter(0, internal.invoices.generateForTransaction, {
      transactionId,
    });

    const newSellerWeight = sellerStock.weight - weight;
    await ctx.db.patch('stock', sellerStock._id, {
      weight: newSellerWeight,
      ...(newSellerWeight === 0 ? { isListed: false } : {}),
    });

    if (!buyerStock) {
      await ctx.db.insert('stock', {
        ownerId: request.buyerId,
        materialId: request.materialId,
        weight,
        price,
        isListed: false,
      });
    } else {
      await ctx.db.patch('stock', buyerStock._id, {
        weight: buyerStock.weight + weight,
        price,
      });
    }

    await ctx.db.patch('transactionRequests', _id, { status: 'accepted' });

    await ctx.db.insert('notifications', {
      userId: request.sellerId,
      type: 'request_accepted',
      title: 'Offer accepted!',
      body: `Your offer for ${material.name} has been accepted. The transaction is complete.`,
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

    const material = await ctx.db.get('materials', request.materialId);
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

    const material = await ctx.db.get('materials', request.materialId);
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

    const material = await ctx.db.get('materials', request.materialId);
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

    const material = await ctx.db.get('materials', request.materialId);
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
