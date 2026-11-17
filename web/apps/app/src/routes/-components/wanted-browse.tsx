import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Megaphone } from 'lucide-react';
import { DataState } from '@/components/data-state';
import { Panel } from '@/components/panel';
import { Button } from '@/components/ui/button';
import { useWantedBrowse, type WantedPost } from '@/lib/api/wanted';
import { formatDate, formatKg, formatRate } from '@/lib/format';
import { ReplyDialog } from './wanted-reply';

/** Open posts from other businesses, for a verified seller. */
export function WantedBrowse() {
  const [cursor, setCursor] = useState<string>();
  const [replying, setReplying] = useState<WantedPost | null>(null);
  const query = useWantedBrowse({ cursor }, true);
  const items = query.data?.items ?? [];

  return (
    <Panel
      title="Buyers want these"
      description="Reply with your price. Your stock is held for the buyer for 48 hours."
    >
      <DataState
        query={query}
        isEmpty={!items.length}
        icon={Megaphone}
        emptyTitle="Nothing wanted right now"
        emptyText="New posts from buyers show up here as they are made."
      >
        <div className="divide-y">
          {items.map((post) => (
            <div
              key={post.id}
              className="flex flex-wrap items-center gap-2 py-4"
            >
              <div className="min-w-0 flex-1">
                <p className="break-words font-medium">
                  {formatKg(post.weight)} of {post.material_name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {post.max_price
                    ? `Up to ${formatRate(post.max_price)}`
                    : 'Any price'}
                  {' · '}
                  {post.area}
                  {' · open until '}
                  {formatDate(post.expires_at)}
                </p>
              </div>
              {post.my_request_id ? (
                <Link
                  to="/market/$requestId"
                  params={{ requestId: post.my_request_id }}
                  className="min-h-11 rounded-md px-3 py-2 font-medium underline"
                >
                  You replied. Open the chat
                </Link>
              ) : (
                <Button className="min-h-11" onClick={() => setReplying(post)}>
                  Reply
                </Button>
              )}
            </div>
          ))}
        </div>
        {(cursor || query.data?.has_more) && (
          <div className="mt-4 flex gap-2">
            {cursor && (
              <Button variant="outline" onClick={() => setCursor(undefined)}>
                First page
              </Button>
            )}
            {query.data?.has_more && (
              <Button
                variant="outline"
                onClick={() => setCursor(query.data?.next_cursor ?? undefined)}
              >
                Next page
              </Button>
            )}
          </div>
        )}
      </DataState>
      <ReplyDialog post={replying} onClose={() => setReplying(null)} />
    </Panel>
  );
}
