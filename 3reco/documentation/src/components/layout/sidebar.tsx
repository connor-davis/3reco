import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronDown, BookOpen, Server, Users, Zap, Code, HelpCircle, Terminal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'

interface NavItem {
  label: string
  to: string
}

interface NavGroup {
  label: string
  icon: React.ReactNode
  items: NavItem[]
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

function SidebarGroup({ group }: { group: NavGroup }) {
  const [open, setOpen] = useState(true)

  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
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
              className="block rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
              activeProps={{
                className:
                  'block rounded-md px-3 py-1.5 text-sm bg-accent text-accent-foreground font-medium',
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

export function Sidebar() {
  return (
    <aside className="fixed top-16 left-0 h-[calc(100vh-4rem)] w-64 border-r bg-sidebar">
      <ScrollArea className="h-full">
        <nav className="px-3 py-4 space-y-1">
          {navGroups.map(group => (
            <SidebarGroup key={group.label} group={group} />
          ))}
        </nav>
      </ScrollArea>
    </aside>
  )
}
