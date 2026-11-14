import { Link, useRouterState } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { BrandLogo } from '@/components/brand-logo';
import { IconButton } from '@/components/icon-button';
import { LinkButton } from '@/components/link-button';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { useAuth } from '@/lib/auth/use-auth';
import { AccountMenu } from './account-menu';
import { NotificationTray } from './notification-tray';
import { HeaderCart } from './header-cart';
import { WorkspacePicker } from './workspace-picker';
import { isRequestPath, pageTitleFor } from '@/lib/nav';
import { cn } from '@/lib/utils';

type TopbarProps = { onSearch: () => void };

export function Topbar({ onSearch }: TopbarProps) {
  const { user, isLoading } = useAuth();
  const role = isLoading ? undefined : (user?.role ?? null);
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const hasWorkspace = role === 'business' && !!user?.active_business_id;
  const phoneTitle =
    pathname.startsWith('/messages/') || isRequestPath(pathname);

  return (
    <header
      className={cn(
        'sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-4 sm:px-6',
        'bg-background/80 backdrop-blur-xl'
      )}
    >
      {/* Phones and tablets: the page has its own heading, so show the logo,
          except in a chat or request, which have no heading of their own. */}
      {hasWorkspace && (
        <div
          className={cn(
            'min-w-0 flex-1 lg:w-64 lg:flex-initial',
            phoneTitle && 'hidden lg:block'
          )}
        >
          <WorkspacePicker />
        </div>
      )}
      {phoneTitle ? (
        <p className="text-sm font-medium lg:hidden">
          {pageTitleFor(pathname, role)}
        </p>
      ) : !hasWorkspace ? (
        <Link to="/" aria-label="Home" className="lg:hidden">
          <BrandLogo className="h-8" />
        </Link>
      ) : null}

      <div className="ml-auto flex shrink-0 items-center gap-1">
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
            {role === 'business' && <HeaderCart />}
            <NotificationTray />
            <AccountMenu />
          </>
        )}
      </div>
    </header>
  );
}
