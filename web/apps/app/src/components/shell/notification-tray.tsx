import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Bell } from 'lucide-react';
import { toast } from 'sonner';
import { IconButton } from '@/components/icon-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from '@/components/ui/item';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useIsMobile } from '@/hooks/use-mobile';
import { useMock, useMockList } from '@/lib/mock/hooks';

/** The bell. A popover on desktop, a bottom sheet on phones. */
export function NotificationTray() {
  const isMobile = useIsMobile();
  const mine = useMyNotices();
  const [open, setOpen] = useState(false);
  const unread = mine.filter((notice) => notice.unread).length;

  const bell = (
    <span className="relative">
      <Bell />
      {unread > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary ring-2 ring-background"
        />
      )}
    </span>
  );
  const label =
    unread > 0 ? `Notifications, ${unread} unread` : 'Notifications';

  if (isMobile) {
    return (
      <>
        <IconButton label={label} onClick={() => setOpen(true)}>
          {bell}
        </IconButton>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="max-h-[85dvh]">
            <SheetHeader>
              <SheetTitle>Notifications</SheetTitle>
              <SheetDescription>{unread} unread</SheetDescription>
            </SheetHeader>
            <TrayList onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<IconButton label={label} />}>
        {bell}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 gap-0 p-0">
        <div className="border-b p-4 font-medium">Notifications</div>
        <TrayList onNavigate={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

/** Only the notices meant for the signed-in role, so no link leads to a denied page. */
function useMyNotices() {
  const { role } = useMock();
  const notices = useMockList('notices');

  return notices.items.filter((notice) => notice.roles.includes(role));
}

function TrayList({ onNavigate }: { onNavigate: () => void }) {
  const navigate = useNavigate();
  const notices = useMockList('notices');
  const mine = useMyNotices();
  const [tab, setTab] = useState('all');

  const shown = mine.filter((notice) => tab === 'all' || notice.unread);

  // These only touch this role's notices, never another role's.
  function markAllRead() {
    mine.forEach((notice) => notices.update(notice.id, { unread: false }));
    toast.success('All notifications marked as read.');
  }

  function dismissAll() {
    mine.forEach((notice) => notices.remove(notice.id));
    toast.success('Notifications cleared.');
  }

  return (
    <div className="flex min-h-0 flex-col">
      <Tabs
        value={tab}
        onValueChange={(next) => setTab(String(next))}
        className="px-4 pt-3"
      >
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="unread">
            Unread
            <Badge variant="secondary">
              {mine.filter((notice) => notice.unread).length}
            </Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <ScrollArea className="max-h-80">
        {shown.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            You're all caught up.
          </p>
        ) : (
          <ul className="space-y-1 p-2">
            {shown.map((notice) => (
              <li key={notice.id}>
                <Item size="sm">
                  <ItemContent>
                    <ItemTitle>
                      {notice.unread && (
                        <span
                          className="size-2 rounded-full bg-primary"
                          aria-label="Unread"
                        />
                      )}
                      {notice.title}
                    </ItemTitle>
                    <ItemDescription>{notice.text}</ItemDescription>
                    <span className="text-xs text-muted-foreground">
                      {notice.time}
                    </span>
                  </ItemContent>
                  <ItemActions className="flex-col items-end">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => {
                        notices.update(notice.id, { unread: false });
                        onNavigate();
                        navigate({ to: notice.to });
                      }}
                    >
                      Open
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() =>
                        notices.update(notice.id, { unread: false })
                      }
                    >
                      Mark read
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => notices.remove(notice.id)}
                    >
                      Dismiss
                    </Button>
                  </ItemActions>
                </Item>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
      <div className="flex justify-between border-t p-2">
        <Button size="sm" variant="ghost" onClick={markAllRead}>
          Mark all read
        </Button>
        <Button size="sm" variant="ghost" onClick={dismissAll}>
          Dismiss all
        </Button>
      </div>
    </div>
  );
}
