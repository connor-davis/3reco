import { Migrations } from '@convex-dev/migrations';
import { internalMutation } from './_generated/server';
import type { DataModel } from './_generated/dataModel';
import { components } from './_generated/api';
import { txByType } from './aggregates';

export const migrations = new Migrations<DataModel>(components.migrations);
export const run = migrations.runner();

/**
 * One-time backfill: call this via the Convex dashboard or CLI to populate
 * the aggregate data structures for all existing transactions.
 */
export const backfillAggregates = internalMutation({
  handler: async (ctx) => {
    const all = await ctx.db.query('transactions').collect();
    let count = 0;
    for (const doc of all) {
      await txByType.insert(ctx, doc);
      count++;
    }
    return { backfilled: count };
  },
});

