import type { ReactNode } from 'react';
import { Link, type LinkProps } from '@tanstack/react-router';
import { ChevronRight, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';

type ListRowProps = {
  media?: ReactNode;
  title: string;
  subtitle?: ReactNode;
  meta?: ReactNode;
  value?: ReactNode;
  status?: ReactNode;
  onOpen?: () => void;
  to?: LinkProps['to'];
  params?: LinkProps['params'];
  'aria-label'?: string;
  trailing?: ReactNode;
  actions?: { label: string; onSelect: () => void; destructive?: boolean }[];
};

/** A compact list row whose primary tap and secondary controls are siblings. */
export function ListRow({
  media,
  title,
  subtitle,
  meta,
  value,
  status,
  onOpen,
  to,
  params,
  'aria-label': ariaLabel,
  trailing,
  actions = [],
}: ListRowProps) {
  const interactive = !!(onOpen || to);

  return (
    <div className="flex min-h-14 items-center bg-background">
      <Item
        className="min-h-14 min-w-0 flex-1 flex-nowrap gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:ring-inset"
        render={
          to ? (
            <Link to={to} params={params} aria-label={ariaLabel} />
          ) : onOpen ? (
            <button
              type="button"
              onClick={onOpen}
              aria-label={ariaLabel}
              className="cursor-pointer hover:bg-muted"
            />
          ) : undefined
        }
      >
        {media && (
          <ItemMedia className="size-10 self-center translate-y-0">
            {media}
          </ItemMedia>
        )}
        <ItemContent className="min-w-0 gap-0.5">
          <ItemTitle className="block w-full truncate">{title}</ItemTitle>
          {subtitle && (
            <ItemDescription className="line-clamp-none truncate">
              {subtitle}
            </ItemDescription>
          )}
          {meta && (
            <ItemDescription className="line-clamp-none truncate text-xs">
              {meta}
            </ItemDescription>
          )}
          {status && <div className="mt-1 flex flex-wrap gap-1">{status}</div>}
        </ItemContent>
        {value && (
          <span className="max-w-[45%] shrink-0 text-right font-semibold tabular-nums">
            {value}
          </span>
        )}
        {interactive && (
          <ChevronRight
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        )}
      </Item>
      {trailing && (
        <div className="flex min-h-11 shrink-0 items-center pr-2">
          {trailing}
        </div>
      )}
      {actions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="mr-1 min-h-11 min-w-11 shrink-0"
                aria-label={`More actions for ${title}`}
              />
            }
          >
            <MoreHorizontal aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {actions.map((action) => (
              <DropdownMenuItem
                key={action.label}
                className="min-h-11"
                variant={action.destructive ? 'destructive' : 'default'}
                onClick={action.onSelect}
              >
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
