import { useState, type ReactNode } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { cn } from '@/lib/utils';
import { Toaster } from '@/components/ui/sonner';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ImpactDialog } from '@/components/dialogs/impact-dialog';
import { AppSidebar } from './app-sidebar';
import { BottomTabs } from './bottom-tabs';
import { CommandSearch } from './command-search';
import { Topbar } from './topbar';
import { isAuthPath, isChatPath } from '@/lib/nav';

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
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const bare = isAuthPath(pathname);
  // Chat screens run edge to edge, like a messenger, so they skip the page padding.
  const chat = isChatPath(pathname);

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
        children
      ) : (
        <SidebarProvider>
          <AppSidebar />
          {/* SidebarInset already renders the page's one <main>. */}
          <SidebarInset
            id="main-content"
            tabIndex={-1}
            className="outline-none"
          >
            <Topbar onSearch={() => setSearchOpen(true)} />
            <div className={cn('w-full flex-1', chat ? chatPad : pagePad)}>
              {children}
            </div>
          </SidebarInset>
          <BottomTabs />
          <CommandSearch open={searchOpen} onOpenChange={setSearchOpen} />
        </SidebarProvider>
      )}
      <ImpactDialog />
      <Toaster position="top-center" />
    </TooltipProvider>
  );
}
