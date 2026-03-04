import { Outlet } from '@tanstack/react-router'
import { MDXProvider } from '@mdx-js/react'
import { Github, Sun, Moon, Leaf } from 'lucide-react'
import { Sidebar } from './sidebar'
import { Button } from '@/components/ui/button'
import { mdxComponents } from '@/components/mdx/mdx-components'
import { useTheme } from '@/hooks/use-theme'

export function DocsLayout() {
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 h-16 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-full items-center justify-between px-4">
          {/* Logo */}
          <div className="flex items-center gap-2 font-bold text-lg">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Leaf size={16} className="text-primary-foreground" />
            </div>
            <span className="text-foreground">3reco</span>
            <span className="text-muted-foreground font-normal text-sm">docs</span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                window.open('https://github.com/yourusername/3reco', '_blank')
              }
              aria-label="GitHub"
            >
              <Github size={18} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </Button>
          </div>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────── */}
      <div className="flex pt-16">
        <Sidebar />

        {/* Content */}
        <main className="ml-64 min-h-[calc(100vh-4rem)] flex-1">
          <div className="mx-auto max-w-3xl px-8 py-10">
            <MDXProvider components={mdxComponents}>
              <Outlet />
            </MDXProvider>
          </div>
        </main>
      </div>
    </div>
  )
}
