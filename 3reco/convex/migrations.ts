import { Migrations } from '@convex-dev/migrations';
import { internalMutation } from './_generated/server';
import type { DataModel } from './_generated/dataModel';
import { components, internal } from './_generated/api';
import { txByType } from './aggregates';
import { getUserRole } from './users';

export const migrations = new Migrations<DataModel>(components.migrations);
export const run = migrations.runner();

/**
 * Step 1: Copy the legacy `type` field into the new `role` field.
 * Only updates documents that have `type` but no `role` yet.
 */
export const copyTypeToRole = migrations.define({
  table: 'users',
  migrateOne: async (ctx, user) => {
    const legacyRole = getUserRole({
      role: user.role,
      type: (user as Record<string, unknown>).type,
    });

    if (legacyRole && !user.role) {
      await ctx.db.patch(user._id, { role: legacyRole });
    }
  },
});

/**
 * Step 2: Remove the legacy `type` field from all user documents.
 * Run after copyTypeToRole completes.
 */
export const clearLegacyType = migrations.define({
  table: 'users',
  parallelize: true,
  migrateOne: () => ({ type: undefined }),
});

/** Run both migrations in order: copy role, then clear type. */
export const runUserRoleMigration = migrations.runner([
  internal.migrations.copyTypeToRole,
  internal.migrations.clearLegacyType,
]);

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

