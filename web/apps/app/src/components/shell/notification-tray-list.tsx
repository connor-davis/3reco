import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Bell } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from '@/components/ui/item';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataState } from '@/components/data-state';
import { formatDate, formatTime } from '@/lib/format';
import {
  useNotifications,
  useUnreadCount,
  useReadNotification,
  useReadAllNotifications,
  useDismissNotification,
  useDismissAllNotifications,
} from '@/lib/api/notifications';

export default function TrayList({ onNavigate }: { onNavigate: () => void }) {
  const navigate = useNavigate();
  const [cursor, setCursor] = useState<string | undefined>();
  const notices = useNotifications({ cursor, limit: 50 });
  const count = useUnreadCount();
  const read = useReadNotification();
  const readAll = useReadAllNotifications();
  const dismiss = useDismissNotification();
  const dismissAll = useDismissAllNotifications();
  const [tab, setTab] = useState('all');
  const shown = (notices.data?.items ?? []).filter(
    (notice) => tab === 'all' || !notice.read
  );
  const pending =
    read.isPending ||
    readAll.isPending ||
    dismiss.isPending ||
    dismissAll.isPending;
  const error =
    read.error ?? readAll.error ?? dismiss.error ?? dismissAll.error;

  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <Tabs
        value={tab}
        onValueChange={(next) => setTab(String(next))}
        className="px-4 pt-3"
      >
        <TabsList>
          <TabsTrigger value="all" className="min-w-11">
            All
          </TabsTrigger>
          <TabsTrigger value="unread">
            Unread
            {!count.isError && count.data && (
              <Badge variant="secondary">{count.data.count}</Badge>
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="max-h-[min(28rem,60dvh)] min-h-0 min-w-0 overflow-x-hidden overflow-y-auto p-4 [&_[data-slot=empty]]:p-6 [&_[data-slot=empty-header]]:min-w-0">
        <DataState
          query={[notices, count]}
          isEmpty={shown.length === 0}
          icon={Bell}
          emptyTitle={
            tab === 'unread' ? 'No unread notifications.' : 'No notifications.'
          }
          emptyText="New updates will appear here."
        >
          <ul className="space-y-1 p-2">
            {shown.map((notice) => (
              <li key={notice.id}>
                <Item size="sm">
                  <ItemContent className="min-w-0">
                    <ItemTitle
                      className={`block w-full line-clamp-none break-words ${notice.read ? 'font-normal text-muted-foreground' : ''}`}
                    >
                      <span
                        className={`mr-2 inline-block size-2 rounded-full ${notice.read ? 'bg-transparent' : 'bg-primary'}`}
                        aria-label={notice.read ? undefined : 'Unread'}
                        aria-hidden={notice.read || undefined}
                      />
                      {notice.title}
                    </ItemTitle>
                    <ItemDescription
                      className={notice.read ? 'opacity-70' : undefined}
                    >
                      {notice.body}
                    </ItemDescription>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(notice.created_at)} ·{' '}
                      {formatTime(notice.created_at)}
                    </span>
                  </ItemContent>
                  <ItemActions className="w-full flex-wrap justify-start gap-x-4 gap-y-2">
                    {notice.link?.startsWith('/') &&
                      !notice.link.startsWith('//') && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() =>
                            read.mutate(notice.id, {
                              onSuccess: () => {
                                onNavigate();
                                void navigate({ to: notice.link! });
                              },
                            })
                          }
                        >
                          Open
                        </Button>
                      )}
                    {!notice.read && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => read.mutate(notice.id)}
                      >
                        Mark read
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => dismiss.mutate(notice.id)}
                    >
                      Dismiss
                    </Button>
                  </ItemActions>
                </Item>
              </li>
            ))}
          </ul>
        </DataState>
        {error && (
          <p role="alert" className="p-3 text-sm text-destructive">
            {error.message} Try again.
          </p>
        )}
        {(cursor || notices.data?.has_more) && (
          <div className="flex gap-2 p-3">
            {cursor && (
              <Button
                className="min-h-11"
                variant="outline"
                onClick={() => setCursor(undefined)}
              >
                First page
              </Button>
            )}
            <Button
              className="min-h-11"
              variant="outline"
              disabled={
                !notices.data?.has_more || notices.isFetching || notices.isError
              }
              onClick={() => setCursor(notices.data?.next_cursor ?? undefined)}
            >
              Next page
            </Button>
          </div>
        )}
      </div>
      {shown.length > 0 && (
        <div className="flex justify-between border-t p-2">
          <Button
            className="min-h-11"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              readAll.mutate(undefined, {
                onSuccess: () =>
                  toast.success('All notifications marked as read.'),
              })
            }
          >
            Mark all read
          </Button>
          <Button
            className="min-h-11"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              dismissAll.mutate(undefined, {
                onSuccess: () => toast.success('Notifications cleared.'),
              })
            }
          >
            Dismiss all
          </Button>
        </div>
      )}
    </div>
  );
}
