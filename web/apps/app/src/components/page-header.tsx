import {
  Children,
  Fragment,
  isValidElement,
  type ReactNode,
  type ReactElement,
} from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

type PageHeaderProps = {
  title: string;
  description?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  compactActionsBelow?: boolean;
};

/** h1, wrapping help, an optional badge, and the page's actions on the right. */
export function PageHeader({
  title,
  description,
  badge,
  actions,
  compactActionsBelow = true,
}: PageHeaderProps) {
  const items = Children.toArray(actions).flatMap((child) =>
    isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment
      ? Children.toArray(child.props.children)
      : [child]
  );

  return (
    <header
      className={cn(
        'mb-6 flex items-start justify-between gap-4',
        compactActionsBelow && 'max-md:flex-col'
      )}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-[26px] font-semibold tracking-[-0.035em] lg:text-4xl">
            {title}
          </h1>
          {badge}
        </div>
        {description && (
          <p className="max-w-[56ch] text-[15px] text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {items.length > 0 && (
        <div
          className={cn(
            compactActionsBelow &&
              'max-md:w-full max-md:[&>:first-child:not([aria-label])]:min-w-0 max-md:[&>:first-child:not([aria-label])]:flex-1',
            'flex shrink-0 items-center gap-2 [&>*]:min-h-11 [&>button[aria-label]]:max-md:w-11 [&>button[aria-label]]:max-md:shrink-0'
          )}
        >
          {items[0]}
          {items.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon" aria-label="More" />
                }
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="[&>*]:flex [&>*]:w-full [&>*]:justify-start"
              >
                {items
                  .slice(1)
                  .map((item, index) =>
                    isValidElement(item) ? (
                      <DropdownMenuItem
                        key={item.key ?? index}
                        render={item as ReactElement}
                      />
                    ) : null
                  )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </header>
  );
}

type SectionProps = {
  title?: ReactNode;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  panel?: boolean;
};

/** A shared section heading, optional action and soft panel surface. */
export function Section({
  title,
  description,
  action,
  children,
  panel = false,
}: SectionProps) {
  return (
    <section
      className={cn(
        panel
          ? 'rounded-2xl border bg-card p-4 shadow-[var(--shadow)] lg:p-6 dark:shadow-none'
          : 'mt-6'
      )}
    >
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold tracking-tight">{title}</h2>
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
