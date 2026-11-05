import { useRouterState } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { IconButton } from '@/components/icon-button';
import { LinkButton } from '@/components/link-button';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Kbd } from '@/components/ui/kbd';
import { useMock } from '@/lib/mock/hooks';
import { AccountMenu } from './account-menu';
import { NotificationTray } from './notification-tray';
import { PreviewPill } from './preview-pill';
import { cn } from '@/lib/utils';

const titles: Record<string, string> = {
  '': 'Dashboard',
  about: 'About',
  cart: 'Your cart',
  collections: 'Collections',
  collectors: 'Collectors',
  materials: 'Materials',
  stock: 'Stock',
  market: 'Browse materials',
  messages: 'Messages',
  profile: 'Your profile',
  transactions: 'Transactions',
  admin: 'User management',
};

function titleFor(pathname: string): string {
  const [first = '', second = ''] = pathname.split('/').filter(Boolean);

  if (first === 'market' && second === 'incoming') return 'Incoming requests';
  if (first === 'market' && second === 'outgoing') return 'Outgoing requests';
  if (first === 'market' && second.startsWith('REQ-')) return 'Messages';
  if (first === 'transactions' && second) {
    return second === 'sales' ? 'Sales' : 'Purchases';
  }

  return titles[first] ?? 'Workspace';
}

type TopbarProps = { onSearch: () => void };

export function Topbar({ onSearch }: TopbarProps) {
  const { role } = useMock();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return (
    <header
      className={cn(
        'sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-4 sm:px-6',
        'bg-background/80 backdrop-blur-xl'
      )}
    >
      <Breadcrumb className="hidden sm:block">
        <BreadcrumbList>
          <BreadcrumbItem>Workspace</BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{titleFor(pathname)}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <p className="truncate text-sm font-medium sm:hidden">
        {titleFor(pathname)}
      </p>

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="secondary"
          className="hidden min-w-48 justify-between min-[1020px]:inline-flex"
          onClick={onSearch}
        >
          <span className="flex items-center gap-2 text-muted-foreground">
            <Search data-icon="inline-start" />
            Search
          </span>
          <Kbd>Ctrl K</Kbd>
        </Button>
        <IconButton
          label="Search"
          className="min-[1020px]:hidden"
          onClick={onSearch}
        >
          <Search />
        </IconButton>
        <PreviewPill variant="bar" className="min-[781px]:hidden" />
        <ThemeToggle />
        {role === 'signed-out' ? (
          <LinkButton to="/auth/sign-in">Sign in</LinkButton>
        ) : (
          <>
            <NotificationTray />
            <AccountMenu />
          </>
        )}
      </div>
    </header>
  );
}
