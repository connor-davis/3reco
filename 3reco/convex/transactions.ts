import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineTable({
  sellerId: v.id('users'),
  buyerId: v.id('users'),
  materialId: v.id('materials'),
  weight: v.number(),
  value: v.number(),
  type: v.union(v.literal('b2c'), v.literal('b2b')),
});
