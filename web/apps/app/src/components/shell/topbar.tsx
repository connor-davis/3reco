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
import { useAuth } from '@/lib/auth/use-auth';
import { AccountMenu } from './account-menu';
import { NotificationTray } from './notification-tray';
import { pageTitleFor } from '@/lib/nav';
import { cn } from '@/lib/utils';

type TopbarProps = { onSearch: () => void };

export function Topbar({ onSearch }: TopbarProps) {
  const { user } = useAuth();
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
          {pageTitleFor(pathname) !== 'Page not found' && (
            <>
              <BreadcrumbItem>Workspace</BreadcrumbItem>
              <BreadcrumbSeparator />
            </>
          )}
          <BreadcrumbItem>
            <BreadcrumbPage>{pageTitleFor(pathname)}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <p className="truncate text-sm font-medium sm:hidden">
        {pageTitleFor(pathname)}
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
        <ThemeToggle />
        {!user ? (
          <LinkButton to="/sign-in">Sign in</LinkButton>
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
