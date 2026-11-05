import { TableAggregate } from '@convex-dev/aggregate';
import { components } from './_generated/api';
import type { DataModel } from './_generated/dataModel';

/**
 * Aggregates transactions by type (c2b / b2b).
 * - namespace: transaction type ('c2b' | 'b2b')
 * - sortKey: _creationTime (ms timestamp) — enables efficient time-range queries
 * - sumValue: total weight across all items (kg)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const txByType = new TableAggregate<{
  Namespace: string;
  Key: number;
  DataModel: DataModel;
  TableName: 'transactions';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}>((components as any).txByType, {
  namespace: (doc) => doc.type,
  sortKey: (doc) => doc._creationTime,
  sumValue: (doc) => doc.items.reduce((s, i) => s + i.weight, 0),
});
