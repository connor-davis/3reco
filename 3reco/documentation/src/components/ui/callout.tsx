import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

interface CalloutProps {
  type?: 'note' | 'tip' | 'warning' | 'danger'
  title?: string
  children: React.ReactNode
}

const calloutConfig = {
  note: {
    label: 'Note',
    className: 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40',
    badge: 'secondary' as const,
    titleClass: 'text-blue-800 dark:text-blue-300',
  },
  tip: {
    label: 'Tip',
    className: 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/40',
    badge: 'success' as const,
    titleClass: 'text-green-800 dark:text-green-300',
  },
  warning: {
    label: 'Warning',
    className: 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/40',
    badge: 'warning' as const,
    titleClass: 'text-yellow-800 dark:text-yellow-300',
  },
  danger: {
    label: 'Danger',
    className: 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/40',
    badge: 'destructive' as const,
    titleClass: 'text-red-800 dark:text-red-300',
  },
} as const

export function Callout({ type = 'note', title, children }: CalloutProps) {
  const config = calloutConfig[type]
  return (
    <div className={cn('my-6 rounded-2xl border p-5', config.className)}>
      <div className="mb-3 flex items-center gap-2">
        <Badge variant={config.badge}>{config.label}</Badge>
        {title && <span className={cn('text-sm font-semibold', config.titleClass)}>{title}</span>}
      </div>
      <div className="text-sm [&>p]:m-0 [&>p]:leading-relaxed">{children}</div>
    </div>
  )
}
