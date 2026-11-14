import { PackageOpen } from 'lucide-react';
import { LinkButton } from '@/components/link-button';
import { Panel } from '@/components/panel';
import type { MaterialWeight } from '@/lib/api/types';
import { formatKg, toGrams } from '@/lib/format';

// The pastel inks, then a neutral for everything after the top four.
const INKS = [
  'var(--mint-ink)',
  'var(--peach-ink)',
  'var(--lilac-ink)',
  'var(--sky-ink)',
  'var(--muted-foreground)',
];

/** Top four materials by kg and the rest as "Other". Grams stay integers. */
export function groupStock(mix: MaterialWeight[]) {
  const rows = mix
    .map((m) => ({ name: m.name, grams: toGrams(m.weight) }))
    .filter((m) => m.grams > 0)
    .sort((a, b) => b.grams - a.grams);
  const top = rows.slice(0, 4);
  const other = rows.slice(4).reduce((sum, m) => sum + m.grams, 0);

  return other > 0 ? [...top, { name: 'Other', grams: other }] : top;
}

/** A ring of current stock by material, with the total and legend below it. */
export function StockMix({
  mix = [],
  all = false,
}: {
  mix?: MaterialWeight[];
  all?: boolean;
}) {
  const rows = groupStock(mix);
  const total = rows.reduce((sum, m) => sum + m.grams, 0);
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const ink = (i: number) => INKS[rows[i]?.name === 'Other' ? 4 : i];

  return (
    <Panel
      title="Stock mix"
      description={all ? 'Marketplace stock, by kg' : 'Your stock now, by kg'}
    >
      {total === 0 ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center text-sm text-muted-foreground">
          <PackageOpen className="size-8" aria-hidden="true" />
          <p>No stock yet.</p>
          {!all && (
            <LinkButton to="/stock" variant="outline">
              Add stock
            </LinkButton>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <svg
            viewBox="0 0 100 100"
            className="size-40 -rotate-90"
            role="img"
            aria-label="Stock by material"
          >
            {rows.map((row, i) => {
              const length = (row.grams / total) * circumference;
              const before = rows.slice(0, i).reduce((n, r) => n + r.grams, 0);
              return (
                <circle
                  key={row.name}
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="none"
                  stroke={ink(i)}
                  strokeWidth="14"
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={-(before / total) * circumference}
                />
              );
            })}
          </svg>
          <p className="text-lg font-semibold tabular-nums">
            {formatKg(total / 1000)} in stock
          </p>
          <ul className="grid w-full gap-1 text-sm">
            {rows.map((row, i) => (
              <li key={row.name} className="flex items-center gap-2">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: ink(i) }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate">{row.name}</span>
                <span className="tabular-nums text-muted-foreground">
                  {formatKg(row.grams / 1000)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
