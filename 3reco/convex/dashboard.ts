import { ConvexError, v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { query } from './_generated/server';
import { txByType, txByMaterial } from './aggregates';

function toDateString(ts: number): string {
  return new Date(ts).toISOString().split('T')[0];
}

/**
 * CO2 savings formula: (Baseline Activity - New Activity) * Carbon Factor
 * Baseline Activity = weight that would have gone to conventional disposal
 * New Activity      = 0 (all traded material is diverted from conventional disposal)
 * Result            = weight * carbonFactor
 */
function co2Savings(baselineActivity: number, newActivity: number, carbonFactor: string): number {
  const factor = Number(carbonFactor);
  if (isNaN(factor)) return 0;
  return (baselineActivity - newActivity) * factor;
}

function daysBetween(fromTs: number, toTs: number): string[] {
  const days: string[] = [];
  const start = new Date(fromTs);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(toTs);
  end.setUTCHours(23, 59, 59, 999);
  const max = Math.min(end.getTime(), start.getTime() + 365 * 24 * 60 * 60 * 1000);
  let current = start.getTime();
  while (current <= max) {
    days.push(new Date(current).toISOString().split('T')[0]);
    current += 24 * 60 * 60 * 1000;
  }
  return days;
}

function getUserDisplayName(
  user: {
    firstName?: string;
    lastName?: string;
    businessName?: string;
    email?: string;
  } | null
): string {
  if (!user) return 'Unknown';
  if (user.businessName) return user.businessName;
  if (user.firstName)
    return `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}`;
  return user.email ?? 'Unknown';
}

export const adminStats = query({
  args: {
    from: v.optional(v.number()),
    to: v.optional(v.number()),
  },
  handler: async (ctx, { from, to }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity)
      throw new ConvexError({ name: 'Unauthorized', message: 'You are not authorized to access this resource.' });

    const [userId] = identity.subject.split('|');
    const user = await ctx.db.get('users', userId as Id<'users'>);
    if (!user || (user.type !== 'admin' && user.type !== 'staff'))
      throw new ConvexError({ name: 'Unauthorized', message: 'You are not authorized to access this resource.' });

    const hasRange = from !== undefined && to !== undefined;
    const defaultChartFrom = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const chartFrom = hasRange ? from! : defaultChartFrom;
    const chartTo = hasRange ? to! : Date.now();

    // --- Totals via aggregates (O(log n)) ---
    const rangeBounds = hasRange
      ? { bounds: { lower: { key: from!, inclusive: true }, upper: { key: to!, inclusive: true } } }
      : {};

    const [c2bCount, b2bCount, c2bVolume, b2bVolume] = await Promise.all([
      txByType.count(ctx, { namespace: 'c2b', ...rangeBounds }),
      txByType.count(ctx, { namespace: 'b2b', ...rangeBounds }),
      txByType.sum(ctx, { namespace: 'c2b', ...rangeBounds }),
      txByType.sum(ctx, { namespace: 'b2b', ...rangeBounds }),
    ]);
    const totals = { c2bCount, b2bCount, c2bVolume, b2bVolume };

    // --- Latest 5 transactions ---
    // Scan most-recent first; bounded to avoid full table scan
    const recentScan = await ctx.db.query('transactions').order('desc').take(200);
    const filteredForLatest = hasRange
      ? recentScan.filter((t) => t._creationTime >= from! && t._creationTime <= to!)
      : recentScan;
    const latestTransactions = await Promise.all(
      filteredForLatest.slice(0, 5).map(async (t) => {
        const material = await ctx.db.get('materials', t.materialId);
        const seller = await ctx.db.get('users', t.sellerId);
        const buyer = await ctx.db.get('users', t.buyerId);
        return {
          _id: t._id,
          _creationTime: t._creationTime,
          type: t.type,
          weight: t.weight,
          price: t.price,
          materialName: material?.name ?? 'Unknown',
          sellerName: getUserDisplayName(seller),
          buyerName: getUserDisplayName(buyer),
        };
      })
    );

    // --- Daily chart: per-day counts via aggregates (O(log n) per bucket) ---
    const days = daysBetween(chartFrom, chartTo);
    const dayDataPromises = days.map(async (d) => {
      const dayStart = new Date(d + 'T00:00:00').getTime();
      const dayEnd = new Date(d + 'T23:59:59.999').getTime();
      const bounds = { bounds: { lower: { key: dayStart, inclusive: true }, upper: { key: dayEnd, inclusive: true } } };
      const [c2bCnt, b2bCnt, c2bVol, b2bVol] = await Promise.all([
        txByType.count(ctx, { namespace: 'c2b', ...bounds }),
        txByType.count(ctx, { namespace: 'b2b', ...bounds }),
        txByType.sum(ctx, { namespace: 'c2b', ...bounds }),
        txByType.sum(ctx, { namespace: 'b2b', ...bounds }),
      ]);
      return { date: d, c2bCount: c2bCnt, b2bCount: b2bCnt, c2bVolume: c2bVol, b2bVolume: b2bVol };
    });
    const dailyTransactions = await Promise.all(dayDataPromises);

    // --- Material volume via aggregates ---
    const allMaterials = await ctx.db.query('materials').collect();
    const materialVolumePromises = allMaterials.map(async (m) => {
      const vol = await txByMaterial.sum(ctx, { namespace: m._id, ...rangeBounds });
      return { materialName: m.name, totalWeight: vol };
    });
    const materialVolumeAll = await Promise.all(materialVolumePromises);
    const materialVolume = materialVolumeAll.filter((m) => m.totalWeight > 0);

    return { latestTransactions, dailyTransactions, totals, materialVolume };
  },
});

