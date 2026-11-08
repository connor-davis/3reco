import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from 'react';
import { useRouter, useRouterState } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { Toaster } from '@/components/ui/sonner';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppSidebar } from './app-sidebar';
import { BottomTabs } from './bottom-tabs';
import { Topbar } from './topbar';
import { isAuthPath, isChatPath, pageTitleFor } from '@/lib/nav';
import { useLiveEvents } from '@/lib/live/use-live';
import { GuestOnly } from '@/lib/auth/guest-only';
import { useAuth } from '@/lib/auth/use-auth';
import { listenForSessionChanges } from '@/lib/api/auth';

const CommandSearch = lazy(() =>
  import('./command-search').then((module) => ({
    default: module.CommandSearch,
  }))
);

const chatPad = 'pb-[3.25rem] min-[781px]:pb-0';
const pagePad = cn(
  'mx-auto max-w-[1200px] px-4 pt-8 pb-28 sm:px-6',
  'min-[781px]:pb-24 lg:pt-10'
);

/**
 * The frame around every page: sidebar, top bar and phone tabs. Auth pages
 * draw their own full-screen layout, so they skip the frame.
 */
export function AppShell({ children }: { children: ReactNode }) {
  useLiveEvents();
  const { user } = useAuth();
  const client = useQueryClient();
  const router = useRouter();
  useEffect(
    () =>
      listenForSessionChanges(client, () => {
        void router.invalidate();
      }),
    [client, router]
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoaded, setSearchLoaded] = useState(false);
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const bare = isAuthPath(pathname);
  // Chat screens run edge to edge, like a messenger, so they skip the page padding.
  const chat = isChatPath(pathname);

  // Set the fallback before route effects apply the loaded store or listing name.
  useLayoutEffect(() => {
    document.title = `${pageTitleFor(pathname, user?.role ?? null)} · 3REco`;
  }, [pathname, user?.role]);

  // Keep the shortcut available before the search implementation has loaded.
  useEffect(() => {
    if (bare) return;
    function onKey(event: KeyboardEvent) {
      if (event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        setSearchLoaded(true);
        setSearchOpen((open) => !open);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bare]);

  return (
    <TooltipProvider>
      <a
        href="#main-content"
        className={cn(
          'sr-only z-50 rounded-md bg-background px-3 py-2 text-sm shadow-md',
          'focus:not-sr-only focus:fixed focus:top-2 focus:left-2'
        )}
      >
        Skip to content
      </a>
      {bare ? (
        <GuestOnly>{children}</GuestOnly>
      ) : (
        <SidebarProvider
          key={`${user?.id ?? 'signed-out'}:${user?.role ?? ''}`}
        >
          <AppSidebar />
          {/* SidebarInset already renders the page's one <main>. */}
          <SidebarInset
            id="main-content"
            tabIndex={-1}
            className="outline-none"
          >
            <Topbar
              onSearch={() => {
                setSearchLoaded(true);
                setSearchOpen(true);
              }}
            />
            <div className={cn('w-full flex-1', chat ? chatPad : pagePad)}>
              {children}
            </div>
          </SidebarInset>
          <BottomTabs />
          {searchLoaded && (
            <Suspense fallback={null}>
              <CommandSearch open={searchOpen} onOpenChange={setSearchOpen} />
            </Suspense>
          )}
        </SidebarProvider>
      )}
      <Toaster position="bottom-right" />
    </TooltipProvider>
  );
}
