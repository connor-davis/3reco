import type { CSSProperties } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { Dashboard } from '@/lib/api/types';
import { formatKg, formatPercent } from '@/lib/format';

const TINTS = ['mint', 'peach', 'lilac', 'sky'] as const;

/**
 * The business phone home, shown below 768px: a mint greeting band, this
 * week's collections against last week, and the top materials as tiles.
 */
export function PhoneHome({
  name,
  week,
}: {
  name: string;
  week?: Dashboard['week'];
}) {
  const empty = !week || Number(week.this_kg) === 0;
  const trend = week && formatPercent(week.this_kg, week.last_kg);

  return (
    <div className="space-y-4 md:hidden">
      <div className="rounded-xl bg-mint px-4 py-5 text-mint-ink">
        <p className="text-sm">Hello,</p>
        <p className="text-xl font-semibold">{name}</p>
      </div>
      <Card>
        <CardContent className="space-y-1">
          <p className="text-sm text-muted-foreground">
            This week&apos;s collections
          </p>
          {empty ? (
            <p className="text-sm">No collections yet this week.</p>
          ) : (
            <p className="text-3xl font-semibold tabular-nums">
              {formatKg(week.this_kg)}
            </p>
          )}
          {week && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Last week {formatKg(week.last_kg)}</span>
              {trend && !empty && (
                <span
                  className={
                    'flex items-center gap-0.5 font-medium ' +
                    (trend.dir === 'up'
                      ? 'text-mint-ink'
                      : trend.dir === 'down'
                        ? 'text-rose-ink'
                        : '')
                  }
                >
                  {trend.dir === 'up' && (
                    <ArrowUp className="size-3" aria-hidden="true" />
                  )}
                  {trend.dir === 'down' && (
                    <ArrowDown className="size-3" aria-hidden="true" />
                  )}
                  {trend.label}
                </span>
              )}
            </p>
          )}
        </CardContent>
      </Card>
      {week && week.materials.length > 0 && (
        <ul className="grid grid-cols-2 gap-2">
          {week.materials.map((m, i) => (
            <li
              key={m.material_id}
              style={
                {
                  '--tint': `var(--${TINTS[i % 4]})`,
                  '--ink': `var(--${TINTS[i % 4]}-ink)`,
                } as CSSProperties
              }
              className="min-w-0 rounded-xl bg-[var(--tint)] p-3 text-[var(--ink)]"
            >
              <p className="truncate text-sm">{m.name}</p>
              <p className="text-lg font-semibold tabular-nums">
                {formatKg(m.weight)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
