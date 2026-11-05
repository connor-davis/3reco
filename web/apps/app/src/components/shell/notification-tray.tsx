import { lazy, Suspense, useState } from 'react';
import { Bell } from 'lucide-react';
import { IconButton } from '@/components/icon-button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { useUnreadCount } from '@/lib/api/notifications';

const TrayList = lazy(() => import('./notification-tray-list'));

/** The bell. A popover on desktop, a bottom sheet on phones. */
export function NotificationTray() {
  const isMobile = useIsMobile();
  const count = useUnreadCount();
  const [open, setOpen] = useState(false);
  const unread = !count.isError ? (count.data?.count ?? 0) : 0;

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
              <SheetDescription>
                {count.isError
                  ? 'Unread count unavailable.'
                  : count.isPending
                    ? 'Loading notifications…'
                    : unread + ' unread'}
              </SheetDescription>
            </SheetHeader>
            {open && (
              <Suspense
                fallback={
                  <p role="status" className="p-4">
                    Loading notifications...
                  </p>
                }
              >
                <TrayList onNavigate={() => setOpen(false)} />
              </Suspense>
            )}
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
        {open && (
          <Suspense
            fallback={
              <p role="status" className="p-4">
                Loading notifications...
              </p>
            }
          >
            <TrayList onNavigate={() => setOpen(false)} />
          </Suspense>
        )}
      </PopoverContent>
    </Popover>
  );
}
