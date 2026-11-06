import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface CalloutProps {
  type?: 'note' | 'tip' | 'warning' | 'danger';
  title?: string;
  children: React.ReactNode;
}

const calloutConfig = {
  note: {
    label: 'Note',
    className: 'border-border bg-muted',
    badge: 'secondary' as const,
    titleClass: 'text-foreground',
  },
  tip: {
    label: 'Tip',
    className: 'border-border bg-accent',
    badge: 'success' as const,
    titleClass: 'text-accent-foreground',
  },
  warning: {
    label: 'Warning',
    className:
      'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/40',
    badge: 'warning' as const,
    titleClass: 'text-yellow-800 dark:text-yellow-300',
  },
  danger: {
    label: 'Danger',
    className:
      'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/40',
    badge: 'destructive' as const,
    titleClass: 'text-red-800 dark:text-red-300',
  },
} as const;

export function Callout({ type = 'note', title, children }: CalloutProps) {
  const config = calloutConfig[type];
  return (
    <div className={cn('my-6 rounded-xl border p-5', config.className)}>
      <div className="mb-3 flex items-center gap-2">
        <Badge variant={config.badge}>{config.label}</Badge>
        {title && (
          <span className={cn('text-sm font-semibold', config.titleClass)}>
            {title}
          </span>
        )}
      </div>
      <div className="text-sm [&>p]:m-0 [&>p]:leading-relaxed">{children}</div>
    </div>
  );
}
