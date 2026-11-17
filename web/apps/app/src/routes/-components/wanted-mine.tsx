import { Link } from '@tanstack/react-router';
import { Megaphone } from 'lucide-react';
import { toast } from 'sonner';
import { DataState } from '@/components/data-state';
import { Panel } from '@/components/panel';
import { Button } from '@/components/ui/button';
import { errorText } from '@/components/transactions/pager-state';
import {
  useCloseWanted,
  useMyWanted,
  useWantedReplies,
  type WantedPost,
} from '@/lib/api/wanted';
import { formatDate, formatKg, formatRate, plural } from '@/lib/format';

const statusText: Record<WantedPost['status'], string> = {
  open: 'Open',
  filled: 'Filled',
  closed: 'Closed',
  expired: 'Expired',
};

/** The buyer's own posts, with replies and a close button. */
export function MyWanted() {
  const query = useMyWanted();
  const items = query.data?.items ?? [];

  return (
    <Panel title="Your wanted posts">
      <DataState
        query={query}
        isEmpty={!items.length}
        compact
        icon={Megaphone}
        emptyTitle="No wanted posts yet"
        emptyText="Post what you want and sellers can reply."
      >
        <div className="divide-y">
          {items.map((post) => (
            <MyPost key={post.id} post={post} />
          ))}
        </div>
      </DataState>
    </Panel>
  );
}

function MyPost({ post }: { post: WantedPost }) {
  const close = useCloseWanted();
  const live = post.status === 'open' || post.status === 'expired';
  const replies = useWantedReplies(post.id, post.reply_count > 0);

  return (
    <div className="space-y-2 py-4">
      <div className="flex flex-wrap items-start gap-2">
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
            {' · '}
            {statusText[post.status]}
            {post.status === 'open' && ` until ${formatDate(post.expires_at)}`}
          </p>
          <p className="text-sm">
            {post.reply_count
              ? `${post.reply_count} ${plural(post.reply_count, 'reply', 'replies')}`
              : 'No replies yet'}
          </p>
        </div>
        {live && (
          <Button
            variant="outline"
            className="min-h-11"
            disabled={close.isPending}
            onClick={() =>
              close.mutate(post.id, {
                onSuccess: () => toast.success('Wanted post closed.'),
                onError: (error) => toast.error(errorText(error)),
              })
            }
          >
            Close post
          </Button>
        )}
      </div>
      {(replies.data?.items ?? []).map((reply) => (
        <Link
          key={reply.request_id}
          to="/market/$requestId"
          params={{ requestId: reply.request_id }}
          className="block rounded-md border p-3 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="font-medium">{reply.seller.name}</span>
          <span className="text-sm text-muted-foreground">
            {' · '}
            {reply.status === 'offered'
              ? 'Offer sent. Open the chat.'
              : reply.status}
          </span>
        </Link>
      ))}
    </div>
  );
}
