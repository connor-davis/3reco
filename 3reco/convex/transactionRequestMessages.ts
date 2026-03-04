import { defineTable } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';

export default defineTable({
  transactionId: v.id('transactionRequests'),
  senderId: v.id('users'),
  content: v.string(),
}).index('by_transactionId', ['transactionId']);

export const listByRequest = query({
  args: { transactionId: v.id('transactionRequests') },
  handler: async (ctx, { transactionId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity)
      throw new ConvexError({ name: 'Unauthorized', message: 'You are not authorized to access this resource.' });

    return await ctx.db
      .query('transactionRequestMessages')
      .withIndex('by_transactionId', (q) => q.eq('transactionId', transactionId))
      .order('asc')
      .collect();
  },
});

export const send = mutation({
  args: {
    transactionId: v.id('transactionRequests'),
    content: v.string(),
  },
  handler: async (ctx, { transactionId, content }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity)
      throw new ConvexError({ name: 'Unauthorized', message: 'You are not authorized to access this resource.' });

    const [userId] = identity.subject.split('|');
    const request = await ctx.db.get('transactionRequests', transactionId);

    if (!request)
      throw new ConvexError({ name: 'Not Found', message: 'Transaction request not found.' });
    if (request.status !== 'pending')
      throw new ConvexError({ name: 'Invalid Input', message: 'Cannot send messages on a closed request.' });
    if (request.sellerId !== userId && request.buyerId !== userId)
      throw new ConvexError({ name: 'Unauthorized', message: 'You are not a participant in this request.' });

    await ctx.db.insert('transactionRequestMessages', {
      transactionId,
      senderId: userId as Id<'users'>,
      content,
    });

    const recipientId = request.sellerId === (userId as Id<'users'>) ? request.buyerId : request.sellerId;
    await ctx.db.insert('notifications', {
      userId: recipientId,
      type: 'message_received',
      title: 'New message',
      body: content.length > 60 ? content.slice(0, 57) + '…' : content,
      link: `/market/${transactionId}`,
      read: false,
      dismissed: false,
    });
  },
});
