export type TradeType = 'c2b' | 'b2b';

// The one place a trade's type becomes words. Whether the business behind it is
// verified is shown beside the label, never folded into it.
export function tradeTypeLabel(type: TradeType): string {
  return type === 'c2b' ? 'Collector to business' : 'Business to business';
}
