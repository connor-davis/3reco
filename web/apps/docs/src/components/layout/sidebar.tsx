import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronDown, BookOpen, Server, Users, Zap, Code, HelpCircle, Terminal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'

interface SidebarProps {
  open?: boolean
  onClose?: () => void
}

interface NavItem {
  label: string
  to: string
}

interface NavGroup {
  label: string
  icon: React.ReactNode
  items: NavItem[]
}

interface SidebarGroupProps {
  group: NavGroup
  onNavClick?: () => void
}

const navGroups: NavGroup[] = [
  {
    label: 'Getting Started',
    icon: <BookOpen size={15} />,
    items: [
      { label: 'Introduction', to: '/docs/introduction' },
      { label: 'Setup & Installation', to: '/docs/setup' },
      { label: 'Environment Variables', to: '/docs/environment' },
    ],
  },
  {
    label: 'User Guide',
    icon: <HelpCircle size={15} />,
    items: [
      { label: 'Getting Started', to: '/docs/user/getting-started' },
      { label: 'Account Roles', to: '/docs/user/roles' },
      { label: 'Dashboard', to: '/docs/user/dashboard' },
      { label: 'Stock Management', to: '/docs/user/stock' },
      { label: 'Marketplace', to: '/docs/user/marketplace' },
      { label: 'Negotiations', to: '/docs/user/negotiations' },
      { label: 'Transactions', to: '/docs/user/transactions' },
      { label: 'Notifications', to: '/docs/user/notifications' },
      { label: 'Your Profile', to: '/docs/user/profile' },
    ],
  },
  {
    label: 'Developer Guide',
    icon: <Terminal size={15} />,
    items: [
      { label: 'Frontend Guide', to: '/docs/dev/frontend' },
      { label: 'Convex Functions', to: '/docs/dev/convex-functions' },
      { label: 'Aggregates', to: '/docs/dev/aggregates' },
      { label: 'Error Handling', to: '/docs/dev/error-handling' },
      { label: 'Notifications Pattern', to: '/docs/dev/notifications' },
      { label: 'Internal Actions', to: '/docs/dev/internal-actions' },
      { label: 'Deployment', to: '/docs/dev/deployment' },
    ],
  },
  {
    label: 'Architecture',
    icon: <Server size={15} />,
    items: [
      { label: 'Overview', to: '/docs/architecture' },
      { label: 'Database Schema', to: '/docs/schema' },
      { label: 'Authentication', to: '/docs/auth' },
    ],
  },
  {
    label: 'User Roles',
    icon: <Users size={15} />,
    items: [
      { label: 'Admin & Staff', to: '/docs/roles/admin' },
      { label: 'Business', to: '/docs/roles/business' },
      { label: 'Collector', to: '/docs/roles/collector' },
    ],
  },
  {
    label: 'Features',
    icon: <Zap size={15} />,
    items: [
      { label: 'Dashboard', to: '/docs/features/dashboard' },
      { label: 'Marketplace', to: '/docs/features/marketplace' },
      { label: 'Transactions', to: '/docs/features/transactions' },
      { label: 'Notifications', to: '/docs/features/notifications' },
      { label: 'Invoices', to: '/docs/features/invoices' },
      { label: 'Data Exports', to: '/docs/features/exports' },
    ],
  },
  {
    label: 'API Reference',
    icon: <Code size={15} />,
    items: [
      { label: 'Users', to: '/docs/api/users' },
      { label: 'Materials', to: '/docs/api/materials' },
      { label: 'Stock', to: '/docs/api/stock' },
      { label: 'Transactions', to: '/docs/api/transactions' },
      { label: 'Transaction Requests', to: '/docs/api/transaction-requests' },
    ],
  },
]

function SidebarGroup({ group, onNavClick }: SidebarGroupProps) {
  const [open, setOpen] = useState(true)

  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
      >
        {group.icon}
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronDown
          size={13}
          className={cn('transition-transform duration-200', open ? '' : '-rotate-90')}
        />
      </button>

      {open && (
        <div className="mt-0.5 space-y-0.5 pb-1">
          {group.items.map(item => (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavClick}
              className="block rounded-xl px-3.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
              activeProps={{
                className:
                  'block rounded-xl px-3.5 py-2 text-sm bg-accent text-accent-foreground font-medium',
              }}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export function Sidebar({ open = false, onClose }: SidebarProps) {
  return (
    <aside
      className={cn(
        'fixed top-16 left-0 h-[calc(100vh-4rem)] w-64 border-r bg-sidebar z-40 transition-transform duration-300',
        'lg:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      <ScrollArea className="h-full">
        <nav className="space-y-2 px-3 py-5">
          {navGroups.map(group => (
            <SidebarGroup key={group.label} group={group} onNavClick={onClose} />
          ))}
        </nav>
      </ScrollArea>
    </aside>
  )
}
