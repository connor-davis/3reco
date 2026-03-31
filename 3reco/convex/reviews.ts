import { paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getCurrentUserIdOrThrow, getCurrentUserOrThrow } from './users';

/** Returns paginated reviews for a seller store, with reviewer display name. */
export const listBySeller = query({
  args: {
    sellerId: v.id('users'),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { sellerId, paginationOpts }) => {
    const page = await ctx.db
      .query('storeReviews')
      .withIndex('by_seller', (q) => q.eq('sellerId', sellerId))
      .order('desc')
      .paginate(paginationOpts);

    const items = await Promise.all(
      page.page.map(async (review) => {
        const buyer = await ctx.db.get(review.buyerId);
        const displayName =
          buyer?.businessName ||
          [buyer?.firstName, buyer?.lastName].filter(Boolean).join(' ') ||
          buyer?.email ||
          'Anonymous';
        return { ...review, reviewerName: displayName };
      })
    );

    return { ...page, page: items };
  },
});

/** Returns the average rating and review count for a seller. */
export const averageForSeller = query({
  args: { sellerId: v.id('users') },
  handler: async (ctx, { sellerId }) => {
    const reviews = await ctx.db
      .query('storeReviews')
      .withIndex('by_seller', (q) => q.eq('sellerId', sellerId))
      .collect();

    if (reviews.length === 0) return { average: null, count: 0 };
    const sum = reviews.reduce((s, r) => s + r.rating, 0);
    return { average: Math.round((sum / reviews.length) * 10) / 10, count: reviews.length };
  },
});

/**
 * Returns the current user's completed transactions with the given seller
 * that have no review yet (i.e., reviewable transactions).
 */
export const reviewableTransactions = query({
  args: { sellerId: v.id('users') },
  handler: async (ctx, { sellerId }) => {
    const buyerId = await getCurrentUserIdOrThrow(ctx);

    const transactions = await ctx.db
      .query('transactions')
      .withIndex('by_buyerId', (q) => q.eq('buyerId', buyerId))
      .collect();

    const withSeller = transactions.filter((t) => t.sellerId === sellerId);

    // Filter out already-reviewed transactions
    const results = await Promise.all(
      withSeller.map(async (t) => {
        const existing = await ctx.db
          .query('storeReviews')
          .withIndex('by_transaction', (q) => q.eq('transactionId', t._id))
          .first();
        return existing ? null : t;
      })
    );

    return results.filter(Boolean);
  },
});

/** Adds a review for a transaction. One review per transaction, buyer only. */
export const addReview = mutation({
  args: {
    transactionId: v.id('transactions'),
    rating: v.number(),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, { transactionId, rating, comment }) => {
    const buyerId = await getCurrentUserIdOrThrow(ctx);

    if (rating < 1 || rating > 5 || !Number.isInteger(rating))
      throw new ConvexError({ name: 'InvalidRating', message: 'Rating must be a whole number between 1 and 5.' });

    const transaction = await ctx.db.get(transactionId);
    if (!transaction)
      throw new ConvexError({ name: 'NotFound', message: 'Transaction not found.' });
    if (transaction.buyerId !== buyerId)
      throw new ConvexError({ name: 'Forbidden', message: 'You can only review your own transactions.' });

    const existing = await ctx.db
      .query('storeReviews')
      .withIndex('by_transaction', (q) => q.eq('transactionId', transactionId))
      .first();
    if (existing)
      throw new ConvexError({ name: 'AlreadyReviewed', message: 'You have already reviewed this transaction.' });

    await ctx.db.insert('storeReviews', {
      sellerId: transaction.sellerId,
      buyerId,
      transactionId,
      rating,
      comment,
    });
  },
});

/** Removes a review. Admin only. */
export const removeReview = mutation({
  args: { reviewId: v.id('storeReviews') },
  handler: async (ctx, { reviewId }) => {
    const user = await getCurrentUserOrThrow(ctx);
    if (user?.type !== 'admin')
      throw new ConvexError({ name: 'Forbidden', message: 'Only admins can remove reviews.' });

    await ctx.db.delete(reviewId);
  },
});
