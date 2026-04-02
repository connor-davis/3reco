import {
  useConvexMutation,
  useConvexPaginatedQuery,
  useConvexQuery,
} from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import { useMutation } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { BellIcon, CheckCheckIcon, XIcon } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';

const TYPE_LABELS: Record<string, string> = {
  request_received: 'Request received',
  request_accepted: 'Request accepted',
  request_rejected: 'Request rejected',
  request_cancelled: 'Request cancelled',
  message_received: 'New message',
  stock_listed: 'Stock listed',
  stock_unlisted: 'Stock unlisted',
};

export default function NotificationTray() {
  const unreadCount = useConvexQuery(api.notifications.unreadCount, {});
  const {
    results: notifications,
    isLoading,
    status,
    loadMore,
  } = useConvexPaginatedQuery(
    api.notifications.listForUser,
    {},
    { initialNumItems: 20 }
  );

  const { mutate: markRead } = useMutation({
    mutationFn: useConvexMutation(api.notifications.markRead),
  });
  const { mutate: markAllRead } = useMutation({
    mutationFn: useConvexMutation(api.notifications.markAllRead),
  });
  const { mutate: dismiss } = useMutation({
    mutationFn: useConvexMutation(api.notifications.dismiss),
  });
  const { mutate: dismissAll } = useMutation({
    mutationFn: useConvexMutation(api.notifications.dismissAll),
  });

  const unread = notifications?.filter((n) => !n.read) ?? [];
  const all = notifications ?? [];

  function renderList(items: typeof all) {
    if (isLoading)
      return (
        <p className="text-sm text-muted-foreground text-center py-6">
          Loading…
        </p>
      );
    if (items.length === 0)
      return (
        <p className="text-sm text-muted-foreground text-center py-6">
          No notifications
        </p>
      );
    return (
      <>
        {items.map((n) => (
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
        {status === 'CanLoadMore' && (
          <div className="flex justify-center py-2">
            <Button variant="ghost" size="sm" onClick={() => loadMore(20)}>
              Load more
            </Button>
          </div>
        )}
      </>
    );
  }

  return (
    <Popover>
      <PopoverTrigger className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border/80 bg-card text-muted-foreground shadow-[var(--shadow-soft)] transition-colors hover:border-primary/30 hover:bg-card hover:text-foreground">
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

      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={8}
        className="w-[min(22rem,calc(100vw-1rem))] p-0"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
       <span className="font-semibold text-sm">Notifications</span>
          <div className="flex gap-1">
            {unread.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                title="Mark all as read"
                onClick={() => markAllRead({})}
              >
                <CheckCheckIcon className="size-3.5" />
              </Button>
            )}
            {all.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                title="Dismiss all"
                onClick={() => dismissAll({})}
              >
                <XIcon className="size-3.5" />
              </Button>
            )}
          </div>
        </div>

        <Tabs defaultValue="all">
          <TabsList className="w-full rounded-none border-b px-4 justify-start gap-4 h-9 bg-transparent">
            <TabsTrigger
              value="all"
              className="text-xs px-0 pb-2 h-full border-b-2 border-transparent data-[selected]:border-primary data-[selected]:bg-transparent shadow-none"
            >
              All
            </TabsTrigger>
            <TabsTrigger
              value="unread"
              className="text-xs px-0 pb-2 h-full border-b-2 border-transparent data-[selected]:border-primary data-[selected]:bg-transparent shadow-none"
            >
              Unread{' '}
              {unread.length > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-1 text-[0.6rem] px-1 h-4"
                >
                  {unread.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          <TabsContent
            value="all"
            className="mt-0 max-h-[380px] overflow-y-auto"
          >
            {renderList(all)}
          </TabsContent>
          <TabsContent
            value="unread"
            className="mt-0 max-h-[380px] overflow-y-auto"
          >
            {renderList(unread)}
          </TabsContent>
        </Tabs>
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
  const label = TYPE_LABELS[type] ?? 'Notification';

  const content = (
    <div
      className={`flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors ${!read ? 'bg-muted/30' : ''}`}
      onClick={() => {
        if (!read) onRead();
      }}
    >
      <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
        {label
          .split(' ')
          .map((part) => part.charAt(0))
          .join('')
          .slice(0, 2)}
      </span>
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm leading-tight ${!read ? 'font-medium' : 'text-muted-foreground'}`}
        >
          {title}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{body}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-6 shrink-0 opacity-0 group-hover:opacity-100 hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onDismiss();
        }}
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
