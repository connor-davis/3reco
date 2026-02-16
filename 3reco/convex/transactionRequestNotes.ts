import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineTable({
  transactionId: v.id('transactionRequests'),
  content: v.string(),
});
