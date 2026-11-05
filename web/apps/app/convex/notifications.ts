import { defineTable, paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getCurrentUserIdOrThrow } from './users';

export default defineTable({
  userId: v.id('users'),
  type: v.union(
    v.literal('request_received'),
    v.literal('request_accepted'),
    v.literal('request_rejected'),
    v.literal('request_cancelled'),
    v.literal('message_received'),
    v.literal('stock_listed'),
    v.literal('stock_unlisted')
  ),
  title: v.string(),
  body: v.string(),
  link: v.optional(v.string()),
  read: v.boolean(),
  dismissed: v.boolean(),
})
  .index('by_userId', ['userId'])
  .index('by_userId_dismissed', ['userId', 'dismissed']);

export const listForUser = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const userId = await getCurrentUserIdOrThrow(ctx);
    return await ctx.db
      .query('notifications')
      .withIndex('by_userId_dismissed', (q) =>
        q.eq('userId', userId).eq('dismissed', false)
      )
      .order('desc')
      .paginate(paginationOpts);
  },
});

export const unreadCount = query({
  handler: async (ctx) => {
    const userId = await getCurrentUserIdOrThrow(ctx);
    const notifications = await ctx.db
      .query('notifications')
      .withIndex('by_userId_dismissed', (q) =>
        q.eq('userId', userId).eq('dismissed', false)
      )
      .collect();

    return notifications.filter((n) => !n.read).length;
  },
});

export const markRead = mutation({
  args: { _id: v.id('notifications') },
  handler: async (ctx, { _id }) => {
    const userId = await getCurrentUserIdOrThrow(ctx);
    const notification = await ctx.db.get('notifications', _id);

    if (!notification || notification.userId !== userId)
      throw new ConvexError({ name: 'Unauthorized', message: 'Not your notification.' });

    await ctx.db.patch('notifications', _id, { read: true });
  },
});

export const markAllRead = mutation({
  handler: async (ctx) => {
    const userId = await getCurrentUserIdOrThrow(ctx);
    const unread = await ctx.db
      .query('notifications')
      .withIndex('by_userId_dismissed', (q) =>
        q.eq('userId', userId).eq('dismissed', false)
      )
      .filter((q) => q.eq(q.field('read'), false))
      .collect();

    await Promise.all(unread.map((n) => ctx.db.patch('notifications', n._id, { read: true })));
  },
});

export const dismiss = mutation({
  args: { _id: v.id('notifications') },
  handler: async (ctx, { _id }) => {
    const userId = await getCurrentUserIdOrThrow(ctx);
    const notification = await ctx.db.get('notifications', _id);

    if (!notification || notification.userId !== userId)
      throw new ConvexError({ name: 'Unauthorized', message: 'Not your notification.' });

    await ctx.db.patch('notifications', _id, { read: true, dismissed: true });
  },
});

export const dismissAll = mutation({
  handler: async (ctx) => {
    const userId = await getCurrentUserIdOrThrow(ctx);
    const active = await ctx.db
      .query('notifications')
      .withIndex('by_userId_dismissed', (q) =>
        q.eq('userId', userId).eq('dismissed', false)
      )
      .collect();

    await Promise.all(
      active.map((n) => ctx.db.patch('notifications', n._id, { read: true, dismissed: true }))
    );
  },
});
