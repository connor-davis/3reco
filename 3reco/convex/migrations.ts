import { internalMutation } from './_generated/server';
import { txByType, txByMaterial } from './aggregates';

/**
 * One-time backfill: call this via the Convex dashboard or CLI to populate
 * the aggregate data structures for all existing transactions.
 *
 * Run ONCE after first deployment with:
 *   npx convex run migrations:backfillAggregates --no-push
 */
export const backfillAggregates = internalMutation({
  handler: async (ctx) => {
    const all = await ctx.db.query('transactions').collect();
    let count = 0;
    for (const doc of all) {
      await txByType.insert(ctx, doc);
      // Only insert into txByMaterial for legacy single-item transactions
      if (doc.materialId) {
        await txByMaterial.insert(ctx, doc);
      }
      count++;
    }
    return { backfilled: count };
  },
});
