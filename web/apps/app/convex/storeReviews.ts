import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineTable({
  sellerId: v.id('users'),
  buyerId: v.id('users'),
  transactionId: v.id('transactions'),
  rating: v.number(), // 1–5
  comment: v.optional(v.string()),
})
  .index('by_seller', ['sellerId'])
  .index('by_transaction', ['transactionId']);