export const businessStats = query({
  args: {
    from: v.optional(v.number()),
    to: v.optional(v.number()),
  },
  handler: async (ctx, { from, to }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity)
      throw new ConvexError({ name: 'Unauthorized', message: 'You are not authorized to access this resource.' });

    const [userId] = identity.subject.split('|');
    const user = await ctx.db.get('users', userId as Id<'users'>);
    if (!user || user.type !== 'business')
      throw new ConvexError({ name: 'Unauthorized', message: 'You are not authorized to access this resource.' });

    const hasRange = from !== undefined && to !== undefined;
    const defaultChartFrom = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const [asBuyer, asSeller] = await Promise.all([
      ctx.db
        .query('transactions')
        .withIndex('by_buyerId', (q) => q.eq('buyerId', userId as Id<'users'>))
        .order('desc')
        .collect(),
      ctx.db
        .query('transactions')
        .withIndex('by_sellerId', (q) => q.eq('sellerId', userId as Id<'users'>))
        .order('desc')
        .collect(),
    ]);

    // Merge and sort all transactions newest-first
    const allTransactions = [...asBuyer, ...asSeller].sort(
      (a, b) => b._creationTime - a._creationTime
    );

    const filteredAll = hasRange
      ? allTransactions.filter((t) => t._creationTime >= from! && t._creationTime <= to!)
      : allTransactions;
    const filteredBuyer = hasRange
      ? asBuyer.filter((t) => t._creationTime >= from! && t._creationTime <= to!)
      : asBuyer;

    const chartFrom = hasRange ? from! : defaultChartFrom;
    const chartTo = hasRange ? to! : Date.now();
    const chartAll = allTransactions.filter(
      (t) => t._creationTime >= chartFrom && t._creationTime <= chartTo
    );

    const latestTransactions = await Promise.all(
      filteredAll.slice(0, 5).map(async (t) => {
        const material = await ctx.db.get('materials', t.materialId);
        const isBuy = t.buyerId === (userId as Id<'users'>);
        const counterparty = await ctx.db.get('users', isBuy ? t.sellerId : t.buyerId);
        return {
          _id: t._id,
          _creationTime: t._creationTime,
          type: t.type,
          weight: t.weight,
          price: t.price,
          materialName: material?.name ?? 'Unknown',
          counterpartyName: getUserDisplayName(counterparty),
          direction: isBuy ? ('buy' as const) : ('sell' as const),
        };
      })
    );

    const days = daysBetween(chartFrom, chartTo);
    const dayMap: Record<string, { count: number; volume: number }> = {};
    for (const d of days) dayMap[d] = { count: 0, volume: 0 };
    for (const t of chartAll) {
      const d = toDateString(t._creationTime);
      if (!dayMap[d]) continue;
      dayMap[d].count++;
      dayMap[d].volume += t.weight;
    }
    const dailyTransactions = days.map((d) => ({ date: d, ...dayMap[d] }));

    let carbonSavings = 0;
    for (const t of filteredAll) {
      const material = await ctx.db.get('materials', t.materialId);
      if (material) carbonSavings += co2Savings(t.weight, 0, material.carbonFactor);
    }

    const totals = {
      totalSpend: filteredBuyer.reduce((s, t) => s + t.price * t.weight, 0),
      totalVolume: filteredBuyer.reduce((s, t) => s + t.weight, 0),
      transactionCount: filteredBuyer.length,
    };

    const stockItems = await ctx.db
      .query('stock')
      .withIndex('by_ownerId', (q) => q.eq('ownerId', userId as Id<'users'>))
      .collect();
    const stockSummary = await Promise.all(
      stockItems.map(async (s) => {
        const material = await ctx.db.get('materials', s.materialId);
        return { _id: s._id, materialName: material?.name ?? 'Unknown', weight: s.weight, isListed: s.isListed };
      })
    );

    return { latestTransactions, dailyTransactions, carbonSavings, totals, stockSummary };
  },
});

