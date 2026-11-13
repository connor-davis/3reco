import { useState } from 'react';
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { MDXProvider } from '@mdx-js/react';
import { Sun, Moon, Menu, ChevronRight } from 'lucide-react';
import { Sidebar } from './sidebar';
import { BrandLogo } from './brand-logo';
import { Button } from '@/components/ui/button';
import { mdxComponents } from '@/components/mdx/mdx-components';
import { useTheme } from '@/hooks/use-theme';

export function DocsLayout() {
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const page = pathname.split('/').filter(Boolean).at(-1)?.replaceAll('-', ' ');

  return (
    <div className="min-h-svh bg-background text-foreground">
      <a
        href="#docs-content"
        className="sr-only z-50 rounded-md bg-background p-3 focus:not-sr-only focus:fixed focus:left-2 focus:top-2"
      >
        Skip to content
      </a>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="min-w-0 min-[781px]:ml-60">
        <header className="sticky top-0 z-50 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-xl sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="min-[781px]:hidden"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label="Toggle navigation"
            aria-expanded={sidebarOpen}
            aria-controls="docs-navigation"
          >
            <Menu size={18} />
          </Button>
          <Link
            to="/"
            className="flex min-w-0 items-center gap-2 rounded-md text-base font-semibold min-[781px]:hidden"
          >
            <BrandLogo />
            <span className="text-muted-foreground">Docs</span>
          </Link>
          <nav
            aria-label="Breadcrumb"
            className="hidden min-w-0 items-center gap-2 text-sm min-[781px]:flex"
          >
            <Link
              to="/"
              className="text-muted-foreground hover:text-foreground"
            >
              Docs
            </Link>
            <ChevronRight
              size={14}
              className="shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span
              aria-current="page"
              className="truncate font-medium capitalize"
            >
              {page}
            </span>
          </nav>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto shrink-0"
            onClick={toggleTheme}
            aria-label={
              theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
            }
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </Button>
        </header>

        {sidebarOpen && (
          <button
            type="button"
            className="fixed inset-x-0 top-14 bottom-0 z-30 bg-foreground/40 min-[781px]:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
          />
        )}

        <main id="docs-content" tabIndex={-1} className="min-w-0">
          <article className="docs-prose w-full px-4 py-8 sm:px-6 sm:py-10 lg:px-10">
            <MDXProvider components={mdxComponents}>
              <Outlet />
            </MDXProvider>
          </article>
        </main>
      </div>
    </div>
  );
}
