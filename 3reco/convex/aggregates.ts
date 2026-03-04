import { TableAggregate } from '@convex-dev/aggregate';
import { components } from './_generated/api';
import type { DataModel } from './_generated/dataModel';

/**
 * Aggregates transactions by type (c2b / b2b).
 * - namespace: transaction type ('c2b' | 'b2b')
 * - sortKey: _creationTime (ms timestamp) — enables efficient time-range queries
 * - sumValue: weight (kg) — enables O(log n) total-volume sums
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
  sumValue: (doc) => doc.weight,
});

/**
 * Aggregates transactions by material.
 * - namespace: materialId string
 * - sortKey: _creationTime
 * - sumValue: weight
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const txByMaterial = new TableAggregate<{
  Namespace: string;
  Key: number;
  DataModel: DataModel;
  TableName: 'transactions';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}>((components as any).txByMaterial, {
  namespace: (doc) => doc.materialId,
  sortKey: (doc) => doc._creationTime,
  sumValue: (doc) => doc.weight,
});
