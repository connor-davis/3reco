import { useConvexMutation, useConvexPaginatedQuery, useConvexQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import { useMutation } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  BellIcon,
  CheckCheckIcon,
  XIcon,
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { ScrollArea } from '../ui/scroll-area';
import { Separator } from '../ui/separator';

const TYPE_LABELS: Record<string, string> = {
  request_received: '📬',
  request_accepted: '✅',
  request_rejected: '❌',
  request_cancelled: '🚫',
  message_received: '💬',
  stock_listed: '📢',
  stock_unlisted: '📦',
};

export default function NotificationTray() {
  const unreadCount = useConvexQuery(api.notifications.unreadCount, {});
  const { results: notifications, isLoading, status, loadMore } = useConvexPaginatedQuery(
    api.notifications.listForUser,
    {},
    { initialNumItems: 20 }
  );

  const { mutate: markRead } = useMutation({ mutationFn: useConvexMutation(api.notifications.markRead) });
  const { mutate: markAllRead } = useMutation({ mutationFn: useConvexMutation(api.notifications.markAllRead) });
  const { mutate: dismiss } = useMutation({ mutationFn: useConvexMutation(api.notifications.dismiss) });
  const { mutate: dismissAll } = useMutation({ mutationFn: useConvexMutation(api.notifications.dismissAll) });

  const unread = notifications?.filter((n) => !n.read) ?? [];
  const read = notifications?.filter((n) => n.read) ?? [];

  return (
    <Popover>
      <PopoverTrigger className="relative inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent transition-colors">
        <BellIcon className="size-4" />
        {!!unreadCount && unreadCount > 0 && (
          <Badge
            variant="destructive"
            className="absolute -top-1 -right-1 min-w-[1.1rem] h-[1.1rem] p-0 flex items-center justify-center text-[0.6rem]"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </Badge>
        )}
      </PopoverTrigger>

      <PopoverContent side="right" align="end" sideOffset={8} className="w-[min(20rem,calc(100vw-1rem))] p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="font-semibold text-sm">Notifications</span>
          <div className="flex gap-1">
            {unread.length > 0 && (
              <Button variant="ghost" size="icon" className="size-7" title="Mark all as read" onClick={() => markAllRead({})}>
                <CheckCheckIcon className="size-3.5" />
              </Button>
            )}
            {notifications && notifications.length > 0 && (
              <Button variant="ghost" size="icon" className="size-7" title="Dismiss all" onClick={() => dismissAll({})}>
                <XIcon className="size-3.5" />
              </Button>
            )}
          </div>
        </div>

        <ScrollArea className="max-h-[420px]">
          {isLoading && (
            <p className="text-sm text-muted-foreground text-center py-6">Loading…</p>
          )}

          {!isLoading && notifications?.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No notifications</p>
          )}

          {unread.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground px-4 py-2 uppercase tracking-wide">Unread</p>
              {unread.map((n) => (
                <NotificationItem
                  key={n._id}
                  type={n.type}
                  title={n.title}
                  body={n.body}
                  link={n.link}
                  read={n.read}
                  onRead={() => markRead({ _id: n._id })}
                  onDismiss={() => dismiss({ _id: n._id })}
                />
              ))}
            </div>
          )}

          {unread.length > 0 && read.length > 0 && <Separator />}

          {read.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground px-4 py-2 uppercase tracking-wide">Read</p>
              {read.map((n) => (
                <NotificationItem
                  key={n._id}
                  type={n.type}
                  title={n.title}
                  body={n.body}
                  link={n.link}
                  read={n.read}
                  onRead={() => markRead({ _id: n._id })}
                  onDismiss={() => dismiss({ _id: n._id })}
                />
              ))}
            </div>
          )}

          {status === 'CanLoadMore' && (
            <div className="flex justify-center py-2">
              <Button variant="ghost" size="sm" onClick={() => loadMore(20)}>
                Load more
              </Button>
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function NotificationItem({
  type,
  title,
  body,
  link,
  read,
  onRead,
  onDismiss,
}: {
  type: string;
  title: string;
  body: string;
  link?: string;
  read: boolean;
  onRead: () => void;
  onDismiss: () => void;
}) {
  const emoji = TYPE_LABELS[type] ?? '🔔';

  const content = (
    <div
      className={`flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors ${!read ? 'bg-muted/30' : ''}`}
      onClick={() => { if (!read) onRead(); }}
    >
      <span className="text-base mt-0.5 shrink-0">{emoji}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-tight ${!read ? 'font-medium' : 'text-muted-foreground'}`}>{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{body}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-6 shrink-0 opacity-0 group-hover:opacity-100 hover:opacity-100"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); onDismiss(); }}
      >
        <XIcon className="size-3" />
      </Button>
    </div>
  );

  return (
    <div className="group cursor-pointer">
      {link ? <Link to={link as never}>{content}</Link> : content}
    </div>
  );
}
