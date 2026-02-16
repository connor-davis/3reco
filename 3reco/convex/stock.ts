import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineTable({
  ownerId: v.id('users'),
  materialId: v.id('materials'),
  weight: v.number(),
  value: v.number(),
  isListed: v.boolean(),
});
