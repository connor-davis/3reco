import {
  Cylinder,
  GlassWater,
  type LucideIcon,
  Newspaper,
  Package,
  Star,
  Wrench,
} from 'lucide-react';
import { Avatar, AvatarBadge, AvatarFallback } from '@/components/ui/avatar';
import { initials } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Material } from '@/lib/types';

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

const categoryIcon: Record<Material['category'], LucideIcon> = {
  Plastic: Package,
  Paper: Newspaper,
  Metal: Cylinder,
  Glass: GlassWater,
};

const categoryTint: Record<Material['category'], string> = {
  Plastic: 'bg-muted',
  Paper: 'bg-muted',
  Metal: 'bg-muted',
  Glass: 'bg-muted',
};

type MaterialThumbProps = {
  category: Material['category'];
  // Picks a different icon and tint, for the gallery's three images.
  variant?: number;
  className?: string;
};

/** A drawn stand-in for a material photo. No network, only tokens. */
export function MaterialThumb({
  category,
  variant = 0,
  className,
}: MaterialThumbProps) {
  const Icon = variant === 1 ? Wrench : categoryIcon[category];
  const tint = categoryTint[category];

  return (
    <div
      aria-hidden="true"
      className={cn(
        'flex items-center justify-center text-muted-foreground',
        tint,
        className
      )}
    >
      <Icon className="size-1/3 min-h-6 min-w-6" strokeWidth={1.25} />
    </div>
  );
}