export const collectorStats = query({
  args: {
    from: v.optional(v.number()),
    to: v.optional(v.number()),
  },
  handler: async (ctx, { from, to }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity)
      throw new ConvexError({ name: 'Unauthorized', message: 'You are not authorized to access this resource.' });

    const [userId] = identity.subject.split('|');
    const user = await ctx.db.get('users', userId as Id<'users'>);
    if (!user || user.type !== 'collector')
      throw new ConvexError({ name: 'Unauthorized', message: 'You are not authorized to access this resource.' });

    const hasRange = from !== undefined && to !== undefined;
    const defaultChartFrom = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const allSales = await ctx.db
      .query('transactions')
      .withIndex('by_sellerId', (q) => q.eq('sellerId', userId as Id<'users'>))
      .order('desc')
      .collect();

    const filteredSales = hasRange
      ? allSales.filter((t) => t._creationTime >= from! && t._creationTime <= to!)
      : allSales;

    const chartFrom = hasRange ? from! : defaultChartFrom;
    const chartTo = hasRange ? to! : Date.now();
    const chartTransactions = hasRange
      ? filteredSales
      : allSales.filter((t) => t._creationTime >= defaultChartFrom);

    const latestTransactions = await Promise.all(
      filteredSales.slice(0, 5).map(async (t) => {
        const material = await ctx.db.get('materials', t.materialId);
        const buyer = await ctx.db.get('users', t.buyerId);
        return {
          _id: t._id,
          _creationTime: t._creationTime,
          weight: t.weight,
          price: t.price,
          materialName: material?.name ?? 'Unknown',
          buyerName: getUserDisplayName(buyer),
        };
      })
    );

    const days = daysBetween(chartFrom, chartTo);
    const dayMap: Record<string, { count: number; volume: number }> = {};
    for (const d of days) dayMap[d] = { count: 0, volume: 0 };
    for (const t of chartTransactions) {
      const d = toDateString(t._creationTime);
      if (!dayMap[d]) continue;
      dayMap[d].count++;
      dayMap[d].volume += t.weight;
    }
    const dailyTransactions = days.map((d) => ({ date: d, ...dayMap[d] }));

    let carbonSavings = 0;
    for (const t of filteredSales) {
      const material = await ctx.db.get('materials', t.materialId);
      if (material) carbonSavings += co2Savings(t.weight, 0, material.carbonFactor);
    }

    const totals = {
      totalRevenue: filteredSales.reduce((s, t) => s + t.price * t.weight, 0),
      totalVolume: filteredSales.reduce((s, t) => s + t.weight, 0),
      transactionCount: filteredSales.length,
    };

    return { latestTransactions, dailyTransactions, carbonSavings, totals };
  },
});