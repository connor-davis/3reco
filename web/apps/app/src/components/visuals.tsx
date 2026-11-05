import { Star } from 'lucide-react';
import { Avatar, AvatarBadge, AvatarFallback } from '@/components/ui/avatar';
import { initials } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Stars for display only. The label gives screen readers the number. */
export function Stars({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const filled = Math.round(value);

  return (
    <span
      role="img"
      aria-label={`${value} out of 5 stars`}
      className={cn('inline-flex gap-0.5', className)}
    >
      {Array.from({ length: 5 }, (_, index) => (
        <Star
          key={index}
          className={cn(
            'size-4',
            index < filled
              ? 'fill-chart-3 text-chart-3'
              : 'text-muted-foreground/40'
          )}
        />
      ))}
    </span>
  );
}

type PersonAvatarProps = {
  name: string;
  online?: boolean;
  className?: string;
};

/** Initials avatar with an optional green "online" dot. */
export function PersonAvatar({ name, online, className }: PersonAvatarProps) {
  return (
    <Avatar className={className}>
      <AvatarFallback>{initials(name)}</AvatarFallback>
      {online && <AvatarBadge className="bg-primary" aria-label="Online" />}
    </Avatar>
  );
}
