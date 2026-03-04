import { defineTable, paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';

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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity)
      throw new ConvexError({ name: 'Unauthorized', message: 'You are not authorized to access this resource.' });

    const [userId] = identity.subject.split('|');
    return await ctx.db
      .query('notifications')
      .withIndex('by_userId_dismissed', (q) =>
        q.eq('userId', userId as Id<'users'>).eq('dismissed', false)
      )
      .order('desc')
      .paginate(paginationOpts);
  },
});

export const unreadCount = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return 0;

    const [userId] = identity.subject.split('|');
    const notifications = await ctx.db
      .query('notifications')
      .withIndex('by_userId_dismissed', (q) =>
        q.eq('userId', userId as Id<'users'>).eq('dismissed', false)
      )
      .collect();

    return notifications.filter((n) => !n.read).length;
  },
});

export const markRead = mutation({
  args: { _id: v.id('notifications') },
  handler: async (ctx, { _id }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity)
      throw new ConvexError({ name: 'Unauthorized', message: 'You are not authorized to access this resource.' });

    const [userId] = identity.subject.split('|');
    const notification = await ctx.db.get('notifications', _id);

    if (!notification || notification.userId !== (userId as Id<'users'>))
      throw new ConvexError({ name: 'Unauthorized', message: 'Not your notification.' });

    await ctx.db.patch('notifications', _id, { read: true });
  },
});

export const markAllRead = mutation({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity)
      throw new ConvexError({ name: 'Unauthorized', message: 'You are not authorized to access this resource.' });

    const [userId] = identity.subject.split('|');
    const unread = await ctx.db
      .query('notifications')
      .withIndex('by_userId_dismissed', (q) =>
        q.eq('userId', userId as Id<'users'>).eq('dismissed', false)
      )
      .filter((q) => q.eq(q.field('read'), false))
      .collect();

    await Promise.all(unread.map((n) => ctx.db.patch('notifications', n._id, { read: true })));
  },
});

export const dismiss = mutation({
  args: { _id: v.id('notifications') },
  handler: async (ctx, { _id }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity)
      throw new ConvexError({ name: 'Unauthorized', message: 'You are not authorized to access this resource.' });

    const [userId] = identity.subject.split('|');
    const notification = await ctx.db.get('notifications', _id);

    if (!notification || notification.userId !== (userId as Id<'users'>))
      throw new ConvexError({ name: 'Unauthorized', message: 'Not your notification.' });

    await ctx.db.patch('notifications', _id, { read: true, dismissed: true });
  },
});

export const dismissAll = mutation({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity)
      throw new ConvexError({ name: 'Unauthorized', message: 'You are not authorized to access this resource.' });

    const [userId] = identity.subject.split('|');
    const active = await ctx.db
      .query('notifications')
      .withIndex('by_userId_dismissed', (q) =>
        q.eq('userId', userId as Id<'users'>).eq('dismissed', false)
      )
      .collect();

    await Promise.all(
      active.map((n) => ctx.db.patch('notifications', n._id, { read: true, dismissed: true }))
    );
  },
});
