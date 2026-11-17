import { Eye } from 'lucide-react';
import { DataState } from '@/components/data-state';
import { Panel } from '@/components/panel';
import { useSellerStats } from '@/lib/api/stats';
import { plural } from '@/lib/format';

/** Private listing performance, independent of whether any trades have settled. */
export function SellerStatsPanel() {
  const query = useSellerStats();
  const stats = query.data;
  const top = stats?.listings
    .filter((item) => item.views.days_30 > 0)
    .slice(0, 5);

  return (
    <Panel title="Listing views">
      <DataState
        query={query}
        icon={Eye}
        emptyTitle="No listing views yet"
        emptyText="Views from signed-in visitors will appear here."
        skeleton={<p role="status">Loading listing views…</p>}
      >
        {stats && (
          <div className="space-y-4">
            <dl className="grid grid-cols-3 gap-3">
              {(
                [
                  ['Last 7 days', stats.views.days_7],
                  ['Last 30 days', stats.views.days_30],
                  ['Lifetime', stats.views.lifetime],
                ] as const
              ).map(([label, count]) => (
                <div key={label}>
                  <dt className="text-sm text-muted-foreground">{label}</dt>
                  <dd className="text-xl font-semibold tabular-nums">
                    {count}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-sm text-muted-foreground">
              Each signed-in visitor counts once per listing per day in South
              Africa. Your team&apos;s views are excluded.
            </p>
            {top && top.length > 0 ? (
              <div>
                <h3 className="mb-2 text-sm font-medium">
                  Top listings in the last 30 days
                </h3>
                <ul className="divide-y">
                  {top.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-start justify-between gap-4 py-2 text-sm"
                    >
                      <span className="min-w-0 break-words">
                        {item.material_name}
                        {!item.is_listed && ' (unlisted)'}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {plural(item.views.days_30, 'view')}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No listing views in the last 30 days yet.
              </p>
            )}
            <div className="border-t pt-4 text-sm">
              {stats.replies.requests > 0 ? (
                <p>
                  You replied within a day to {stats.replies.within_day} of{' '}
                  {plural(stats.replies.requests, 'request')}.
                </p>
              ) : (
                <p>No requests received in the last 90 days yet.</p>
              )}
              <p className="mt-1 text-muted-foreground">
                Based on requests received in the last 90 days. Requests without
                a reply are included.
              </p>
            </div>
          </div>
        )}
      </DataState>
    </Panel>
  );
}
