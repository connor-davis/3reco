import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Link, type LinkProps } from '@tanstack/react-router';
import { MoreHorizontal } from 'lucide-react';
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
  /** A small mark after the title, such as the verified check. */
  titleMark?: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  value?: ReactNode;
  status?: ReactNode;
  /** Three-line ledger layout for trades and requests. */
  layout?: 'default' | 'record';
  secondaryValue?: ReactNode;
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
  titleMark,
  subtitle,
  meta,
  value,
  status,
  layout = 'default',
  secondaryValue,
  onOpen,
  to,
  params,
  'aria-label': ariaLabel,
  trailing,
  actions = [],
}: ListRowProps) {
  return (
    <div className="flex min-h-14 items-center">
      <Item
        className={cn(
          'min-h-14 min-w-0 flex-1 flex-nowrap gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:ring-inset',
          layout === 'record' && 'px-0'
        )}
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
        {layout === 'record' ? (
          <ItemContent className="min-w-0 gap-1" data-slot="record-row">
            <div
              className="flex min-w-0 items-baseline justify-between gap-2"
              data-slot="record-primary"
            >
              <span className="min-w-0 truncate text-sm font-medium">
                {title}
              </span>
              <span className="shrink-0 text-right text-sm font-semibold tabular-nums">
                {value}
              </span>
            </div>
            <div
              className="flex min-w-0 items-start justify-between gap-2"
              data-slot="record-parties"
            >
              <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                {subtitle}
              </span>
              <span className="shrink-0 text-right text-xs tabular-nums">
                {secondaryValue}
              </span>
            </div>
            <div
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
              data-slot="record-meta"
            >
              <span className="whitespace-nowrap">{meta}</span>
              <span className="inline-flex shrink-0 items-center gap-1.5 [&_[data-slot=badge]]:h-4 [&_[data-slot=badge]]:min-h-0 [&_[data-slot=badge]]:px-1 [&_[data-slot=badge]]:text-[10px]">
                {status}
              </span>
            </div>
          </ItemContent>
        ) : (
          <ItemContent className="min-w-0 gap-0.5">
            <ItemTitle className="flex w-full flex-wrap items-center gap-2">
              <span className="min-w-0 truncate">{title}</span>
              {titleMark}
              {status && (
                <span className="inline-flex flex-wrap gap-1 text-xs [&_[data-slot=badge]]:min-h-5 [&_[data-slot=badge]]:px-2 [&_[data-slot=badge]]:text-xs">
                  {status}
                </span>
              )}
            </ItemTitle>
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
          </ItemContent>
        )}
        {layout !== 'record' && value && (
          <span className="max-w-[45%] shrink-0 text-right font-semibold tabular-nums">
            {value}
          </span>
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
