import { useState } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { Info, Menu, UserCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { navFor, tabsFor, type NavLink } from '@/lib/nav';
import { useAuth } from '@/lib/auth/use-auth';
import { cn } from '@/lib/utils';
import { useBadgeCounts } from './use-badge-counts';

const tabClass = cn(
  'relative flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5',
  'text-xs font-medium text-muted-foreground outline-none',
  'focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:text-foreground'
);

const navClass = cn(
  'fixed inset-x-0 bottom-0 z-30 border-t bg-background/95',
  'pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden'
);

const raisedClass =
  '-mt-5 size-11 rounded-full bg-primary text-primary-foreground shadow-md';

/** Phone and tablet navigation below 1024px, with tabs for the caller's role. */
export function BottomTabs() {
  const role = useAuth().user?.role ?? null;
  const [moreOpen, setMoreOpen] = useState(false);
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const counts = useBadgeCounts();
  // "More" takes the Account tab's place; the account link lives in the sheet.
  const tabs = tabsFor(role).filter((tab) => tab.label !== 'Account');

  function current(to: string) {
    if (to === '/') return pathname === '/';
    return pathname === to || pathname.startsWith(`${to}/`);
  }

  return (
    <nav aria-label="Main" className={navClass}>
      <ul className="flex h-[52px] items-stretch justify-around">
        {tabs.map((tab) => (
          <li key={tab.to} className="flex flex-1">
            <Link
              to={tab.to}
              aria-current={current(tab.to) ? 'page' : undefined}
              className={cn(tabClass, tab.raised && 'text-foreground')}
            >
              <span
                className={cn(
                  'flex items-center justify-center',
                  tab.raised && raisedClass
                )}
              >
                <tab.icon className="size-5" aria-hidden="true" />
              </span>
              <span>{tab.label}</span>
              {tab.badge && counts[tab.badge] > 0 && (
                <Badge className="absolute top-1 left-1/2 ml-2 h-4 min-w-4 px-1">
                  {counts[tab.badge]}
                </Badge>
              )}
            </Link>
          </li>
        ))}
        <li className="flex flex-1">
          <Button
            variant="ghost"
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className={cn(tabClass, 'h-auto rounded-none')}
            onClick={() => setMoreOpen(true)}
          >
            <Menu className="size-5" aria-hidden="true" />
            <span>More</span>
          </Button>
        </li>
      </ul>
      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} />
    </nav>
  );
}

type SheetProps = { open: boolean; onOpenChange: (open: boolean) => void };

/** Every sidebar destination, so nothing is out of reach on a phone. */
function MoreSheet({ open, onOpenChange }: SheetProps) {
  const { user } = useAuth();
  const role = user?.role ?? null;
  const account: NavLink = {
    label: 'My account',
    to: '/profile',
    icon: UserCircle,
  };
  const about: NavLink = { label: 'About 3REco', to: '/about', icon: Info };
  const groups = [
    ...(user ? [{ links: [account] }] : []),
    ...navFor(role, user?.business_role, user?.active_business_id),
    { links: [about] },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>More</SheetTitle>
          <SheetDescription>Every page you can open.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {groups.map((group, index) => (
            <div key={group.label ?? index}>
              {group.label && (
                <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">
                  {group.label}
                </p>
              )}
              <ul>
                {group.links.map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      onClick={() => onOpenChange(false)}
                      className={cn(
                        'flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm',
                        'hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
                        'outline-none'
                      )}
                    >
                      <link.icon className="size-4" aria-hidden="true" />
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
