import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineTable({
  name: v.string(),
  carbonFactor: v.string(),
  gwCode: v.string(),
});
